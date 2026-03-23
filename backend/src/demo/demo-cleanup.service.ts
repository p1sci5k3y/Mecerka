import { Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DemoCleanupService {
  private readonly logger = new Logger(DemoCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  async cleanupDemoData(adminActorId: string, demoEmailDomain: string) {
    const demoUsers = await this.prisma.user.findMany({
      where: {
        email: { endsWith: demoEmailDomain },
      },
      select: {
        id: true,
        email: true,
        roles: true,
      },
    });

    const userIds = demoUsers.map((user) => user.id);
    const providerIds = demoUsers
      .filter((user) => user.roles.includes(Role.PROVIDER))
      .map((user) => user.id);
    const runnerIds = demoUsers
      .filter((user) => user.roles.includes(Role.RUNNER))
      .map((user) => user.id);

    const orders = await this.prisma.order.findMany({
      where: {
        clientId: {
          in: userIds,
        },
      },
      select: {
        id: true,
      },
    });
    const orderIds = orders.map((order) => order.id);

    const providerOrders = orderIds.length
      ? await this.prisma.providerOrder.findMany({
          where: {
            orderId: {
              in: orderIds,
            },
          },
          select: {
            id: true,
          },
        })
      : [];
    const providerOrderIds = providerOrders.map(
      (providerOrder) => providerOrder.id,
    );

    const deliveryOrders = orderIds.length
      ? await this.prisma.deliveryOrder.findMany({
          where: {
            orderId: {
              in: orderIds,
            },
          },
          select: {
            id: true,
          },
        })
      : [];
    const deliveryOrderIds = deliveryOrders.map(
      (deliveryOrder) => deliveryOrder.id,
    );

    const deliveryJobs = deliveryOrderIds.length
      ? await this.prisma.deliveryJob.findMany({
          where: {
            deliveryOrderId: {
              in: deliveryOrderIds,
            },
          },
          select: {
            id: true,
          },
        })
      : [];
    const deliveryJobIds = deliveryJobs.map((job) => job.id);

    const products = providerIds.length
      ? await this.prisma.product.findMany({
          where: {
            providerId: {
              in: providerIds,
            },
          },
          select: {
            id: true,
          },
        })
      : [];
    const productIds = products.map((product) => product.id);

    await this.prisma.$transaction(async (tx) => {
      if (deliveryJobIds.length > 0) {
        await tx.deliveryJobClaim.deleteMany({
          where: {
            jobId: {
              in: deliveryJobIds,
            },
          },
        });
      }

      if (deliveryOrderIds.length > 0) {
        await tx.deliveryIncident.deleteMany({
          where: {
            deliveryOrderId: {
              in: deliveryOrderIds,
            },
          },
        });
        await tx.runnerPaymentSession.deleteMany({
          where: {
            deliveryOrderId: {
              in: deliveryOrderIds,
            },
          },
        });
        await tx.refundRequest.deleteMany({
          where: {
            deliveryOrderId: {
              in: deliveryOrderIds,
            },
          },
        });
        await tx.deliveryJob.deleteMany({
          where: {
            deliveryOrderId: {
              in: deliveryOrderIds,
            },
          },
        });
        await tx.runnerLocation.deleteMany({
          where: {
            runnerId: {
              in: runnerIds,
            },
          },
        });
        await tx.deliveryOrder.deleteMany({
          where: {
            id: {
              in: deliveryOrderIds,
            },
          },
        });
      }

      if (providerOrderIds.length > 0) {
        await tx.providerPaymentSession.deleteMany({
          where: {
            providerOrderId: {
              in: providerOrderIds,
            },
          },
        });
        await tx.stockReservation.deleteMany({
          where: {
            providerOrderId: {
              in: providerOrderIds,
            },
          },
        });
        await tx.refundRequest.deleteMany({
          where: {
            providerOrderId: {
              in: providerOrderIds,
            },
          },
        });
        await tx.orderItem.deleteMany({
          where: {
            providerOrderId: {
              in: providerOrderIds,
            },
          },
        });
        await tx.providerOrder.deleteMany({
          where: {
            id: {
              in: providerOrderIds,
            },
          },
        });
      }

      if (orderIds.length > 0) {
        await tx.orderSummaryDocument.deleteMany({
          where: {
            orderId: {
              in: orderIds,
            },
          },
        });
        await tx.order.deleteMany({
          where: {
            id: {
              in: orderIds,
            },
          },
        });
      }

      if (userIds.length > 0) {
        await tx.cartItem.deleteMany({
          where: {
            cartProvider: {
              cartGroup: {
                clientId: {
                  in: userIds,
                },
              },
            },
          },
        });
        await tx.cartProvider.deleteMany({
          where: {
            cartGroup: {
              clientId: {
                in: userIds,
              },
            },
          },
        });
        await tx.cartGroup.deleteMany({
          where: {
            clientId: {
              in: userIds,
            },
          },
        });
      }

      if (providerIds.length > 0) {
        await tx.productImportJob.deleteMany({
          where: {
            providerId: {
              in: providerIds,
            },
          },
        });
      }

      if (productIds.length > 0) {
        await tx.product.deleteMany({
          where: {
            id: {
              in: productIds,
            },
          },
        });
      }

      if (userIds.length > 0) {
        await tx.paymentAccount.deleteMany({
          where: {
            ownerId: {
              in: [...providerIds, ...runnerIds],
            },
          },
        });
        await tx.runnerProfile.deleteMany({
          where: {
            userId: {
              in: runnerIds,
            },
          },
        });
        await tx.riskEvent.deleteMany({
          where: {
            actorId: {
              in: [...userIds, ...orderIds, ...deliveryOrderIds],
            },
          },
        });
        await tx.riskScoreSnapshot.deleteMany({
          where: {
            actorId: {
              in: [...userIds, ...orderIds, ...deliveryOrderIds],
            },
          },
        });
        await tx.user.deleteMany({
          where: {
            id: {
              in: userIds,
            },
          },
        });
      }

      await tx.paymentWebhookEvent.deleteMany({
        where: {
          id: {
            startsWith: 'demo_evt_',
          },
        },
      });

      await tx.runnerWebhookEvent.deleteMany({
        where: {
          id: {
            startsWith: 'demo_evt_',
          },
        },
      });
    });

    this.logger.log(`demo.reset actor=${adminActorId} users=${userIds.length}`);

    return {
      status: 'ok',
      usersDeleted: userIds.length,
      productsDeleted: productIds.length,
      ordersDeleted: orderIds.length,
    };
  }
}
