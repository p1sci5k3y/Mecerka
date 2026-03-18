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

  config.FISCAL_PEPPER = fiscalPepper;
  return config;
}
