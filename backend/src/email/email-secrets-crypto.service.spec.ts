import { ConfigService } from '@nestjs/config';
import { EmailSecretsCryptoService } from './email-secrets-crypto.service';

describe('EmailSecretsCryptoService', () => {
  function makeService(secret = 'jwt-secret-for-tests', nodeEnv = 'test') {
    return new EmailSecretsCryptoService({
      get: jest.fn((key: string) =>
        key === 'SYSTEM_SETTINGS_MASTER_KEY'
          ? secret
          : key === 'JWT_SECRET'
            ? secret
            : key === 'NODE_ENV'
              ? nodeEnv
              : undefined,
      ),
    } as unknown as ConfigService);
  }

  it('encrypts and decrypts connector payloads', () => {
    const service = makeService();
    const payload = {
      connectorType: 'AWS_SES',
      region: 'eu-west-1',
      from: 'no-reply@example.com',
      secretAccessKey: 'secret-123',
    };

    const encrypted = service.encryptJson(payload);
    const decrypted = service.decryptJson<typeof payload>(encrypted);

    expect(encrypted.ciphertext).not.toContain('secret-123');
    expect(decrypted).toEqual(payload);
  });

  it('creates and verifies salted fingerprints', () => {
    const service = makeService();
    const payload = {
      connectorType: 'SMTP',
      host: 'smtp.example.com',
      port: 465,
      from: 'no-reply@example.com',
    };

    const fingerprint = service.fingerprintJson(payload);

    expect(service.verifyFingerprint(payload, fingerprint)).toBe(true);
    expect(
      service.verifyFingerprint(
        { ...payload, from: 'tampered@example.com' },
        fingerprint,
      ),
    ).toBe(false);
  });

  it('falls back to JWT_SECRET outside production when SYSTEM_SETTINGS_MASTER_KEY is absent', () => {
    const service = new EmailSecretsCryptoService({
      get: jest.fn((key: string) => {
        if (key === 'SYSTEM_SETTINGS_MASTER_KEY') return undefined;
        if (key === 'JWT_SECRET') return 'jwt-only-secret';
        if (key === 'NODE_ENV') return 'test';
        return undefined;
      }),
    } as unknown as ConfigService);

    const encrypted = service.encryptJson({
      connectorType: 'SMTP',
      host: 'smtp.example.com',
    });

    expect(
      service.decryptJson<{ connectorType: string; host: string }>(encrypted),
    ).toEqual({
      connectorType: 'SMTP',
      host: 'smtp.example.com',
    });
  });

  it('falls back to environment key material when config service does not provide secrets', () => {
    const originalMasterKey = process.env.SYSTEM_SETTINGS_MASTER_KEY;
    process.env.SYSTEM_SETTINGS_MASTER_KEY = 'env-master-secret';

    const service = new EmailSecretsCryptoService({
      get: jest.fn(() => undefined),
    } as unknown as ConfigService);

    const encrypted = service.encryptJson({
      connectorType: 'AWS_SES',
      region: 'eu-west-1',
    });

    expect(
      service.decryptJson<{ connectorType: string; region: string }>(encrypted),
    ).toEqual({
      connectorType: 'AWS_SES',
      region: 'eu-west-1',
    });

    process.env.SYSTEM_SETTINGS_MASTER_KEY = originalMasterKey;
  });

  it('throws when no key material is configured', () => {
    const originalJwtSecret = process.env.JWT_SECRET;
    const originalMasterKey = process.env.SYSTEM_SETTINGS_MASTER_KEY;
    delete process.env.JWT_SECRET;
    delete process.env.SYSTEM_SETTINGS_MASTER_KEY;

    const service = new EmailSecretsCryptoService({
      get: jest.fn(() => undefined),
    } as unknown as ConfigService);

    expect(() => service.encryptJson({ connectorType: 'SMTP' })).toThrow(
      'SYSTEM_SETTINGS_MASTER_KEY or JWT_SECRET configuration is required',
    );

    process.env.JWT_SECRET = originalJwtSecret;
    process.env.SYSTEM_SETTINGS_MASTER_KEY = originalMasterKey;
  });

  it('requires SYSTEM_SETTINGS_MASTER_KEY in production even if JWT_SECRET exists', () => {
    const originalMasterKey = process.env.SYSTEM_SETTINGS_MASTER_KEY;
    delete process.env.SYSTEM_SETTINGS_MASTER_KEY;

    const service = new EmailSecretsCryptoService({
      get: jest.fn((key: string) => {
        if (key === 'SYSTEM_SETTINGS_MASTER_KEY') return undefined;
        if (key === 'JWT_SECRET') return 'jwt-only-secret';
        if (key === 'NODE_ENV') return 'production';
        return undefined;
      }),
    } as unknown as ConfigService);

    expect(() => service.encryptJson({ connectorType: 'SMTP' })).toThrow(
      'SYSTEM_SETTINGS_MASTER_KEY is required in production',
    );

    process.env.SYSTEM_SETTINGS_MASTER_KEY = originalMasterKey;
  });
});
