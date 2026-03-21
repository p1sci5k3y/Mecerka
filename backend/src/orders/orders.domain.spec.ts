import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import {
  DeliveryStatus,
  PaymentSessionStatus,
  ProviderOrderStatus,
  ProviderPaymentStatus,
  Role,
  StockReservationStatus,
} from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderQueryService } from './order-query.service';
import { OrderItemsService } from './order-items.service';
import { OrderStatusService } from './order-status.service';
import { PaymentsService } from '../payments/payments.service';
import { StripeWebhookService } from '../payments/stripe-webhook.service';
import { PrismaService } from '../prisma/prisma.service';
import { GEOCODING_SERVICE } from '../geocoding/geocoding.constants';
import { assertTestEnvironment } from '../../test/test-env';
import { IOrderRepository } from './repositories/order.repository.interface';
import { PrismaOrderRepository } from './repositories/prisma-order.repository';

jest.setTimeout(20000);

describe('OrdersService - Provider Payment Domain', () => {
  let paymentsService: PaymentsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    assertTestEnvironment();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        OrderItemsService,
        OrderStatusService,
        PaymentsService,
        StripeWebhookService,
        PrismaService,
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: GEOCODING_SERVICE,
          useValue: {
            geocodeAddress: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('dummy') },
        },
        PrismaOrderRepository,
        { provide: IOrderRepository, useClass: PrismaOrderRepository },
        {
          provide: OrderQueryService,
          useValue: {
            getOrderTracking: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            getAvailableOrders: jest.fn(),
            getProviderTopProducts: jest.fn(),
            getProviderStats: jest.fn(),
            getProviderSalesChart: jest.fn(),
          },
        },
      ],
    }).compile();

    paymentsService = module.get<PaymentsService>(PaymentsService);
    prisma = module.get<PrismaService>(PrismaService);
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastEmailSentAt" TIMESTAMP(3)',
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

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
        stripeAccountId: `acct_provider_a_${rand}`,
      },
    });

    const provB = await prisma.user.create({
      data: {
        email: `proB_${rand}@test.com`,
        password: 'pass',
        name: 'Prov B',
        roles: { set: [Role.PROVIDER] },
        stripeAccountId: `acct_provider_b_${rand}`,
      },
    });

    const prodA = await prisma.product.create({
      data: {
        reference: `PROD-A-${rand}`,
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
        reference: `PROD-B-${rand}`,
        name: 'Prod B',
        price: 15,
        stock: stockB,
        providerId: provB.id,
        cityId: city.id,
        categoryId: cat.id,
      },
    });

    return { client, city, provA, provB, prodA, prodB };
  }

  async function createTestOrder(data: any, qtyA: number, qtyB: number) {
    return prisma.order.create({
      data: {
        clientId: data.client.id,
        cityId: data.city.id,
        checkoutIdempotencyKey: `domain-order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        totalPrice: qtyA * 10 + qtyB * 15,
        deliveryFee: 5,
        status: DeliveryStatus.PENDING,
        providerOrders: {
          create: [
            {
              providerId: data.provA.id,
              status: ProviderOrderStatus.PENDING,
              subtotalAmount: qtyA * 10,
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
              subtotalAmount: qtyB * 15,
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
      include: {
        providerOrders: {
          include: {
            items: true,
          },
        },
      },
    });
  }

  async function seedPaymentFixtures(orderId: string) {
    const providerOrders = await prisma.providerOrder.findMany({
      where: { orderId },
      include: {
        items: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    return Promise.all(
      providerOrders.map(async (providerOrder, index) => {
        const session = await prisma.providerPaymentSession.create({
          data: {
            providerOrderId: providerOrder.id,
            paymentProvider: 'STRIPE',
            externalSessionId: `pi_domain_${index}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            status: PaymentSessionStatus.READY,
            expiresAt,
          },
        });

        await prisma.stockReservation.createMany({
          data: providerOrder.items.map((item) => ({
            providerOrderId: providerOrder.id,
            productId: item.productId,
            quantity: item.quantity,
            status: StockReservationStatus.ACTIVE,
            expiresAt,
          })),
        });

        await prisma.providerOrder.update({
          where: { id: providerOrder.id },
          data: {
            paymentStatus: ProviderPaymentStatus.PAYMENT_READY,
            paymentRef: session.externalSessionId,
            paymentReadyAt: new Date(),
            paymentExpiresAt: expiresAt,
            status: ProviderOrderStatus.PAYMENT_READY,
          },
        });

        return {
          providerOrderId: providerOrder.id,
          providerId: providerOrder.providerId,
          paymentSessionId: session.id,
          sessionId: session.externalSessionId!,
        };
      }),
    );
  }

  function buildConfirmationPayload(
    orderId: string,
    providerOrderId: string,
    providerPaymentSessionId: string,
    accountId: string,
    amount: number,
  ) {
    return {
      amount,
      amountReceived: amount,
      currency: 'eur',
      accountId,
      metadata: {
        orderId,
        providerOrderId,
        providerPaymentSessionId,
      },
    };
  }

  it('keeps the root order pending until all provider orders are paid, then confirms it', async () => {
    const data = await setupTestData(5, 5);
    const order = await createTestOrder(data, 2, 2);
    const [providerA, providerB] = await seedPaymentFixtures(order.id);

    const firstResult: any = await paymentsService.confirmProviderOrderPayment(
      providerA.sessionId,
      `evt_A_${Date.now()}`,
      'payment_intent.succeeded',
      buildConfirmationPayload(
        order.id,
        providerA.providerOrderId,
        providerA.paymentSessionId,
        data.provA.stripeAccountId!,
        2000,
      ),
    );

    expect(firstResult.paymentStatus).toBe(ProviderPaymentStatus.PAID);
    expect(firstResult.status).toBe(DeliveryStatus.PENDING);

    const afterFirstOrder = await prisma.order.findUnique({
      where: { id: order.id },
    });
    expect(afterFirstOrder!.status).toBe(DeliveryStatus.PENDING);

    const firstProviderState = await prisma.providerOrder.findUnique({
      where: { id: providerA.providerOrderId },
    });
    const secondProviderStateBefore = await prisma.providerOrder.findUnique({
      where: { id: providerB.providerOrderId },
    });
    expect(firstProviderState!.paymentStatus).toBe(ProviderPaymentStatus.PAID);
    expect(firstProviderState!.status).toBe(ProviderOrderStatus.PAID);
    expect(secondProviderStateBefore!.paymentStatus).toBe(
      ProviderPaymentStatus.PAYMENT_READY,
    );

    const stockAfterFirstA = await prisma.product.findUnique({
      where: { id: data.prodA.id },
    });
    const stockAfterFirstB = await prisma.product.findUnique({
      where: { id: data.prodB.id },
    });
    expect(stockAfterFirstA!.stock).toBe(3);
    expect(stockAfterFirstB!.stock).toBe(5);

    const secondResult: any = await paymentsService.confirmProviderOrderPayment(
      providerB.sessionId,
      `evt_B_${Date.now()}`,
      'payment_intent.succeeded',
      buildConfirmationPayload(
        order.id,
        providerB.providerOrderId,
        providerB.paymentSessionId,
        data.provB.stripeAccountId!,
        3000,
      ),
    );

    expect(secondResult.paymentStatus).toBe(ProviderPaymentStatus.PAID);
    expect(secondResult.status).toBe(DeliveryStatus.CONFIRMED);

    const finalOrder = await prisma.order.findUnique({
      where: { id: order.id },
    });
    expect(finalOrder!.status).toBe(DeliveryStatus.CONFIRMED);

    const secondProviderState = await prisma.providerOrder.findUnique({
      where: { id: providerB.providerOrderId },
    });
    expect(secondProviderState!.paymentStatus).toBe(ProviderPaymentStatus.PAID);
    expect(secondProviderState!.status).toBe(ProviderOrderStatus.PAID);

    const finalStockA = await prisma.product.findUnique({
      where: { id: data.prodA.id },
    });
    const finalStockB = await prisma.product.findUnique({
      where: { id: data.prodB.id },
    });
    expect(finalStockA!.stock).toBe(3);
    expect(finalStockB!.stock).toBe(3);
  });

  it('confirms the root order deterministically when provider confirmations arrive concurrently', async () => {
    const data = await setupTestData(5, 5);
    const order = await createTestOrder(data, 2, 2);
    const [providerA, providerB] = await seedPaymentFixtures(order.id);

    await Promise.all([
      paymentsService.confirmProviderOrderPayment(
        providerA.sessionId,
        `evt_concurrent_A_${Date.now()}`,
        'payment_intent.succeeded',
        buildConfirmationPayload(
          order.id,
          providerA.providerOrderId,
          providerA.paymentSessionId,
          data.provA.stripeAccountId!,
          2000,
        ),
      ),
      paymentsService.confirmProviderOrderPayment(
        providerB.sessionId,
        `evt_concurrent_B_${Date.now()}`,
        'payment_intent.succeeded',
        buildConfirmationPayload(
          order.id,
          providerB.providerOrderId,
          providerB.paymentSessionId,
          data.provB.stripeAccountId!,
          3000,
        ),
      ),
    ]);

    const finalOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: {
        providerOrders: true,
      },
    });

    expect(finalOrder!.status).toBe(DeliveryStatus.CONFIRMED);
    expect(
      finalOrder!.providerOrders.every(
        (providerOrder) =>
          providerOrder.paymentStatus === ProviderPaymentStatus.PAID &&
          providerOrder.status === ProviderOrderStatus.PAID,
      ),
    ).toBe(true);
  });

  it('consumes reservations exactly once and returns safely on duplicate webhook replay', async () => {
    const data = await setupTestData(5, 5);
    const order = await createTestOrder(data, 2, 2);
    const [providerA] = await seedPaymentFixtures(order.id);

    const eventId = `evt_replay_${Date.now()}`;

    await paymentsService.confirmProviderOrderPayment(
      providerA.sessionId,
      eventId,
      'payment_intent.succeeded',
      buildConfirmationPayload(
        order.id,
        providerA.providerOrderId,
        providerA.paymentSessionId,
        data.provA.stripeAccountId!,
        2000,
      ),
    );

    const replayResult = await paymentsService.confirmProviderOrderPayment(
      providerA.sessionId,
      eventId,
      'payment_intent.succeeded',
      buildConfirmationPayload(
        order.id,
        providerA.providerOrderId,
        providerA.paymentSessionId,
        data.provA.stripeAccountId!,
        2000,
      ),
    );

    expect(replayResult).toEqual({ message: 'Webhook already processed' });

    const stockAfterReplay = await prisma.product.findUnique({
      where: { id: data.prodA.id },
    });
    expect(stockAfterReplay!.stock).toBe(3);

    const reservations = await prisma.stockReservation.findMany({
      where: { providerOrderId: providerA.providerOrderId },
    });
    expect(
      reservations.every((reservation) => reservation.status === 'CONSUMED'),
    ).toBe(true);
  });

  it('rejects confirmation when the provider order has no active reservations', async () => {
    const data = await setupTestData(5, 5);
    const order = await createTestOrder(data, 2, 2);
    const [providerA] = await seedPaymentFixtures(order.id);

    await prisma.stockReservation.updateMany({
      where: { providerOrderId: providerA.providerOrderId },
      data: { status: StockReservationStatus.EXPIRED },
    });

    await expect(
      paymentsService.confirmProviderOrderPayment(
        providerA.sessionId,
        `evt_missing_res_${Date.now()}`,
        'payment_intent.succeeded',
        buildConfirmationPayload(
          order.id,
          providerA.providerOrderId,
          providerA.paymentSessionId,
          data.provA.stripeAccountId!,
          2000,
        ),
      ),
    ).rejects.toThrow(
      new ConflictException(
        'ProviderOrder has no active reservations to consume',
      ),
    );

    const product = await prisma.product.findUnique({
      where: { id: data.prodA.id },
    });
    expect(product!.stock).toBe(5);

    const providerOrder = await prisma.providerOrder.findUnique({
      where: { id: providerA.providerOrderId },
    });
    expect(providerOrder!.paymentStatus).toBe(
      ProviderPaymentStatus.PAYMENT_READY,
    );
  });

  it('allows retry of the same webhook event after a failed confirmation', async () => {
    const data = await setupTestData(5, 5);
    const order = await createTestOrder(data, 2, 2);
    const [providerA] = await seedPaymentFixtures(order.id);
    const eventId = `evt_retry_failed_${Date.now()}`;

    await prisma.stockReservation.updateMany({
      where: { providerOrderId: providerA.providerOrderId },
      data: { status: StockReservationStatus.EXPIRED },
    });

    await expect(
      paymentsService.confirmProviderOrderPayment(
        providerA.sessionId,
        eventId,
        'payment_intent.succeeded',
        buildConfirmationPayload(
          order.id,
          providerA.providerOrderId,
          providerA.paymentSessionId,
          data.provA.stripeAccountId!,
          2000,
        ),
      ),
    ).rejects.toThrow(
      new ConflictException(
        'ProviderOrder has no active reservations to consume',
      ),
    );

    const failedWebhookEvent = await prisma.paymentWebhookEvent.findUnique({
      where: { id: eventId },
    });
    expect(failedWebhookEvent!.status).toBe('FAILED');

    const refreshedExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await prisma.stockReservation.updateMany({
      where: { providerOrderId: providerA.providerOrderId },
      data: {
        status: StockReservationStatus.ACTIVE,
        expiresAt: refreshedExpiresAt,
      },
    });

    await prisma.providerOrder.update({
      where: { id: providerA.providerOrderId },
      data: {
        paymentExpiresAt: refreshedExpiresAt,
      },
    });

    const retried = await paymentsService.confirmProviderOrderPayment(
      providerA.sessionId,
      eventId,
      'payment_intent.succeeded',
      buildConfirmationPayload(
        order.id,
        providerA.providerOrderId,
        providerA.paymentSessionId,
        data.provA.stripeAccountId!,
        2000,
      ),
    );

    expect(retried).toEqual(
      expect.objectContaining({
        success: true,
        providerOrderId: providerA.providerOrderId,
        paymentStatus: ProviderPaymentStatus.PAID,
      }),
    );

    const retriedWebhookEvent = await prisma.paymentWebhookEvent.findUnique({
      where: { id: eventId },
    });
    expect(retriedWebhookEvent!.status).toBe('PROCESSED');
  });
});
