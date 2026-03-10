import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeliveryStatus, ProviderOrderStatus } from '@prisma/client';

@Injectable()
export class PaymentsService {
    private readonly logger = new Logger(PaymentsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly eventEmitter: EventEmitter2,
    ) { }

    async isProcessed(eventId: string): Promise<boolean> {
        const event = await this.prisma.webhookEvent.findUnique({
            where: { id: eventId },
        });
        return !!event;
    }

    private async attemptStockDeduction(tx: any, items: any[]): Promise<boolean> {
        const productIds = items.map((i) => i.productId);
        const products = await tx.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, stock: true },
        });
        const productMap = new Map(products.map((p: any) => [p.id, p]));

        for (const item of items) {
            const p: any = productMap.get(item.productId);
            if (!p || p.stock < item.quantity) {
                return false;
            }
        }

        for (const item of items) {
            await tx.product.updateMany({
                where: {
                    id: item.productId,
                    stock: { gte: item.quantity },
                },
                data: {
                    stock: { decrement: item.quantity },
                },
            });
        }
        return true;
    }

    /**
     * Completes the payment process idempotently using a webhook event ID.
     * Handles partial fulfillment if stock runs out concurrently.
     */
    async confirmPayment(orderId: string, paymentRef: string, eventId: string) {
        // 1. Early idempotency check
        if (await this.isProcessed(eventId)) {
            return { message: 'Webhook already processed' };
        }

        const result: any = await this.prisma.$transaction(async (tx) => {
            // 2. Atomic Event Registration
            try {
                await tx.webhookEvent.create({
                    data: { id: eventId },
                });
            } catch (e: any) {
                if (e.code === 'P2002') return { message: 'Webhook already processed concurrently' };
                throw e;
            }

            // 3. Fetch Order with pending state
            const order = await tx.order.findUnique({
                where: { id: orderId },
                include: {
                    providerOrders: {
                        include: { items: true },
                    },
                },
            });

            if (!order) {
                throw new NotFoundException('Order not found');
            }

            if (order.status !== DeliveryStatus.PENDING) {
                return { message: 'Order is no longer PENDING', status: order.status };
            }

            const confirmedProviderOrders: string[] = [];
            const rejectedProviderOrders: string[] = [];

            // 4. Optimistic Stock Deduction & Partial Fulfillment Logic
            for (const po of order.providerOrders) {
                const providerHasStock = await this.attemptStockDeduction(tx, po.items);

                if (providerHasStock) {
                    confirmedProviderOrders.push(po.id);
                    // ProviderOrder remains PENDING until the store manually accepts it
                } else {
                    rejectedProviderOrders.push(po.id);
                    await tx.providerOrder.update({
                        where: { id: po.id },
                        data: { status: ProviderOrderStatus.REJECTED_BY_STORE },
                    });
                }
            }

            // 5. Update Order to final state using optimistic concurrency
            const allRejected = confirmedProviderOrders.length === 0;
            const finalStatus = allRejected ? DeliveryStatus.CANCELLED : DeliveryStatus.CONFIRMED;

            const updatedOrder = await tx.order.updateMany({
                where: { id: orderId, status: DeliveryStatus.PENDING },
                data: {
                    status: finalStatus,
                    paymentRef,
                    confirmedAt: new Date(),
                },
            });

            if (updatedOrder.count === 0) {
                throw new ConflictException('Order status changed concurrently during payment confirmation');
            }

            // 6. Return events to decouple downstream logic from transaction
            return {
                success: true,
                orderId: order.id,
                status: finalStatus,
                paymentRef,
                _events: {
                    stateChanged: {
                        orderId: order.id,
                        status: finalStatus,
                        paymentRef,
                    },
                    partialCancelled: (!allRejected && rejectedProviderOrders.length > 0) ? {
                        orderId: order.id,
                        rejectedProviderOrderIds: rejectedProviderOrders
                    } : null
                }
            };
        });

        if (result?._events) {
            this.eventEmitter.emit('order.stateChanged', result._events.stateChanged);
            if (result._events.partialCancelled) {
                this.eventEmitter.emit('order.partialCancelled', result._events.partialCancelled);
            }
            delete result._events;
        }

        return result;
    }
}
