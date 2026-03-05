import { PrismaClient, ProviderOrderStatus } from '@prisma/client';
const prisma = new PrismaClient();
// Note: we target all READY_FOR_PICKUP orders in this specific intervention script
prisma.providerOrder.updateMany({
  where: { status: ProviderOrderStatus.READY_FOR_PICKUP },
  data: { status: ProviderOrderStatus.PICKED_UP }
})
  .then(console.log)
  .catch(err => {
    console.error("Failed to mark picked up:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
