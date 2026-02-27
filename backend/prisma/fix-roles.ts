import { PrismaClient, Role } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    await prisma.user.updateMany({
        where: { email: { startsWith: 'runner' } },
        data: { roles: [Role.RUNNER] }
    });
    console.log('Runner roles updated');
}
main().catch(console.error).finally(() => prisma.$disconnect());
