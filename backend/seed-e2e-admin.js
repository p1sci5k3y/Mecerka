const { PrismaClient } = require('@prisma/client');
const { randomBytes } = require('node:crypto');
const { maskEmail } = require('./seed-utils.js');

const prisma = new PrismaClient();
const argon2 = require('argon2');

async function main() {
  const adminEmail =
    process.env.E2E_BOOTSTRAP_ADMIN_EMAIL || 'e2e-admin@example.test';
  const adminPassword =
    process.env.E2E_BOOTSTRAP_ADMIN_PASSWORD ||
    randomBytes(24).toString('base64url');

  if (!process.env.E2E_BOOTSTRAP_ADMIN_PASSWORD) {
    console.warn('[e2e-bootstrap] Generated E2E admin password', {
      email: maskEmail(adminEmail),
    });
  }

  if (
    !adminEmail.endsWith('@local.test') &&
    !adminEmail.endsWith('@example.test')
  ) {
    throw new Error(
      'E2E bootstrap admin must use a non-production test domain (*.local.test or *.example.test)',
    );
  }

  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  const hashedPassword = await argon2.hash(adminPassword);

  if (admin) {
    const roles = new Set(admin.roles);
    roles.add('ADMIN');
    roles.add('CLIENT');

    await prisma.user.update({
      where: { email: adminEmail },
      data: {
        roles: Array.from(roles),
        password: hashedPassword,
        emailVerified: true,
        mfaEnabled: false,
        active: true,
        name: 'Admin E2E',
        verificationToken: null,
        verificationTokenExpiresAt: null,
        lastEmailSentAt: new Date(),
      },
    });
    console.log('[e2e-bootstrap] Updated admin user', {
      email: maskEmail(adminEmail),
    });
  } else {
    await prisma.user.create({
      data: {
        email: adminEmail,
        roles: ['CLIENT', 'ADMIN'],
        mfaEnabled: false,
        password: hashedPassword,
        name: 'Admin E2E',
        emailVerified: true,
        active: true,
        lastEmailSentAt: new Date(),
      },
    });
    console.log('[e2e-bootstrap] Created admin user', {
      email: maskEmail(adminEmail),
    });
  }
}

// eslint-disable-next-line unicorn/prefer-top-level-await
main()
  .catch((e) => {
    const message = e instanceof Error ? e.message : 'Unknown bootstrap error';
    console.error('[e2e-bootstrap] Failed', { message });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
