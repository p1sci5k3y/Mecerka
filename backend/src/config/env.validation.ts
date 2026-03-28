type EnvRecord = Record<string, unknown>;

function readString(config: EnvRecord, key: string) {
  const value = config[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function validateEnvironment(config: EnvRecord) {
  const fiscalPepper = readString(config, 'FISCAL_PEPPER');

  if (!fiscalPepper) {
    throw new Error('FISCAL_PEPPER is required');
  }

  if (!/^[a-f0-9]+$/i.test(fiscalPepper)) {
    throw new Error('FISCAL_PEPPER must contain only hexadecimal characters');
  }

  if (fiscalPepper.length < 64) {
    console.warn(
      '[env] FISCAL_PEPPER should be at least 64 hexadecimal characters',
    );
  }

  const jwtSecret = readString(config, 'JWT_SECRET');
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }

  const databaseUrl = readString(config, 'DATABASE_URL');
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const stripeSecretKey = readString(config, 'STRIPE_SECRET_KEY');
  if (!stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY is required');
  }

  const stripeWebhookSecret = readString(config, 'STRIPE_WEBHOOK_SECRET');
  if (!stripeWebhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is required');
  }

  const frontendUrl = readString(config, 'FRONTEND_URL');
  if (!frontendUrl) {
    throw new Error('FRONTEND_URL is required');
  }

  const nodeEnv = readString(config, 'NODE_ENV') || 'development';
  const validNodeEnvs = ['development', 'production', 'test'];
  if (!validNodeEnvs.includes(nodeEnv)) {
    throw new Error(`NODE_ENV must be one of: ${validNodeEnvs.join(', ')}`);
  }

  const systemSettingsMasterKey = readString(
    config,
    'SYSTEM_SETTINGS_MASTER_KEY',
  );
  if (nodeEnv === 'production' && !systemSettingsMasterKey) {
    throw new Error('SYSTEM_SETTINGS_MASTER_KEY is required in production');
  }

  if (!config.TOTP_ISSUER) {
    config.TOTP_ISSUER = 'Mecerka';
  }

  config.FISCAL_PEPPER = fiscalPepper;
  config.NODE_ENV = nodeEnv;
  if (systemSettingsMasterKey) {
    config.SYSTEM_SETTINGS_MASTER_KEY = systemSettingsMasterKey;
  }
  return config;
}
