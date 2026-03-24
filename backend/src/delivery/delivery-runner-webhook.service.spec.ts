import { NotFoundException } from '@nestjs/common';
import {
  DeliveryOrderStatus,
  PaymentSessionStatus,
  RunnerPaymentStatus,
} from '@prisma/client';
import { DeliveryRunnerWebhookService } from './delivery-runner-webhook.service';

describe('DeliveryRunnerWebhookService', () => {
  let prismaMock: any;
  let emitRiskEvent: jest.Mock;
  let service: DeliveryRunnerWebhookService;

  beforeEach(() => {
    prismaMock = {
      $transaction: jest.fn(),
      runnerWebhookEvent: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    emitRiskEvent = jest.fn().mockResolvedValue(undefined);
    service = new DeliveryRunnerWebhookService(prismaMock, emitRiskEvent);
  });

  it('returns a duplicate message when a confirm webhook event was already claimed', async () => {
    prismaMock.runnerWebhookEvent.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.confirmRunnerPayment('pi_runner_123', 'evt_duplicate'),
    ).resolves.toEqual({ message: 'Runner webhook already processed' });

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.runnerWebhookEvent.update).not.toHaveBeenCalled();
  });

  it('marks completed sessions as ignored without mutating delivery state', async () => {
    prismaMock.runnerWebhookEvent.create.mockResolvedValue({
      id: 'evt_complete',
    });
    prismaMock.runnerWebhookEvent.update.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        runnerPaymentSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'session-1',
            deliveryOrderId: 'delivery-1',
            status: PaymentSessionStatus.COMPLETED,
            deliveryOrder: {
              status: DeliveryOrderStatus.PICKUP_PENDING,
              paymentStatus: RunnerPaymentStatus.PAID,
              order: { clientId: 'client-1' },
            },
          }),
        },
      }),
    );

    await expect(
      service.confirmRunnerPayment('pi_runner_123', 'evt_complete'),
    ).resolves.toEqual({
      deliveryOrderId: 'delivery-1',
      status: DeliveryOrderStatus.PICKUP_PENDING,
      paymentStatus: RunnerPaymentStatus.PAID,
    });

    expect(prismaMock.runnerWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt_complete' },
      data: expect.objectContaining({ status: 'PROCESSED' }),
    });
  });

  it('marks failed webhook events when confirmRunnerPayment cannot find a session', async () => {
    prismaMock.runnerWebhookEvent.create.mockResolvedValue({
      id: 'evt_missing',
    });
    prismaMock.runnerWebhookEvent.update.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        runnerPaymentSession: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      }),
    );

    await expect(
      service.confirmRunnerPayment('missing', 'evt_missing'),
    ).rejects.toThrow(NotFoundException);

    expect(prismaMock.runnerWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt_missing' },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
  });

  it('returns a duplicate message when a failed-payment webhook was already claimed', async () => {
    prismaMock.runnerWebhookEvent.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.failRunnerPayment('pi_runner_123', 'evt_duplicate_fail'),
    ).resolves.toEqual({ message: 'Runner webhook already processed' });

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(emitRiskEvent).not.toHaveBeenCalled();
  });

  it('does not emit risk events when the failed-payment webhook targets an already completed session', async () => {
    prismaMock.runnerWebhookEvent.create.mockResolvedValue({
      id: 'evt_fail_complete',
    });
    prismaMock.runnerWebhookEvent.update.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        runnerPaymentSession: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'session-1',
            deliveryOrderId: 'delivery-1',
            status: PaymentSessionStatus.COMPLETED,
            deliveryOrder: {
              status: DeliveryOrderStatus.DELIVERED,
              paymentStatus: RunnerPaymentStatus.PAID,
              order: { clientId: 'client-1' },
            },
          }),
        },
      }),
    );

    await expect(
      service.failRunnerPayment('pi_runner_123', 'evt_fail_complete'),
    ).resolves.toEqual({
      deliveryOrderId: 'delivery-1',
      status: DeliveryOrderStatus.DELIVERED,
      paymentStatus: RunnerPaymentStatus.PAID,
    });

    expect(emitRiskEvent).not.toHaveBeenCalled();
    expect(prismaMock.runnerWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt_fail_complete' },
      data: expect.objectContaining({ status: 'PROCESSED' }),
    });
  });

  it('marks failed webhook events when failRunnerPayment cannot find a session', async () => {
    prismaMock.runnerWebhookEvent.create.mockResolvedValue({
      id: 'evt_fail_missing',
    });
    prismaMock.runnerWebhookEvent.update.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        runnerPaymentSession: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      }),
    );

    await expect(
      service.failRunnerPayment('missing', 'evt_fail_missing'),
    ).rejects.toThrow(NotFoundException);

    expect(prismaMock.runnerWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt_fail_missing' },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
  });

  it('rethrows non-duplicate webhook claim failures', async () => {
    const error = new Error('db unavailable');
    prismaMock.runnerWebhookEvent.create.mockRejectedValue(error);

    await expect(
      service.confirmRunnerPayment('pi_runner_123', 'evt_error'),
    ).rejects.toThrow(error);
  });
});
