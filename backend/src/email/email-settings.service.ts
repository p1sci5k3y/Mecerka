import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const EMAIL_SMTP_SETTINGS_KEY = 'EMAIL_SMTP_CONFIG';

export interface PersistedEmailSettings {
  host: string;
  port: number;
  user: string | null;
  pass: string | null;
  from: string;
}

export interface EmailSettingsSummary {
  host: string;
  port: number;
  user: string | null;
  from: string;
  secure: boolean;
  authConfigured: boolean;
  passwordConfigured: boolean;
  source: 'database' | 'environment' | 'default';
}

export interface SaveEmailSettingsInput {
  host: string;
  port: number;
  user?: string | null;
  password?: string | null;
  from: string;
  clearPassword?: boolean;
}

@Injectable()
export class EmailSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffectiveSettings(): Promise<EmailSettingsSummary> {
    const settings = await this.getRuntimeSettings();

    return {
      host: settings.host,
      port: settings.port,
      user: settings.user,
      from: settings.from,
      secure: settings.port === 465,
      authConfigured: Boolean(settings.user && settings.pass),
      passwordConfigured: Boolean(settings.pass),
      source: settings.source,
    };
  }

  async getRuntimeSettings(): Promise<
    PersistedEmailSettings & { source: 'database' | 'environment' | 'default' }
  > {
    const stored = await this.getStoredSettings();
    if (stored) {
      return {
        ...stored,
        source: 'database',
      };
    }

    const host = process.env.MAIL_HOST?.trim();
    const port = Number(process.env.MAIL_PORT) || 1025;
    const user = process.env.MAIL_USER?.trim() || null;
    const pass = process.env.MAIL_PASS?.trim() || null;
    const from =
      process.env.MAIL_FROM?.trim() || '"Mecerka" <no-reply@mecerka.local>';

    if (host) {
      return {
        host,
        port,
        user,
        pass,
        from,
        source: 'environment',
      };
    }

    return {
      host: 'mailpit',
      port: 1025,
      user: null,
      pass: null,
      from,
      source: 'default',
    };
  }

  async saveSettings(
    input: SaveEmailSettingsInput,
    actorId: string,
  ): Promise<EmailSettingsSummary> {
    const systemSetting = (this.prisma as PrismaClient).systemSetting;
    const previous = await this.getStoredSettings();
    const next: PersistedEmailSettings = {
      host: input.host.trim(),
      port: input.port,
      user: input.user?.trim() || null,
      pass: input.clearPassword
        ? null
        : input.password && input.password.length > 0
          ? input.password
          : (previous?.pass ?? null),
      from: input.from.trim(),
    };

    await systemSetting.upsert({
      where: { key: EMAIL_SMTP_SETTINGS_KEY },
      create: {
        key: EMAIL_SMTP_SETTINGS_KEY,
        value: next as unknown as Prisma.InputJsonValue,
        updatedById: actorId,
      },
      update: {
        value: next as unknown as Prisma.InputJsonValue,
        updatedById: actorId,
      },
    });

    return this.getEffectiveSettings();
  }

  private async getStoredSettings(): Promise<PersistedEmailSettings | null> {
    const systemSetting = (this.prisma as PrismaClient).systemSetting;
    const setting = await systemSetting.findUnique({
      where: { key: EMAIL_SMTP_SETTINGS_KEY },
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
}
