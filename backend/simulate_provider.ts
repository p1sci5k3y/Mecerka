import { PrismaClient, DeliveryStatus, ProviderOrderStatus } from '@prisma/client';
const prisma = new PrismaClient();
async function simulateProvider() {
  while (true) {
    const orders = await prisma.order.findMany({ where: { status: DeliveryStatus.ASSIGNED } });
    for (const o of orders) {
      const pos = await prisma.providerOrder.findMany({ where: { orderId: o.id, status: ProviderOrderStatus.READY_FOR_PICKUP } });
      if (pos.length > 0) {
        await prisma.providerOrder.updateMany({ where: { orderId: o.id }, data: { status: ProviderOrderStatus.PICKED_UP } });
        console.log(`Simulated Provider pickup for order ${o.id}`);
      }
    }
    await new Promise(r => setTimeout(r, 2000));
  }
}
simulateProvider();
