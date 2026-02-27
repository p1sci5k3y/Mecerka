const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    const users = [
        { email: 'e2e-client-final-bypass-v3@test.com', roles: ['CLIENT'], name: 'E2E Client' },
        { email: 'e2e-runner-final-bypass-v3@test.com', roles: ['CLIENT', 'RUNNER'], name: 'E2E Runner' },
        { email: 'e2e-admin-final-bypass-v3@test.com', roles: ['CLIENT', 'ADMIN'], name: 'E2E Admin' }
    ];

    for (const user of users) {
        let existing = await prisma.user.findUnique({ where: { email: user.email } });
        if (!existing) {
            await prisma.user.create({
                data: {
                    email: user.email,
                    roles: user.roles,
                    mfaEnabled: true,
                    password: 'dummy-password-for-prisma-schema',
                    name: user.name
                },
            });
            console.log('Created new E2E user:', user.email);
        } else {
            await prisma.user.update({
                where: { email: user.email },
                data: { mfaEnabled: true, roles: user.roles },
            });
            console.log('Updated existing user:', user.email);
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
