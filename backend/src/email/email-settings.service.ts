import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  EmailSecretsCryptoService,
  EncryptedPayload,
  SecretFingerprint,
} from './email-secrets-crypto.service';

const EMAIL_CONNECTOR_SETTINGS_KEY = 'EMAIL_CONNECTOR_CONFIG';
const LEGACY_EMAIL_SMTP_SETTINGS_KEY = 'EMAIL_SMTP_CONFIG';

export type EmailConnectorType = 'SMTP' | 'AWS_SES';
export type EmailSettingsSource = 'database' | 'environment' | 'default';

export interface SmtpRuntimeSettings {
  connectorType: 'SMTP';
  source: EmailSettingsSource;
  host: string;
  port: number;
  user: string | null;
  pass: string | null;
  from: string;
}

export interface AwsSesRuntimeSettings {
  connectorType: 'AWS_SES';
  source: EmailSettingsSource;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string | null;
  endpoint: string | null;
  from: string;
}

export type RuntimeEmailSettings = SmtpRuntimeSettings | AwsSesRuntimeSettings;

export interface EmailSettingsSummary {
  connectorType: EmailConnectorType;
  connectorLabel: string;
  source: EmailSettingsSource;
  configured: boolean;
  senderConfigured: boolean;
  credentialsConfigured: boolean;
  secretConfigured: boolean;
  transportSecurity: 'TLS_VERIFIED' | 'LOCAL_DEFAULT';
}

export interface SaveSmtpSettingsInput {
  connectorType: 'SMTP';
  host: string;
  port: number;
  user?: string | null;
  password?: string | null;
  clearSecret?: boolean;
  from: string;
}

export interface SaveAwsSesSettingsInput {
  connectorType: 'AWS_SES';
  region: string;
  accessKeyId: string;
  secretAccessKey?: string | null;
  sessionToken?: string | null;
  endpoint?: string | null;
  clearSecret?: boolean;
  clearSessionToken?: boolean;
  from: string;
}

export type SaveEmailSettingsInput =
  | SaveSmtpSettingsInput
  | SaveAwsSesSettingsInput;

interface StoredEmailConnectorRecord {
  version: 1;
  connectorType: EmailConnectorType;
  encryptedConfig: EncryptedPayload;
  fingerprint: SecretFingerprint;
}

