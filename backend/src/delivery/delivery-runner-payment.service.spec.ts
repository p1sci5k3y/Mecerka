import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeliveryOrderStatus,
  PaymentSessionStatus,
  RiskActorType,
  RiskCategory,
  Role,
  RunnerPaymentStatus,
} from '@prisma/client';
import Stripe from 'stripe';
import { DeliveryRunnerPaymentService } from './delivery-runner-payment.service';
import { DeliveryRunnerWebhookService } from './delivery-runner-webhook.service';

jest.mock('stripe');

describe('DeliveryRunnerPaymentService', () => {
  let service: DeliveryRunnerPaymentService;
  let prismaMock: any;
  let configServiceMock: { get: jest.Mock };
  let assertClientOrAdminAccess: jest.Mock;
  let resolveActiveRunnerStripePaymentAccount: jest.Mock;
  let emitRiskEvent: jest.Mock;
  let logger: { log: jest.Mock };
  let stripePaymentIntentsCreate: jest.Mock;
  let stripePaymentIntentsRetrieve: jest.Mock;
  let runnerWebhookService: DeliveryRunnerWebhookService;

  beforeEach(() => {
    stripePaymentIntentsCreate = jest.fn().mockResolvedValue({
      id: 'pi_runner_123',
      client_secret: 'pi_runner_123_secret',
      livemode: false,
    });
    stripePaymentIntentsRetrieve = jest.fn().mockResolvedValue({
      id: 'pi_runner_existing',
      client_secret: 'pi_runner_existing_secret',
    });

    (Stripe as unknown as jest.Mock).mockImplementation(() => ({
      paymentIntents: {
        create: stripePaymentIntentsCreate,
        retrieve: stripePaymentIntentsRetrieve,
      },
    }));

    prismaMock = {
      $transaction: jest.fn(),
      runnerWebhookEvent: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'STRIPE_SECRET_KEY') return 'sk_test_live_like';
        if (key === 'DEMO_MODE') return 'false';
        return undefined;
      }),
    };
    assertClientOrAdminAccess = jest.fn();
    resolveActiveRunnerStripePaymentAccount = jest.fn().mockResolvedValue({
      isActive: true,
      externalAccountId: 'acct_runner_1',
    });
    emitRiskEvent = jest.fn().mockResolvedValue(undefined);
    logger = { log: jest.fn() };
    runnerWebhookService = new DeliveryRunnerWebhookService(
      prismaMock,
      emitRiskEvent,
    );

    service = new DeliveryRunnerPaymentService(
      prismaMock,
      configServiceMock as unknown as ConfigService,
      logger as any,
      assertClientOrAdminAccess,
      resolveActiveRunnerStripePaymentAccount,
      emitRiskEvent,
      runnerWebhookService,
    );
  });

  it('reuses a ready active runner payment session instead of creating a new one', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        $executeRaw: jest.fn(),
        deliveryOrder: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            runnerId: 'runner-1',
            deliveryFee: 6.5,
            currency: 'EUR',
            status: DeliveryOrderStatus.RUNNER_ASSIGNED,
            paymentStatus: RunnerPaymentStatus.PENDING,
            order: {
              id: 'order-1',
              clientId: 'client-1',
            },
            paymentSessions: [
              {
                id: 'session-1',
                externalSessionId: 'pi_runner_existing',
                status: PaymentSessionStatus.READY,
                expiresAt: new Date('2099-01-01T00:15:00.000Z'),
              },
            ],
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        runnerPaymentSession: {
          updateMany: jest.fn(),
        },
      }),
    );

    const result = await service.prepareRunnerPayment(
      'delivery-1',
      'client-1',
      [Role.CLIENT],
    );

    expect(result.externalSessionId).toBe('pi_runner_existing');
    expect(stripePaymentIntentsCreate).not.toHaveBeenCalled();
    expect(stripePaymentIntentsRetrieve).toHaveBeenCalled();
  });

  it('marks a confirmed runner payment as paid and opens pickup when needed', async () => {
    prismaMock.runnerWebhookEvent.create.mockResolvedValue({
      id: 'evt_1',
    });
    prismaMock.runnerWebhookEvent.update.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        runnerPaymentSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'session-1',
            deliveryOrderId: 'delivery-1',
            status: PaymentSessionStatus.READY,
            deliveryOrder: {
              status: DeliveryOrderStatus.RUNNER_ASSIGNED,
              paymentStatus: RunnerPaymentStatus.PENDING,
              order: { clientId: 'client-1' },
            },
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        deliveryOrder: {
          update: jest.fn().mockResolvedValue({}),
        },
      }),
    );

    const result = await service.confirmRunnerPayment('pi_runner_123', 'evt_1');

    expect(result).toEqual({
      deliveryOrderId: 'delivery-1',
      status: DeliveryOrderStatus.PICKUP_PENDING,
      paymentStatus: RunnerPaymentStatus.PAID,
    });
  });

  it('records a client risk event when the runner payment fails', async () => {
    prismaMock.runnerWebhookEvent.create.mockResolvedValue({
      id: 'evt_fail',
    });
    prismaMock.runnerWebhookEvent.update.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        runnerPaymentSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'session-1',
            deliveryOrderId: 'delivery-1',
            status: PaymentSessionStatus.READY,
            deliveryOrder: {
              status: DeliveryOrderStatus.RUNNER_ASSIGNED,
              paymentStatus: RunnerPaymentStatus.PENDING,
              order: { clientId: 'client-1' },
            },
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        deliveryOrder: {
          update: jest.fn().mockResolvedValue({}),
        },
      }),
    );

    const result = await service.failRunnerPayment('pi_runner_123', 'evt_fail');

    expect(result.paymentStatus).toBe(RunnerPaymentStatus.FAILED);
    expect(emitRiskEvent).toHaveBeenCalledWith(
      RiskActorType.CLIENT,
      'client-1',
      RiskCategory.PAYMENT_FAILURE_PATTERN,
      10,
      'runner-payment-failed:delivery-1',
      { deliveryOrderId: 'delivery-1' },
    );
  });

  it('fails cleanly in demo mode with dummy stripe credentials', async () => {
    configServiceMock.get.mockImplementation((key: string) => {
      if (key === 'STRIPE_SECRET_KEY') return 'sk_test_dummy';
      if (key === 'DEMO_MODE') return 'true';
      return undefined;
    });

    await expect(
      service.prepareRunnerPayment('delivery-1', 'client-1', [Role.CLIENT]),
    ).rejects.toThrow(ConflictException);
  });

  it('fails when the runner payment session does not exist', async () => {
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        runnerPaymentSession: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      }),
    );

    await expect(service.confirmRunnerPayment('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
