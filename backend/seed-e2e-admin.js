const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    // Ensure an admin user exists
    const adminEmail = 'e2e-admin@test.com';
    let admin = await prisma.user.findUnique({ where: { email: adminEmail } });

    if (!admin) {
        admin = await prisma.user.create({
            data: {
                email: adminEmail,
                roles: ['CLIENT', 'ADMIN'],
                mfaEnabled: false,
                password: 'dummy-password-for-prisma-schema',
                name: 'Admin E2E'
            },
        });
        console.log('Created new E2E Admin:', adminEmail);
    } else {
        // Ensure they have the ADMIN role
        if (!admin.roles.includes('ADMIN')) {
            admin = await prisma.user.update({
                where: { email: adminEmail },
                data: { roles: { push: 'ADMIN' } },
            });
            console.log('Updated existing user to Admin:', adminEmail);
        } else {
            console.log('Admin already exists:', adminEmail);
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
