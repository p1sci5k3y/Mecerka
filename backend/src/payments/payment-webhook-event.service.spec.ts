import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import {
  PAYMENT_WEBHOOK_EVENT_STATUS,
  PaymentWebhookEventService,
} from './payment-webhook-event.service';

describe('PaymentWebhookEventService', () => {
  let service: PaymentWebhookEventService;
  let prismaMock: {
    paymentWebhookEvent: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      paymentWebhookEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentWebhookEventService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<PaymentWebhookEventService>(
      PaymentWebhookEventService,
    );
  });

  it('returns false when the webhook event does not exist', async () => {
    prismaMock.paymentWebhookEvent.findUnique.mockResolvedValue(null);

    await expect(service.isProcessed('evt_missing')).resolves.toBe(false);
  });

  it('returns true only for terminal statuses', async () => {
    prismaMock.paymentWebhookEvent.findUnique.mockResolvedValue({
      status: PAYMENT_WEBHOOK_EVENT_STATUS.PROCESSED,
    });
    await expect(service.isProcessed('evt_processed')).resolves.toBe(true);

    prismaMock.paymentWebhookEvent.findUnique.mockResolvedValue({
      status: PAYMENT_WEBHOOK_EVENT_STATUS.RECEIVED,
    });
    await expect(service.isProcessed('evt_received')).resolves.toBe(false);
  });

  it('claims a fresh webhook event', async () => {
    prismaMock.paymentWebhookEvent.create.mockResolvedValue({});

    await expect(
      service.claim('evt_new', 'STRIPE', 'checkout.session.completed'),
    ).resolves.toBe(true);
  });

  it('reclaims stale or failed webhook events after a duplicate insert race', async () => {
    prismaMock.paymentWebhookEvent.create.mockRejectedValue({ code: 'P2002' });
    prismaMock.paymentWebhookEvent.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.claim('evt_stale', 'STRIPE', 'checkout.session.completed'),
    ).resolves.toBe(true);
  });

  it('returns false when another worker already owns the webhook event', async () => {
    prismaMock.paymentWebhookEvent.create.mockRejectedValue({ code: 'P2002' });
    prismaMock.paymentWebhookEvent.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.claim('evt_owned', 'STRIPE', 'checkout.session.completed'),
    ).resolves.toBe(false);
  });

  it('marks the webhook event status', async () => {
    prismaMock.paymentWebhookEvent.update.mockResolvedValue({});

    await service.markStatus(
      'evt_done',
      PAYMENT_WEBHOOK_EVENT_STATUS.PROCESSED,
      new Date('2026-01-01T00:00:00.000Z'),
    );

    expect(prismaMock.paymentWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'evt_done' },
        data: expect.objectContaining({
          status: PAYMENT_WEBHOOK_EVENT_STATUS.PROCESSED,
        }),
      }),
    );
  });
});
