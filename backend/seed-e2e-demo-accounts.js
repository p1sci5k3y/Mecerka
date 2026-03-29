const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const { maskEmail } = require('./seed-utils.js');

const prisma = new PrismaClient();

const demoEmails = [
  'admin.demo@local.test',
  'provider.demo@local.test',
  'provider2.demo@local.test',
  'madrid.provider.demo@local.test',
  'madrid.crafts.demo@local.test',
  'valencia.provider.demo@local.test',
  'valencia.crafts.demo@local.test',
  'sevilla.provider.demo@local.test',
  'sevilla.crafts.demo@local.test',
  'bilbao.provider.demo@local.test',
  'bilbao.crafts.demo@local.test',
  'runner.demo@local.test',
  'runner2.demo@local.test',
  'madrid.runner.demo@local.test',
  'valencia.runner.demo@local.test',
  'sevilla.runner.demo@local.test',
  'bilbao.runner.demo@local.test',
  'user.demo@local.test',
  'user2.demo@local.test',
];

async function main() {
  const password = process.env.E2E_DEMO_PASSWORD?.trim();
  if (!password) {
    throw new Error('E2E_DEMO_PASSWORD is required');
  }

  const hashedPassword = await argon2.hash(password);

  for (const email of demoEmails) {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!existing) {
      console.warn('[seed-e2e-demo-accounts] Missing demo user', {
        email: maskEmail(email),
      });
      continue;
    }

    await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        emailVerified: true,
        mfaEnabled: false,
        active: true,
        verificationToken: null,
        verificationTokenExpiresAt: null,
        lastEmailSentAt: new Date(),
      },
    });

    console.log('[seed-e2e-demo-accounts] Normalized demo user', {
      email: maskEmail(email),
    });
  }
}

(async () => {
  let hasError = false;
  try {
    await main();
  } catch (error) {
    hasError = true;
    console.error('[seed-e2e-demo-accounts] Failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    await prisma.$disconnect();
    if (hasError) {
      process.exit(1);
    }
  }
})();
