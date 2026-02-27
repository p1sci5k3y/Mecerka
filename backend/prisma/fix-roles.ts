import { PrismaClient, Role } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const users = await prisma.user.findMany({ where: { email: { startsWith: 'runner' } } });
    for (const user of users) {
        if (!user.roles.includes(Role.RUNNER)) {
            const newRoles = Array.from(new Set([...user.roles, Role.RUNNER]));
            await prisma.user.update({
                where: { id: user.id },
                data: { roles: newRoles }
            });
        }
    }
    console.log('Runner roles updated');
}
// eslint-disable-next-line unicorn/prefer-top-level-await
main().catch(console.error).finally(() => prisma.$disconnect());