@Injectable()
export class EmailSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cryptoService: EmailSecretsCryptoService,
  ) {}

  async getEffectiveSettings(): Promise<EmailSettingsSummary> {
    return this.toSummary(await this.getRuntimeSettings());
  }

  async getRuntimeSettings(): Promise<RuntimeEmailSettings> {
    const stored = await this.getStoredSettings();
    if (stored) {
      return stored;
    }

    const envConnector =
      this.configService.get<string>('MAIL_CONNECTOR')?.trim().toUpperCase() ||
      this.inferEnvironmentConnector();

    if (envConnector === 'AWS_SES') {
      const runtime = this.readAwsSesEnvironment();
      if (runtime) {
        return runtime;
      }
    }

    const smtpEnv = this.readSmtpEnvironment();
    if (smtpEnv) {
      return smtpEnv;
    }

    return {
      connectorType: 'SMTP',
      host: 'mailpit',
      port: 1025,
      user: null,
      pass: null,
      from:
        this.configService.get<string>('MAIL_FROM')?.trim() ||
        '"Mecerka" <no-reply@mecerka.local>',
      source: 'default',
    };
  }

  async saveSettings(
    input: SaveEmailSettingsInput,
    actorId: string,
  ): Promise<EmailSettingsSummary> {
    const previousStored = await this.getStoredSettings();
    const next =
      input.connectorType === 'AWS_SES'
        ? this.normalizeAwsSesInput(
            input,
            previousStored?.connectorType === 'AWS_SES' ? previousStored : null,
          )
        : this.normalizeSmtpInput(
            input,
            previousStored?.connectorType === 'SMTP' ? previousStored : null,
          );

    const record: StoredEmailConnectorRecord = {
      version: 1,
      connectorType: next.connectorType,
      encryptedConfig: this.cryptoService.encryptJson(
        next as unknown as Record<string, unknown>,
      ),
      fingerprint: this.cryptoService.fingerprintJson(
        next as unknown as Record<string, unknown>,
      ),
    };

    const systemSetting = (this.prisma as PrismaClient).systemSetting;

    await systemSetting.upsert({
      where: { key: EMAIL_CONNECTOR_SETTINGS_KEY },
      create: {
        key: EMAIL_CONNECTOR_SETTINGS_KEY,
        value: record as unknown as Prisma.InputJsonValue,
        updatedById: actorId,
      },
      update: {
        value: record as unknown as Prisma.InputJsonValue,
        updatedById: actorId,
      },
    });

    await systemSetting.deleteMany({
      where: { key: LEGACY_EMAIL_SMTP_SETTINGS_KEY },
    });

    return this.toSummary({
      ...next,
      source: 'database',
    });
  }

  private toSummary(settings: RuntimeEmailSettings): EmailSettingsSummary {
    const connectorLabel =
      settings.connectorType === 'AWS_SES' ? 'AWS SES' : 'SMTP';
    const credentialsConfigured =
      settings.connectorType === 'AWS_SES'
        ? Boolean(settings.accessKeyId && settings.secretAccessKey)
        : Boolean(settings.user && settings.pass);
    const secretConfigured =
      settings.connectorType === 'AWS_SES'
        ? Boolean(settings.secretAccessKey)
        : Boolean(settings.pass);

    return {
      connectorType: settings.connectorType,
      connectorLabel,
      source: settings.source,
      configured:
        settings.connectorType === 'AWS_SES'
          ? Boolean(settings.region && settings.from && credentialsConfigured)
          : Boolean(settings.host && settings.from),
      senderConfigured: Boolean(settings.from),
      credentialsConfigured,
      secretConfigured,
      transportSecurity:
        settings.source === 'default' &&
        settings.connectorType === 'SMTP' &&
        settings.host === 'mailpit'
          ? 'LOCAL_DEFAULT'
          : 'TLS_VERIFIED',
    };
  }

  private async getStoredSettings(): Promise<RuntimeEmailSettings | null> {
    const systemSetting = (this.prisma as PrismaClient).systemSetting;
    const setting = await systemSetting.findUnique({
      where: { key: EMAIL_CONNECTOR_SETTINGS_KEY },
    });

    const parsed = this.parseStoredConnectorRecord(setting?.value);
    if (parsed) {
      const decrypted = this.cryptoService.decryptJson<Record<string, unknown>>(
        parsed.encryptedConfig,
      );

      if (
        !this.cryptoService.verifyFingerprint(decrypted, parsed.fingerprint)
      ) {
        throw new Error('Stored email connector fingerprint mismatch');
      }

      return this.hydrateDecryptedConfig(parsed.connectorType, decrypted);
    }

    return this.getLegacyStoredSmtpSettings();
  }

  private async getLegacyStoredSmtpSettings(): Promise<SmtpRuntimeSettings | null> {
    const systemSetting = (this.prisma as PrismaClient).systemSetting;
    const setting = await systemSetting.findUnique({
      where: { key: LEGACY_EMAIL_SMTP_SETTINGS_KEY },
    });

    if (
      !setting ||
      typeof setting.value !== 'object' ||
      setting.value === null
    ) {
      return null;
    }

    const value = setting.value as Record<string, unknown>;
    const host =
      typeof value.host === 'string' && value.host.trim().length > 0
        ? value.host.trim()
        : null;
    const from =
      typeof value.from === 'string' && value.from.trim().length > 0
        ? value.from.trim()
        : null;
    const port =
      typeof value.port === 'number'
        ? value.port
        : typeof value.port === 'string'
          ? Number(value.port)
          : NaN;

    if (!host || !from || !Number.isFinite(port)) {
      return null;
    }

    return {
      connectorType: 'SMTP',
      source: 'database',
      host,
      port,
      user:
        typeof value.user === 'string' && value.user.trim().length > 0
          ? value.user.trim()
          : null,
      pass:
        typeof value.pass === 'string' && value.pass.length > 0
          ? value.pass
          : null,
      from,
    };
  }

  private parseStoredConnectorRecord(
    rawValue: unknown,
  ): StoredEmailConnectorRecord | null {
    if (!rawValue || typeof rawValue !== 'object') {
      return null;
    }

    const value = rawValue as Record<string, unknown>;

    if (value.connectorType !== 'SMTP' && value.connectorType !== 'AWS_SES') {
      return null;
    }

    const encryptedConfig = value.encryptedConfig;
    const fingerprint = value.fingerprint;

    if (
      !encryptedConfig ||
      typeof encryptedConfig !== 'object' ||
      !fingerprint ||
      typeof fingerprint !== 'object'
    ) {
      return null;
    }

    return {
      version: 1,
      connectorType: value.connectorType,
      encryptedConfig: encryptedConfig as EncryptedPayload,
      fingerprint: fingerprint as SecretFingerprint,
    };
  }

  private hydrateDecryptedConfig(
    connectorType: EmailConnectorType,
    value: Record<string, unknown>,
  ): RuntimeEmailSettings {
    if (connectorType === 'AWS_SES') {
      const region = this.requireString(value.region, 'region');
      const accessKeyId = this.requireString(value.accessKeyId, 'accessKeyId');
      const secretAccessKey = this.requireString(
        value.secretAccessKey,
        'secretAccessKey',
      );

      return {
        connectorType: 'AWS_SES',
        source: 'database',
        region,
        accessKeyId,
        secretAccessKey,
        sessionToken:
          typeof value.sessionToken === 'string' &&
          value.sessionToken.length > 0
            ? value.sessionToken
            : null,
        endpoint:
          typeof value.endpoint === 'string' && value.endpoint.trim().length > 0
            ? value.endpoint.trim()
            : null,
        from: this.requireString(value.from, 'from'),
      };
    }

    return {
      connectorType: 'SMTP',
      source: 'database',
      host: this.requireString(value.host, 'host'),
      port: this.requirePort(value.port),
      user:
        typeof value.user === 'string' && value.user.trim().length > 0
          ? value.user.trim()
          : null,
      pass:
        typeof value.pass === 'string' && value.pass.length > 0
          ? value.pass
          : null,
      from: this.requireString(value.from, 'from'),
    };
  }

  private normalizeSmtpInput(
    input: SaveSmtpSettingsInput,
    previous: SmtpRuntimeSettings | null,
  ): Omit<SmtpRuntimeSettings, 'source'> {
    const host = this.requireTrimmed(input.host, 'host');
    const from = this.requireTrimmed(input.from, 'from');
    const port = this.requirePort(input.port);
    const user = input.user?.trim() || null;
    const pass = input.clearSecret
      ? null
      : input.password && input.password.length > 0
        ? input.password
        : (previous?.pass ?? null);

    return {
      connectorType: 'SMTP',
      host,
      port,
      user,
      pass,
      from,
    };
  }

  private normalizeAwsSesInput(
    input: SaveAwsSesSettingsInput,
    previous: AwsSesRuntimeSettings | null,
  ): Omit<AwsSesRuntimeSettings, 'source'> {
    const region = this.requireTrimmed(input.region, 'region');
    const accessKeyId = this.requireTrimmed(input.accessKeyId, 'accessKeyId');
    const from = this.requireTrimmed(input.from, 'from');
    const secretAccessKey = input.clearSecret
      ? null
      : input.secretAccessKey && input.secretAccessKey.length > 0
        ? input.secretAccessKey
        : (previous?.secretAccessKey ?? null);

    if (!secretAccessKey) {
      throw new BadRequestException(
        'AWS SES requires a secret access key or an existing stored secret',
      );
    }

    return {
      connectorType: 'AWS_SES',
      region,
      accessKeyId,
      secretAccessKey,
      sessionToken: input.clearSessionToken
        ? null
        : input.sessionToken && input.sessionToken.length > 0
          ? input.sessionToken
          : (previous?.sessionToken ?? null),
      endpoint: input.endpoint?.trim() || null,
      from,
    };
  }

  private readSmtpEnvironment(): SmtpRuntimeSettings | null {
    const host = this.configService.get<string>('MAIL_HOST')?.trim();
    if (!host) {
      return null;
    }

    return {
      connectorType: 'SMTP',
      source: 'environment',
      host,
      port: Number(this.configService.get<string>('MAIL_PORT')) || 1025,
      user: this.configService.get<string>('MAIL_USER')?.trim() || null,
      pass: this.configService.get<string>('MAIL_PASS')?.trim() || null,
      from:
        this.configService.get<string>('MAIL_FROM')?.trim() ||
        '"Mecerka" <no-reply@mecerka.local>',
    };
  }

  private readAwsSesEnvironment(): AwsSesRuntimeSettings | null {
    const region =
      this.configService.get<string>('AWS_SES_REGION')?.trim() ||
      this.configService.get<string>('AWS_REGION')?.trim();
    const accessKeyId =
      this.configService.get<string>('AWS_SES_ACCESS_KEY_ID')?.trim() ||
      this.configService.get<string>('AWS_ACCESS_KEY_ID')?.trim();
    const secretAccessKey =
      this.configService.get<string>('AWS_SES_SECRET_ACCESS_KEY')?.trim() ||
      this.configService.get<string>('AWS_SECRET_ACCESS_KEY')?.trim();
    const from =
      this.configService.get<string>('MAIL_FROM')?.trim() ||
      this.configService.get<string>('AWS_SES_FROM')?.trim();

    if (!region || !accessKeyId || !secretAccessKey || !from) {
      return null;
    }

    return {
      connectorType: 'AWS_SES',
      source: 'environment',
      region,
      accessKeyId,
      secretAccessKey,
      sessionToken:
        this.configService.get<string>('AWS_SES_SESSION_TOKEN')?.trim() ||
        this.configService.get<string>('AWS_SESSION_TOKEN')?.trim() ||
        null,
      endpoint:
        this.configService.get<string>('AWS_SES_ENDPOINT')?.trim() || null,
      from,
    };
  }

  private inferEnvironmentConnector(): EmailConnectorType {
    const smtpHost = this.configService.get<string>('MAIL_HOST')?.trim() || '';
    if (smtpHost.startsWith('email-smtp.')) {
      return 'SMTP';
    }

    const awsRegion =
      this.configService.get<string>('AWS_SES_REGION')?.trim() ||
      this.configService.get<string>('AWS_REGION')?.trim();
    const awsKey =
      this.configService.get<string>('AWS_SES_ACCESS_KEY_ID')?.trim() ||
      this.configService.get<string>('AWS_ACCESS_KEY_ID')?.trim();

    if (awsRegion && awsKey) {
      return 'AWS_SES';
    }

    return 'SMTP';
  }

  private requireString(value: unknown, field: string) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Stored email connector is missing ${field}`);
    }

    return value.trim();
  }

  private requireTrimmed(value: string, field: string) {
    if (!value || value.trim().length === 0) {
      throw new BadRequestException(`${field} is required`);
    }

    return value.trim();
  }

  private requirePort(value: unknown) {
    const port =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : NaN;

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new BadRequestException('port must be between 1 and 65535');
    }

    return port;
  }
}
