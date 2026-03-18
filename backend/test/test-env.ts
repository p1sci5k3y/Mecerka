export function assertTestEnvironment() {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_SECRET_CURRENT',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'FISCAL_PEPPER',
  ] as const;

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`${key} must be set for tests`);
    }
  }
}
