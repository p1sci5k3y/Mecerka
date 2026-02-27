const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const argon2 = require('argon2');

async function main() {
    // Ensure an admin user exists
    const adminEmail = 'e2e-admin@test.com';
    let admin = await prisma.user.findUnique({ where: { email: adminEmail } });

    if (admin) {
        // Ensure they have the ADMIN role
        if (!admin.roles.includes('ADMIN')) {
            await prisma.user.update({
                where: { email: adminEmail },
                data: { roles: { push: 'ADMIN' } },
            });
            console.log('Updated existing user to Admin:', adminEmail);
        } else {
            console.log('Admin already exists:', adminEmail);
        }
    } else {
        const hashedPassword = await argon2.hash('dummy-password-for-prisma-schema');
        await prisma.user.create({
            data: {
                email: adminEmail,
                roles: ['CLIENT', 'ADMIN'],
                mfaEnabled: false,
                password: hashedPassword,
                name: 'Admin E2E'
            },
        });
        console.log('Created new E2E Admin:', adminEmail);
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
