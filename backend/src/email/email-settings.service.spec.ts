import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { EmailSecretsCryptoService } from './email-secrets-crypto.service';
import { EmailSettingsService } from './email-settings.service';
import { PrismaService } from '../prisma/prisma.service';

describe('EmailSettingsService', () => {
  let service: EmailSettingsService;
  let prismaMock: {
    systemSetting: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let configServiceMock: { get: jest.Mock };

  beforeEach(async () => {
    prismaMock = {
      systemSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'jwt-secret-for-tests';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailSettingsService,
        EmailSecretsCryptoService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = module.get(EmailSettingsService);
  });

  it('stores encrypted SMTP settings and only returns a summary', async () => {
    prismaMock.systemSetting.upsert.mockImplementation(async ({ create }) => ({
      ...create,
    }));

    const summary = await service.saveSettings(
      {
        connectorType: 'SMTP',
        host: 'smtp.example.com',
        port: 465,
        user: 'mailer',
        password: 'secret-pass',
        from: 'no-reply@example.com',
      },
      'admin-1',
    );

    const savedValue = prismaMock.systemSetting.upsert.mock.calls[0][0].create
      .value as {
      connectorType: string;
      encryptedConfig: { ciphertext: string };
      fingerprint: { salt: string; hash: string };
    };

    expect(summary).toEqual({
      connectorType: 'SMTP',
      connectorLabel: 'SMTP',
      source: 'database',
      configured: true,
      senderConfigured: true,
      credentialsConfigured: true,
      secretConfigured: true,
      transportSecurity: 'TLS_VERIFIED',
    });
    expect(savedValue.connectorType).toBe('SMTP');
    expect(savedValue.encryptedConfig.ciphertext).not.toContain(
      'smtp.example.com',
    );
    expect(savedValue.encryptedConfig.ciphertext).not.toContain('secret-pass');
    expect(savedValue.fingerprint.salt).toBeTruthy();
    expect(savedValue.fingerprint.hash).toBeTruthy();
  });

  it('reads AWS SES settings from encrypted database storage', async () => {
    await service.saveSettings(
      {
        connectorType: 'AWS_SES',
        region: 'eu-west-1',
        accessKeyId: 'AKIA_TEST',
        secretAccessKey: 'aws-secret',
        sessionToken: 'aws-session',
        endpoint: 'https://email.eu-west-1.amazonaws.com',
        from: 'support@example.com',
      },
      'admin-1',
    );

    const storedValue =
      prismaMock.systemSetting.upsert.mock.calls[0][0].create.value;
    prismaMock.systemSetting.findUnique.mockResolvedValueOnce({
      value: storedValue,
    });

    const runtime = await service.getRuntimeSettings();

    expect(runtime).toEqual({
      connectorType: 'AWS_SES',
      source: 'database',
      region: 'eu-west-1',
      accessKeyId: 'AKIA_TEST',
      secretAccessKey: 'aws-secret',
      sessionToken: 'aws-session',
      endpoint: 'https://email.eu-west-1.amazonaws.com',
      from: 'support@example.com',
    });
  });

  it('reuses a previously stored AWS secret when rotating only non-secret fields', async () => {
    await service.saveSettings(
      {
        connectorType: 'AWS_SES',
        region: 'eu-west-1',
        accessKeyId: 'AKIA_TEST',
        secretAccessKey: 'aws-secret',
        from: 'support@example.com',
      },
      'admin-1',
    );

    const storedValue =
      prismaMock.systemSetting.upsert.mock.calls[0][0].create.value;
    prismaMock.systemSetting.findUnique.mockResolvedValue({
      value: storedValue,
    });

    const summary = await service.saveSettings(
      {
        connectorType: 'AWS_SES',
        region: 'eu-west-2',
        accessKeyId: 'AKIA_TEST_NEXT',
        from: 'support-next@example.com',
      },
      'admin-1',
    );

    expect(summary.connectorType).toBe('AWS_SES');
    expect(prismaMock.systemSetting.upsert).toHaveBeenCalledTimes(2);
  });

  it('falls back to AWS SES environment settings when configured', async () => {
    configServiceMock.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        JWT_SECRET: 'jwt-secret-for-tests',
        MAIL_CONNECTOR: 'AWS_SES',
        AWS_SES_REGION: 'eu-west-1',
        AWS_SES_ACCESS_KEY_ID: 'AKIA_ENV',
        AWS_SES_SECRET_ACCESS_KEY: 'env-secret',
        MAIL_FROM: 'env@example.com',
      };
      return values[key];
    });

    const runtime = await service.getRuntimeSettings();

    expect(runtime).toEqual({
      connectorType: 'AWS_SES',
      source: 'environment',
      region: 'eu-west-1',
      accessKeyId: 'AKIA_ENV',
      secretAccessKey: 'env-secret',
      sessionToken: null,
      endpoint: null,
      from: 'env@example.com',
    });
  });

  it('falls back to legacy plaintext SMTP settings when the new connector record is absent', async () => {
    prismaMock.systemSetting.findUnique.mockImplementation(({ where }) => {
      if (where.key === 'EMAIL_CONNECTOR_CONFIG') {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        value: {
          host: 'legacy.smtp.local',
          port: 1025,
          user: 'legacy-user',
          pass: 'legacy-pass',
          from: 'legacy@example.com',
        },
      });
    });

    const runtime = await service.getRuntimeSettings();

    expect(runtime).toEqual({
      connectorType: 'SMTP',
      source: 'database',
      host: 'legacy.smtp.local',
      port: 1025,
      user: 'legacy-user',
      pass: 'legacy-pass',
      from: 'legacy@example.com',
    });
  });

  it('returns the default local relay summary when no database or env connector exists', async () => {
    const summary = await service.getEffectiveSettings();

    expect(summary).toEqual({
      connectorType: 'SMTP',
      connectorLabel: 'SMTP',
      source: 'default',
      configured: true,
      senderConfigured: true,
      credentialsConfigured: false,
      secretConfigured: false,
      transportSecurity: 'LOCAL_DEFAULT',
    });
  });

  it('reuses the previous SMTP secret when rotating only host metadata', async () => {
    await service.saveSettings(
      {
        connectorType: 'SMTP',
        host: 'smtp.example.com',
        port: 465,
        user: 'mailer',
        password: 'secret-pass',
        from: 'no-reply@example.com',
      },
      'admin-1',
    );

    const storedValue =
      prismaMock.systemSetting.upsert.mock.calls[0][0].create.value;
    prismaMock.systemSetting.findUnique.mockResolvedValue({
      value: storedValue,
    });

    const summary = await service.saveSettings(
      {
        connectorType: 'SMTP',
        host: 'smtp-rotated.example.com',
        port: 587,
        user: 'mailer-next',
        from: 'ops@example.com',
      },
      'admin-1',
    );

    expect(summary).toMatchObject({
      connectorType: 'SMTP',
      credentialsConfigured: true,
      secretConfigured: true,
    });

    prismaMock.systemSetting.findUnique.mockResolvedValueOnce({
      value: prismaMock.systemSetting.upsert.mock.calls[1][0].create.value,
    });

    await expect(service.getRuntimeSettings()).resolves.toEqual({
      connectorType: 'SMTP',
      source: 'database',
      host: 'smtp-rotated.example.com',
      port: 587,
      user: 'mailer-next',
      pass: 'secret-pass',
      from: 'ops@example.com',
    });
  });

  it('clears a stored SMTP secret when requested', async () => {
    const summary = await service.saveSettings(
      {
        connectorType: 'SMTP',
        host: 'smtp.example.com',
        port: 587,
        user: 'mailer',
        clearSecret: true,
        from: 'ops@example.com',
      },
      'admin-1',
    );

    expect(summary).toMatchObject({
      connectorType: 'SMTP',
      configured: true,
      credentialsConfigured: false,
      secretConfigured: false,
    });
  });

  it('clears the AWS session token and trims the custom endpoint when requested', async () => {
    await service.saveSettings(
      {
        connectorType: 'AWS_SES',
        region: 'eu-west-1',
        accessKeyId: 'AKIA_TEST',
        secretAccessKey: 'aws-secret',
        sessionToken: 'aws-session',
        from: 'support@example.com',
      },
      'admin-1',
    );

    const storedValue =
      prismaMock.systemSetting.upsert.mock.calls[0][0].create.value;
    prismaMock.systemSetting.findUnique.mockResolvedValue({
      value: storedValue,
    });

    await service.saveSettings(
      {
        connectorType: 'AWS_SES',
        region: 'eu-west-1',
        accessKeyId: 'AKIA_TEST',
        clearSessionToken: true,
        endpoint: '   ',
        from: 'support@example.com',
      },
      'admin-1',
    );

    prismaMock.systemSetting.findUnique.mockResolvedValueOnce({
      value: prismaMock.systemSetting.upsert.mock.calls[1][0].create.value,
    });

    await expect(service.getRuntimeSettings()).resolves.toEqual({
      connectorType: 'AWS_SES',
      source: 'database',
      region: 'eu-west-1',
      accessKeyId: 'AKIA_TEST',
      secretAccessKey: 'aws-secret',
      sessionToken: null,
      endpoint: null,
      from: 'support@example.com',
    });
  });

  it('rejects AWS SES settings without a new or stored secret', async () => {
    await expect(
      service.saveSettings(
        {
          connectorType: 'AWS_SES',
          region: 'eu-west-1',
          accessKeyId: 'AKIA_TEST',
          from: 'support@example.com',
        },
        'admin-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('requires SYSTEM_SETTINGS_MASTER_KEY when persisting connector secrets in production', async () => {
    configServiceMock.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'production';
      if (key === 'SYSTEM_SETTINGS_MASTER_KEY') return undefined;
      if (key === 'JWT_SECRET') return 'jwt-secret-for-tests';
      return undefined;
    });

    await expect(
      service.saveSettings(
        {
          connectorType: 'SMTP',
          host: 'smtp.example.com',
          port: 465,
          user: 'mailer',
          password: 'secret-pass',
          from: 'no-reply@example.com',
        },
        'admin-1',
      ),
    ).rejects.toThrow('SYSTEM_SETTINGS_MASTER_KEY is required in production');
  });

  it('uses AWS environment fallbacks from generic AWS variables', async () => {
    configServiceMock.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        JWT_SECRET: 'jwt-secret-for-tests',
        AWS_REGION: 'eu-central-1',
        AWS_ACCESS_KEY_ID: 'AKIA_GENERIC',
        AWS_SECRET_ACCESS_KEY: 'generic-secret',
        AWS_SESSION_TOKEN: 'generic-session',
        AWS_SES_FROM: 'ses-from@example.com',
      };
      return values[key];
    });

    await expect(service.getRuntimeSettings()).resolves.toEqual({
      connectorType: 'AWS_SES',
      source: 'environment',
      region: 'eu-central-1',
      accessKeyId: 'AKIA_GENERIC',
      secretAccessKey: 'generic-secret',
      sessionToken: 'generic-session',
      endpoint: null,
      from: 'ses-from@example.com',
    });
  });

  it('falls back to SMTP env when AWS SES is requested but incomplete', async () => {
    configServiceMock.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        JWT_SECRET: 'jwt-secret-for-tests',
        MAIL_CONNECTOR: 'AWS_SES',
        AWS_SES_REGION: 'eu-west-1',
        MAIL_HOST: 'smtp.env.example.com',
        MAIL_PORT: '587',
        MAIL_USER: 'smtp-user',
        MAIL_PASS: 'smtp-pass',
        MAIL_FROM: 'smtp@example.com',
      };
      return values[key];
    });

    await expect(service.getRuntimeSettings()).resolves.toEqual({
      connectorType: 'SMTP',
      source: 'environment',
      host: 'smtp.env.example.com',
      port: 587,
      user: 'smtp-user',
      pass: 'smtp-pass',
      from: 'smtp@example.com',
    });
  });

  it('uses SMTP environment defaults when only the host is configured', async () => {
    configServiceMock.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        JWT_SECRET: 'jwt-secret-for-tests',
        MAIL_HOST: 'smtp.internal.local',
      };
      return values[key];
    });

    await expect(service.getRuntimeSettings()).resolves.toEqual({
      connectorType: 'SMTP',
      source: 'environment',
      host: 'smtp.internal.local',
      port: 1025,
      user: null,
      pass: null,
      from: '"Mecerka" <no-reply@mecerka.local>',
    });
  });

  it('throws when an encrypted record fails fingerprint verification', async () => {
    await service.saveSettings(
      {
        connectorType: 'SMTP',
        host: 'smtp.example.com',
        port: 465,
        user: 'mailer',
        password: 'secret-pass',
        from: 'no-reply@example.com',
      },
      'admin-1',
    );

    const storedValue = structuredClone(
      prismaMock.systemSetting.upsert.mock.calls[0][0].create.value,
    );
    storedValue.fingerprint.hash = 'tampered-hash';

    prismaMock.systemSetting.findUnique.mockResolvedValueOnce({
      value: storedValue,
    });

    await expect(service.getRuntimeSettings()).rejects.toThrow(
      'Stored email connector fingerprint mismatch',
    );
  });

  it('ignores malformed legacy SMTP records', async () => {
    prismaMock.systemSetting.findUnique.mockImplementation(({ where }) => {
      if (where.key === 'EMAIL_CONNECTOR_CONFIG') {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        value: {
          host: '',
          port: 'NaN',
          from: '',
        },
      });
    });

    await expect(service.getRuntimeSettings()).resolves.toEqual({
      connectorType: 'SMTP',
      host: 'mailpit',
      port: 1025,
      user: null,
      pass: null,
      from: '"Mecerka" <no-reply@mecerka.local>',
      source: 'default',
    });
  });

  it('parses legacy SMTP records with string ports and blank optional credentials', async () => {
    prismaMock.systemSetting.findUnique.mockImplementation(({ where }) => {
      if (where.key === 'EMAIL_CONNECTOR_CONFIG') {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        value: {
          host: 'legacy.smtp.local',
          port: '2525',
          user: '',
          pass: '',
          from: 'legacy@example.com',
        },
      });
    });

    await expect(service.getRuntimeSettings()).resolves.toEqual({
      connectorType: 'SMTP',
      source: 'database',
      host: 'legacy.smtp.local',
      port: 2525,
      user: null,
      pass: null,
      from: 'legacy@example.com',
    });
  });

  it('rejects invalid stored connector payloads and invalid ports', async () => {
    expect(() =>
      (service as any).hydrateDecryptedConfig('SMTP', {
        host: 'smtp.example.com',
        port: 70000,
        from: 'no-reply@example.com',
      }),
    ).toThrow('port must be between 1 and 65535');

    expect(() =>
      (service as any).hydrateDecryptedConfig('AWS_SES', {
        region: 'eu-west-1',
        accessKeyId: 'AKIA_TEST',
        secretAccessKey: '',
        from: 'no-reply@example.com',
      }),
    ).toThrow('Stored email connector is missing secretAccessKey');
  });

  it('detects AWS SES from environment when AWS variables exist and smtp host is not SES', () => {
    configServiceMock.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        MAIL_HOST: 'smtp.internal.local',
        AWS_REGION: 'eu-west-1',
        AWS_ACCESS_KEY_ID: 'AKIA_GENERIC',
      };
      return values[key];
    });

    expect((service as any).inferEnvironmentConnector()).toBe('AWS_SES');
  });

  it('detects SMTP when the mail host is an SES SMTP relay hostname', () => {
    configServiceMock.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        MAIL_HOST: 'email-smtp.eu-west-1.amazonaws.com',
      };
      return values[key];
    });

    expect((service as any).inferEnvironmentConnector()).toBe('SMTP');
  });

  it('returns null for malformed stored connector records and rejects empty trimmed values', () => {
    expect(
      (service as any).parseStoredConnectorRecord({ connectorType: 'OTHER' }),
    ).toBeNull();
    expect(
      (service as any).parseStoredConnectorRecord({
        connectorType: 'SMTP',
      }),
    ).toBeNull();
    expect(() => (service as any).requireTrimmed('   ', 'host')).toThrow(
      'host is required',
    );
  });
});
