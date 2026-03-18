// @ts-nocheck
const { PrismaClient } = require('@prisma/client');
const { randomBytes } = require('node:crypto');
const { maskEmail } = require('./seed-utils.js');

const prisma = new PrismaClient();
const argon2 = require('argon2');

function resolveE2ePassword() {
    const configuredPassword = process.env.E2E_SEED_USERS_PASSWORD?.trim();
    if (configuredPassword) {
        return configuredPassword;
    }

    const generatedPassword = randomBytes(24).toString('base64url');
    console.warn('[seed-e2e-users] Generated password for E2E users');
    return generatedPassword;
}

async function main() {
    if (process.env.NODE_ENV === 'production' && !process.env.FORCE_E2E_SEED) {
        console.log('Skipping E2E user seed in production environment.');
        return;
    }

    const users = [
        { email: 'e2e-client-final-bypass-v3@test.com', roles: ['CLIENT'], name: 'E2E Client' },
        { email: 'e2e-runner-final-bypass-v3@test.com', roles: ['CLIENT', 'RUNNER'], name: 'E2E Runner' },
        { email: 'e2e-admin-final-bypass-v3@test.com', roles: ['CLIENT', 'ADMIN'], name: 'E2E Admin' }
    ];

    const hashedPassword = await argon2.hash(resolveE2ePassword());

    for (const user of users) {
        let existing = await prisma.user.findUnique({ where: { email: user.email } });
        if (existing) {
            await prisma.user.update({
                where: { email: user.email },
                data: {
                    mfaEnabled: true,
                    roles: user.roles,
                    name: user.name,
                    password: hashedPassword
                },
            });
            console.log('[seed-e2e-users] Updated existing user', {
                email: maskEmail(user.email),
            });
        } else {
            await prisma.user.create({
                data: {
                    email: user.email,
                    roles: user.roles,
                    mfaEnabled: true,
                    password: hashedPassword,
                    name: user.name
                },
            });
            console.log('[seed-e2e-users] Created new user', {
                email: maskEmail(user.email),
            });
        }
    }
}

// eslint-disable-next-line unicorn/prefer-top-level-await
(async () => {
    let hasError = false;
    try {
        await main();
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown seed error';
        console.error('[seed-e2e-users] Failed', { message });
        hasError = true;
    } finally {
        await prisma.$disconnect();
        if (hasError) {
            process.exit(1);
        }
    }
})();
