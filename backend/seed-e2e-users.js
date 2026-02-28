const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const argon2 = require('argon2');

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

    const hashedPassword = await argon2.hash('dummy-password-for-prisma-schema');

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
            console.log('Updated existing user:', user.email);
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
            console.log('Created new E2E user:', user.email);
        }
    }
}

// eslint-disable-next-line unicorn/prefer-top-level-await
main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
