import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- DB INTEGRITY TEST ---');

    // Fetch some seeded data
    const clients = await prisma.user.findMany({ where: { roles: { has: 'CLIENT' } } });
    const providers = await prisma.user.findMany({ where: { roles: { has: 'PROVIDER' } } });
    const cities = await prisma.city.findMany();
    const products = await prisma.product.findMany();

    if (!clients.length || !providers.length || !cities.length || !products.length) {
        console.log('Skipping domain tests; required reference data is not present in DB.');
        return;
    }

    const clientId = clients[0].id;
    const cityId = cities[0].id;
    const providerId = providers[0].id;
    const productId = products[0].id;
    const productId2 = products[1].id;

    // 1. Try to create ProviderOrder WITHOUT an Order (Expected to fail)
    try {
        await prisma.providerOrder.create({
            data: {
                providerId,
                subtotalAmount: 10,
                orderId: '00000000-0000-0000-0000-000000000000', // Invalid UUID / non-existent
            }
        });
        console.error('❌ FAIL: Allowed ProviderOrder without a valid Order');
    } catch (e: any) {
        console.log('✅ SUCCESS: Prevented ProviderOrder without valid Order (' + e.code + ')');
    }

    // 2. Try to create OrderItem WITHOUT ProviderOrder (Expected to fail)
    try {
        await prisma.orderItem.create({
            data: {
                quantity: 1,
                priceAtPurchase: 10,
                productId,
                providerOrderId: '00000000-0000-0000-0000-000000000000'
            }
        });
        console.error('❌ FAIL: Allowed OrderItem without a valid ProviderOrder');
    } catch (e: any) {
        console.log('✅ SUCCESS: Prevented OrderItem without valid ProviderOrder (' + e.code + ')');
    }

    // 3. Create a valid nested Hierarchy (Order -> 2x ProviderOrder -> 3x OrderItem)
    const order = await prisma.order.create({
        data: {
            clientId,
            cityId,
            checkoutIdempotencyKey: `test-domain-${Date.now()}`,
            totalPrice: 20,

            providerOrders: {
                create: [
                    {
                        providerId,
                        subtotalAmount: 10,
                        items: {
                            create: [
                                { productId, quantity: 1, priceAtPurchase: 5 },
                                { productId: productId2, quantity: 1, priceAtPurchase: 5 }
                            ]
                        }
                    },
                    {
                        providerId,
                        subtotalAmount: 10,
                        items: {
                            create: [
                                { productId, quantity: 2, priceAtPurchase: 5 }
                            ]
                        }
                    }
                ]
            }
        },
        include: { providerOrders: { include: { items: true } } }
    });

    console.log(`✅ SUCCESS: Created valid nested Order ${order.id}`);
    console.log(`   -> Includes ${order.providerOrders.length} ProviderOrders`);
    console.log(`   -> Details: Provider 1 Items (${order.providerOrders[0].items.length}), Provider 2 Items (${order.providerOrders[1].items.length})`);

    // Cleanup
    await prisma.orderItem.deleteMany({ where: { providerOrderId: { in: order.providerOrders.map((p: any) => p.id) } } });
    await prisma.providerOrder.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } });
    console.log('✅ SUCCESS: Cleanup finished.');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
