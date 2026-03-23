import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PaymentAccountOwnerType,
  ProviderPaymentStatus,
  RunnerPaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RefundBoundaryResolutionService } from './refund-boundary-resolution.service';

describe('RefundBoundaryResolutionService', () => {
  let service: RefundBoundaryResolutionService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      paymentAccount: {
        findFirst: jest.fn(),
        upsert: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      deliveryIncident: {
        findUnique: jest.fn(),
      },
      providerOrder: {
        findUnique: jest.fn(),
      },
      deliveryOrder: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundBoundaryResolutionService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<RefundBoundaryResolutionService>(
      RefundBoundaryResolutionService,
    );
  });

  it('resolves an active Stripe account directly when present', async () => {
    prismaMock.paymentAccount.findFirst.mockResolvedValue({
      id: 'pa-1',
      isActive: true,
    });

    const result = await service.resolveStripeAccount(
      PaymentAccountOwnerType.PROVIDER,
      'provider-1',
    );

    expect(result).toEqual({ id: 'pa-1', isActive: true });
  });

  it('falls back to user.stripeAccountId and upserts the payment account', async () => {
    prismaMock.paymentAccount.findFirst.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({
      stripeAccountId: 'acct_123',
    });
    prismaMock.paymentAccount.upsert.mockResolvedValue({
      id: 'pa-2',
      externalAccountId: 'acct_123',
    });

    const result = await service.resolveStripeAccount(
      PaymentAccountOwnerType.PROVIDER,
      'provider-1',
    );

    expect(prismaMock.paymentAccount.upsert).toHaveBeenCalled();
    expect(result).toEqual({ id: 'pa-2', externalAccountId: 'acct_123' });
  });

  it('resolves a provider refund boundary', async () => {
    prismaMock.providerOrder.findUnique.mockResolvedValue({
      id: 'po-1',
      providerId: 'provider-1',
      subtotalAmount: 10,
      paymentRef: 'pi_1',
      paymentStatus: ProviderPaymentStatus.PAID,
      order: {
        id: 'order-1',
        clientId: 'client-1',
        deliveryOrder: { id: 'delivery-1' },
      },
    });

    const result = await service.resolveProviderBoundary(prismaMock, 'po-1');

    expect(result).toMatchObject({
      kind: 'PROVIDER_ORDER',
      id: 'po-1',
      providerId: 'provider-1',
      clientId: 'client-1',
      orderId: 'order-1',
      incidentDeliveryOrderId: 'delivery-1',
    });
  });

  it('resolves a delivery refund boundary', async () => {
    prismaMock.deliveryOrder.findUnique.mockResolvedValue({
      id: 'delivery-1',
      runnerId: 'runner-1',
      deliveryFee: 5.5,
      currency: 'EUR',
      paymentRef: 'pi_2',
      paymentStatus: RunnerPaymentStatus.PAID,
      order: {
        clientId: 'client-1',
      },
    });

    const result = await service.resolveDeliveryBoundary(
      prismaMock,
      'delivery-1',
    );

    expect(result).toMatchObject({
      kind: 'DELIVERY_ORDER',
      id: 'delivery-1',
      runnerId: 'runner-1',
      clientId: 'client-1',
      capturedAmount: 5.5,
    });
  });

  it('rejects incidents that do not belong to the selected boundary', async () => {
    prismaMock.deliveryIncident.findUnique.mockResolvedValue({
      id: 'incident-1',
      deliveryOrderId: 'delivery-other',
    });

    await expect(
      service.ensureIncidentMatchesBoundary(
        'incident-1',
        {
          kind: 'DELIVERY_ORDER',
          id: 'delivery-1',
          runnerId: 'runner-1',
          clientId: 'client-1',
          capturedAmount: 5.5,
          currency: 'EUR',
          paymentRef: 'pi_2',
          paymentStatus: RunnerPaymentStatus.PAID,
        },
        prismaMock,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('fails when provider order boundary is missing', async () => {
    prismaMock.providerOrder.findUnique.mockResolvedValue(null);

    await expect(
      service.resolveProviderBoundary(prismaMock, 'missing-po'),
    ).rejects.toThrow(NotFoundException);
  });
});
