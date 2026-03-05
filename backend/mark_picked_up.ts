import { PrismaClient, ProviderOrderStatus } from '@prisma/client';
const prisma = new PrismaClient();
prisma.providerOrder.updateMany({ data: { status: ProviderOrderStatus.PICKED_UP } })
  .then(console.log)
  .finally(() => prisma.$disconnect());
