import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentAccountOwnerType,
  PaymentAccountProvider,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestRefundDto } from './dto/request-refund.dto';
import type {
  DeliveryBoundary,
  ProviderBoundary,
  RefundBoundary,
  RefundDataClient,
} from './refund-boundary.service';

@Injectable()
export class RefundBoundaryResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveStripeAccount(
    ownerType: PaymentAccountOwnerType,
    ownerId: string,
  ) {
    const paymentAccount = await this.prisma.paymentAccount.findFirst({
      where: {
        ownerType,
        ownerId,
        provider: PaymentAccountProvider.STRIPE,
        isActive: true,
      },
    });

    if (paymentAccount) {
      return paymentAccount;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: {
        stripeAccountId: true,
      },
    });

    if (!user?.stripeAccountId) {
      return null;
    }

    return this.prisma.paymentAccount.upsert({
      where: {
        ownerType_ownerId_provider: {
          ownerType,
          ownerId,
          provider: PaymentAccountProvider.STRIPE,
        },
      },
      update: {
        externalAccountId: user.stripeAccountId,
        isActive: true,
      },
      create: {
        ownerType,
        ownerId,
        provider: PaymentAccountProvider.STRIPE,
        externalAccountId: user.stripeAccountId,
        isActive: true,
      },
    });
  }

  async ensureIncidentMatchesBoundary(
    incidentId: string | undefined,
    boundary: RefundBoundary,
    tx: RefundDataClient,
  ) {
    if (!incidentId) {
      return null;
    }

    const incident = await tx.deliveryIncident.findUnique({
      where: { id: incidentId },
      select: {
        id: true,
        deliveryOrderId: true,
      },
    });

    if (!incident) {
      throw new NotFoundException('Delivery incident not found');
    }

    if (
      boundary.kind === 'DELIVERY_ORDER' &&
      incident.deliveryOrderId !== boundary.id
    ) {
      throw new BadRequestException(
        'Incident does not belong to the selected delivery payment boundary',
      );
    }

    if (
      boundary.kind === 'PROVIDER_ORDER' &&
      incident.deliveryOrderId !== boundary.incidentDeliveryOrderId
    ) {
      throw new BadRequestException(
        'Incident does not belong to the selected provider order',
      );
    }

    return incident.id;
  }

  async resolveProviderBoundary(
    tx: RefundDataClient,
    providerOrderId: string,
  ): Promise<ProviderBoundary> {
    const providerOrder = await tx.providerOrder.findUnique({
      where: { id: providerOrderId },
      include: {
        order: {
          select: {
            id: true,
            clientId: true,
            deliveryOrder: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    if (!providerOrder) {
      throw new NotFoundException('ProviderOrder not found');
    }

    return {
      kind: 'PROVIDER_ORDER',
      id: providerOrder.id,
      providerId: providerOrder.providerId,
      clientId: providerOrder.order.clientId,
      orderId: providerOrder.order.id,
      incidentDeliveryOrderId: providerOrder.order.deliveryOrder?.id ?? null,
      capturedAmount: Number(providerOrder.subtotalAmount),
      currency: 'EUR',
      paymentRef: providerOrder.paymentRef,
      paymentStatus: providerOrder.paymentStatus,
    };
  }

  async resolveDeliveryBoundary(
    tx: RefundDataClient,
    deliveryOrderId: string,
  ): Promise<DeliveryBoundary> {
    const deliveryOrder = await tx.deliveryOrder.findUnique({
      where: { id: deliveryOrderId },
      include: {
        order: {
          select: {
            clientId: true,
          },
        },
      },
    });

    if (!deliveryOrder) {
      throw new NotFoundException('DeliveryOrder not found');
    }

    return {
      kind: 'DELIVERY_ORDER',
      id: deliveryOrder.id,
      runnerId: deliveryOrder.runnerId,
      clientId: deliveryOrder.order.clientId,
      capturedAmount: Number(deliveryOrder.deliveryFee),
      currency: deliveryOrder.currency,
      paymentRef: deliveryOrder.paymentRef,
      paymentStatus: deliveryOrder.paymentStatus,
    };
  }

  async resolveBoundaryForRequest(tx: RefundDataClient, dto: RequestRefundDto) {
    if (dto.providerOrderId) {
      return this.resolveProviderBoundary(tx, dto.providerOrderId);
    }

    if (dto.deliveryOrderId) {
      return this.resolveDeliveryBoundary(tx, dto.deliveryOrderId);
    }

    throw new BadRequestException(
      'Refund requests must reference exactly one payment boundary',
    );
  }
}
