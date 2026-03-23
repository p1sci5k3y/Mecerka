import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryStatus,
  PaymentSessionStatus,
  Prisma,
  ProviderOrderStatus,
  ProviderPaymentStatus,
} from '@prisma/client';
import { ProviderPaymentConfirmationResult } from './provider-payment-confirmation.types';

type SettlementPaymentSession = {
  id: string;
};

type SettlementProviderOrder = {
  id: string;
  subtotalAmount: number | Prisma.Decimal;
  order: {
    id: string;
    status: DeliveryStatus;
  };
  reservations: Array<{
    id: string;
    productId: string;
    quantity: number;
  }>;
};

@Injectable()
export class ProviderPaymentSettlementService {
  async settleConfirmedProviderPayment(
    tx: Prisma.TransactionClient,
    paymentSession: SettlementPaymentSession,
    providerOrder: SettlementProviderOrder,
    externalSessionId: string,
    now: Date,
  ): Promise<ProviderPaymentConfirmationResult> {
    await tx.$executeRaw(
      Prisma.sql`SELECT 1 FROM "Order" WHERE "id" = ${providerOrder.order.id}::uuid FOR UPDATE`,
    );

    const productIds = [
      ...new Set(
        providerOrder.reservations.map((reservation) => reservation.productId),
      ),
    ].sort();

    await tx.$executeRaw(
      Prisma.sql`SELECT 1 FROM "Product" WHERE "id" IN (${Prisma.join(
        productIds.map((id) => Prisma.sql`${id}::uuid`),
      )}) FOR UPDATE`,
    );

    const reservationIds = providerOrder.reservations.map(
      (reservation) => reservation.id,
    );

    const consumedReservations = await tx.stockReservation.updateMany({
      where: {
        id: {
          in: reservationIds,
        },
        providerOrderId: providerOrder.id,
        status: 'ACTIVE',
      },
      data: {
        status: 'CONSUMED',
      },
    });

    if (consumedReservations.count !== reservationIds.length) {
      throw new ConflictException(
        'Reservations changed during payment confirmation',
      );
    }

    for (const reservation of providerOrder.reservations) {
      const updated = await tx.product.updateMany({
        where: {
          id: reservation.productId,
          stock: { gte: reservation.quantity },
        },
        data: {
          stock: { decrement: reservation.quantity },
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException(
          'Concurrent stock update detected during payment confirmation',
        );
      }
    }

    await tx.providerPaymentSession.update({
      where: { id: paymentSession.id },
      data: {
        status: PaymentSessionStatus.COMPLETED,
      },
    });

    await tx.providerOrder.update({
      where: { id: providerOrder.id },
      data: {
        paymentStatus: ProviderPaymentStatus.PAID,
        status: ProviderOrderStatus.PAID,
        paidAt: now,
      },
    });

    const refreshedOrder = await tx.order.findUnique({
      where: { id: providerOrder.order.id },
      select: {
        id: true,
        status: true,
        providerOrders: {
          select: {
            id: true,
            paymentStatus: true,
          },
        },
      },
    });

    if (!refreshedOrder) {
      throw new NotFoundException('Order not found');
    }

    const allProviderOrdersPaid = refreshedOrder.providerOrders.every(
      (sibling) => sibling.paymentStatus === ProviderPaymentStatus.PAID,
    );

    let updatedOrderStatus = refreshedOrder.status;
    if (
      allProviderOrdersPaid &&
      refreshedOrder.status === DeliveryStatus.PENDING
    ) {
      updatedOrderStatus = DeliveryStatus.CONFIRMED;
      await tx.order.update({
        where: { id: refreshedOrder.id },
        data: {
          status: DeliveryStatus.CONFIRMED,
          confirmedAt: now,
        },
      });
    }

    return {
      success: true,
      orderId: refreshedOrder.id,
      providerOrderId: providerOrder.id,
      status: updatedOrderStatus,
      paymentStatus: ProviderPaymentStatus.PAID,
      paymentRef: externalSessionId,
      _events: {
        stateChanged: {
          orderId: refreshedOrder.id,
          status: updatedOrderStatus,
          paymentRef: externalSessionId,
        },
        partialCancelled: null,
      },
    };
  }
}
