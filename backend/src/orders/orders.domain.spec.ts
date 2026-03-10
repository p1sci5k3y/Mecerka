import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryStatus, ProviderOrderStatus, Role } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentsService } from '../payments/payments.service';

describe('OrdersService - Saga Lite Payment Domain', () => {
  let paymentsService: PaymentsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        PaymentsService,
        PrismaService,
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    paymentsService = module.get<PaymentsService>(PaymentsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Helper to generate isolated database state for each test
  async function setupTestData(stockA: number, stockB: number) {
    const rand = Math.random().toString(36).substring(7);

    const client = await prisma.user.create({
      data: {
        email: `client_${rand}@test.com`,
        password: 'pass',
        name: 'Test Client',
        roles: { set: [Role.CLIENT] },
      },
    });

    const city = await prisma.city.create({
      data: { name: `City_${rand}`, slug: `city-${rand}` },
    });

    const cat = await prisma.category.create({
      data: { name: `Cat_${rand}`, slug: `cat-${rand}` },
    });

    const provA = await prisma.user.create({
      data: {
        email: `proA_${rand}@test.com`,
        password: 'pass',
        name: 'Prov A',
        roles: { set: [Role.PROVIDER] },
      },
    });

    const provB = await prisma.user.create({
      data: {
        email: `proB_${rand}@test.com`,
        password: 'pass',
        name: 'Prov B',
        roles: { set: [Role.PROVIDER] },
      },
    });

    const prodA = await prisma.product.create({
      data: {
        name: 'Prod A',
        price: 10,
        stock: stockA,
        providerId: provA.id,
        cityId: city.id,
        categoryId: cat.id,
      },
    });

    const prodB = await prisma.product.create({
      data: {
        name: 'Prod B',
        price: 15,
        stock: stockB,
        providerId: provB.id,
        cityId: city.id,
        categoryId: cat.id,
      },
    });

    return { client, city, cat, provA, provB, prodA, prodB };
  }

  async function createTestOrder(data: any, qtyA: number, qtyB: number) {
    return prisma.order.create({
      data: {
        clientId: data.client.id,
        cityId: data.city.id,
        totalPrice: qtyA * 10 + qtyB * 15,
        deliveryFee: 5,
        status: DeliveryStatus.PENDING,
        providerOrders: {
          create: [
            {
              providerId: data.provA.id,
              status: ProviderOrderStatus.PENDING,
              subtotal: qtyA * 10,
              items: {
                create: [
                  {
                    productId: data.prodA.id,
                    quantity: qtyA,
                    priceAtPurchase: 10,
                  },
                ],
              },
            },
            {
              providerId: data.provB.id,
              status: ProviderOrderStatus.PENDING,
              subtotal: qtyB * 15,
              items: {
                create: [
                  {
                    productId: data.prodB.id,
                    quantity: qtyB,
                    priceAtPurchase: 15,
                  },
                ],
              },
            },
          ],
        },
      },
    });
  }

  it('A) Confirmación decrementa stock y pasa a CONFIRMED', async () => {
    // Both products have stock 5
    const data = await setupTestData(5, 5);
    // User buys 2 units of each
    const order = await createTestOrder(data, 2, 2);

    // Expected: Order CONFIRMED
    const paymentRef = 'PAY_A_' + Date.now();
    const result: any = await paymentsService.confirmPayment(order.id, paymentRef, 'evt_A_' + Date.now());

    // Expected: Order CONFIRMED
    expect(result.status).toBe(DeliveryStatus.CONFIRMED);

    // Verify actual DB State
    const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(dbOrder!.status).toBe(DeliveryStatus.CONFIRMED);
    expect(dbOrder!.paymentRef).toBe(paymentRef);

    // Verify Stock physically decremented
    const pA = await prisma.product.findUnique({
      where: { id: data.prodA.id },
    });
    const pB = await prisma.product.findUnique({
      where: { id: data.prodB.id },
    });
    expect(pA!.stock).toBe(3); // 5 - 2
    expect(pB!.stock).toBe(3); // 5 - 2
  });

  it('B) No hay stock → ProviderOrder rechazado + order sigue (Partial failure)', async () => {
    // Prod A lacks stock (1 available), Prod B has stock (5 available)
    const data = await setupTestData(1, 5);
    // User tries to buy 2 units of each
    const order = await createTestOrder(data, 2, 2);

    const result: any = await paymentsService.confirmPayment(
      order.id,
      'PAY_B_' + Date.now(),
      'evt_B_' + Date.now(),
    );

    // Expected: Order remains CONFIRMED (because at least B survives)
    expect(result.status).toBe(DeliveryStatus.CONFIRMED);

    // DB Verification
    const poList = await prisma.providerOrder.findMany({
      where: { orderId: order.id },
    });
    const poA = poList.find((po) => po.providerId === data.provA.id);
    const poB = poList.find((po) => po.providerId === data.provB.id);

    expect(poA!.status).toBe(ProviderOrderStatus.REJECTED_BY_STORE);
    expect(poB!.status).toBe(ProviderOrderStatus.PENDING); // PENDING logic wait! Wait, in my code I don't set ProviderOrder to ACCEPTED yet. I just kept them PENDING. Yes, the ProviderOrderStatus remains PENDING until the store manually accepts.

    // Verify Stock: Product A should NOT be decremented. Product B should be decremented.
    const pA = await prisma.product.findUnique({
      where: { id: data.prodA.id },
    });
    const pB = await prisma.product.findUnique({
      where: { id: data.prodB.id },
    });
    expect(pA!.stock).toBe(1); // Unchanged!
    expect(pB!.stock).toBe(3); // 5 - 2 = 3
  });

  it('C) Todos rechazados → Order CANCELLED', async () => {
    // Neither product has enough stock
    const data = await setupTestData(0, 0);
    const order = await createTestOrder(data, 2, 2);

    const result: any = await paymentsService.confirmPayment(
      order.id,
      'PAY_C_' + Date.now(),
      'evt_C_' + Date.now(),
    );

    expect(result.status).toBe(DeliveryStatus.CANCELLED);

    // Verify Stock unchanged
    const pA = await prisma.product.findUnique({
      where: { id: data.prodA.id },
    });
    const pB = await prisma.product.findUnique({
      where: { id: data.prodB.id },
    });
    expect(pA!.stock).toBe(0);
    expect(pB!.stock).toBe(0);
  });

  it('D) Concurrencia: dos confirmPayment a la vez no generan overselling', async () => {
    const data = await setupTestData(1, 10); // Only 1 unit of A available!

    // Create 2 separate orders wanting 1 unit of A each
    const order1 = await createTestOrder(data, 1, 1);
    const order2 = await createTestOrder(data, 1, 1);

    // Fire confirmation simultaneously
    const now = Date.now();
    const p1 = paymentsService.confirmPayment(
      order1.id,
      'PAY_CONCURRENT_1_' + now,
      'evt_D1_' + now,
    );
    const p2 = paymentsService.confirmPayment(
      order2.id,
      'PAY_CONCURRENT_2_' + now,
      'evt_D2_' + now,
    );

    await Promise.allSettled([p1, p2]);

    // Inspect
    // Promise resolution check if needed

    // Depending on DB isolation and CPU timing, either:
    // - One fulfills perfectly, the other resolves gracefully with Partial Failure (Product A REJECTED, Product B CONFIRMED).
    // - Or the second one throws an Error ('Concurrent stock update detected') if phase A passes but phase B blocks.
    // In our specific schema and Prisma's row lock, the second transaction will either see stock=0 in Phase A (graceful partial reject)
    // or fail in Phase B (throws error). Both outcomes are safe (No Overselling!).

    // Verify Physical Stock limits are preserved!
    const pA = await prisma.product.findUnique({
      where: { id: data.prodA.id },
    });
    // Can be 0 if the checkout completed before the partial rollback, or 1 if it rolled back early. Both mean we did not oversell.
    expect(pA!.stock).toBeGreaterThanOrEqual(0);

    // And product B (uncontested) should have decremented based on how many promises succeeded Phase B.
    const pB = await prisma.product.findUnique({
      where: { id: data.prodB.id },
    });
    expect(pB!.stock).toBeGreaterThanOrEqual(8);
  });
});
