import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  const baseConfig = () => ({
    FISCAL_PEPPER: 'a'.repeat(64),
    JWT_SECRET: 'super-secret',
    DATABASE_URL: 'postgres://localhost/db',
    STRIPE_SECRET_KEY: 'sk_test_dummy',
    STRIPE_WEBHOOK_SECRET: 'whsec_dummy',
    FRONTEND_URL: 'http://localhost:3000',
    NODE_ENV: 'test',
  });

  it('returns the config when all required fields are valid', () => {
    const config = baseConfig();
    const result = validateEnvironment(config);
    expect(result).toBeDefined();
  });

  it('throws when FISCAL_PEPPER is missing', () => {
    const config = { ...baseConfig(), FISCAL_PEPPER: '' };
    expect(() => validateEnvironment(config)).toThrow(
      'FISCAL_PEPPER is required',
    );
  });

  it('throws when FISCAL_PEPPER is not a string', () => {
    const config = { ...baseConfig(), FISCAL_PEPPER: 123 };
    expect(() => validateEnvironment(config)).toThrow(
      'FISCAL_PEPPER is required',
    );
  });

  it('throws when FISCAL_PEPPER contains non-hex characters', () => {
    const config = { ...baseConfig(), FISCAL_PEPPER: 'g'.repeat(64) };
    expect(() => validateEnvironment(config)).toThrow(
      'FISCAL_PEPPER must contain only hexadecimal characters',
    );
  });

  it('warns when FISCAL_PEPPER is shorter than 64 chars but does not throw', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const config = { ...baseConfig(), FISCAL_PEPPER: 'abc123' };
    expect(() => validateEnvironment(config)).not.toThrow();
    spy.mockRestore();
  });

  it('throws when JWT_SECRET is missing', () => {
    const config = { ...baseConfig(), JWT_SECRET: '' };
    expect(() => validateEnvironment(config)).toThrow('JWT_SECRET is required');
  });

  it('throws when DATABASE_URL is missing', () => {
    const config = { ...baseConfig(), DATABASE_URL: '' };
    expect(() => validateEnvironment(config)).toThrow(
      'DATABASE_URL is required',
    );
  });

  it('throws when STRIPE_SECRET_KEY is missing', () => {
    const config = { ...baseConfig(), STRIPE_SECRET_KEY: '' };
    expect(() => validateEnvironment(config)).toThrow(
      'STRIPE_SECRET_KEY is required',
    );
  });

  it('throws when STRIPE_WEBHOOK_SECRET is missing', () => {
    const config = { ...baseConfig(), STRIPE_WEBHOOK_SECRET: '' };
    expect(() => validateEnvironment(config)).toThrow(
      'STRIPE_WEBHOOK_SECRET is required',
    );
  });

  it('throws when FRONTEND_URL is missing', () => {
    const config = { ...baseConfig(), FRONTEND_URL: '' };
    expect(() => validateEnvironment(config)).toThrow(
      'FRONTEND_URL is required',
    );
  });

  it('throws when NODE_ENV is invalid', () => {
    const config = { ...baseConfig(), NODE_ENV: 'staging' };
    expect(() => validateEnvironment(config)).toThrow(
      'NODE_ENV must be one of',
    );
  });

  it('defaults NODE_ENV to development when not provided', () => {
    const config = { ...baseConfig() };
    delete (config as any).NODE_ENV;
    const result = validateEnvironment(config);
    expect(result.NODE_ENV).toBe('development');
  });

  it('sets TOTP_ISSUER default when not provided', () => {
    const config = baseConfig();
    delete (config as any).TOTP_ISSUER;
    const result = validateEnvironment(config);
    expect(result.TOTP_ISSUER).toBe('Mecerka');
  });

  it('keeps TOTP_ISSUER when already provided', () => {
    const config = { ...baseConfig(), TOTP_ISSUER: 'MyApp' };
    const result = validateEnvironment(config);
    expect(result.TOTP_ISSUER).toBe('MyApp');
  });
});
