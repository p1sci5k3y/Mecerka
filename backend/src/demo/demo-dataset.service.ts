import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEMO_EMAIL_DOMAIN,
  DEMO_EXPECTED_DELIVERY_COUNT,
  DEMO_EXPECTED_ORDER_COUNT,
  DEMO_PRODUCTS,
  type DemoDatasetStatus,
} from './demo.seed-data';
import { type DemoUserSeed } from './demo-user-bootstrap.service';

@Injectable()
export class DemoDatasetService {
  constructor(private readonly prisma: PrismaService) {}

  async getDemoDatasetStatus(): Promise<DemoDatasetStatus> {
    const [users, products, orders, deliveries] = await Promise.all([
      this.prisma.user.count({
        where: {
          email: { endsWith: DEMO_EMAIL_DOMAIN },
        },
      }),
      this.prisma.product.count({
        where: {
          imageUrl: {
            startsWith: '/demo-products/',
          },
        },
      }),
      this.prisma.order.count({
        where: {
          client: {
            email: { endsWith: DEMO_EMAIL_DOMAIN },
          },
        },
      }),
      this.prisma.deliveryOrder.count({
        where: {
          order: {
            client: {
              email: { endsWith: DEMO_EMAIL_DOMAIN },
            },
          },
        },
      }),
    ]);

    return { users, products, orders, deliveries };
  }

  hasAnyDemoData(status: DemoDatasetStatus) {
    return (
      status.users > 0 ||
      status.products > 0 ||
      status.orders > 0 ||
      status.deliveries > 0
    );
  }

  isDemoDatasetComplete(status: DemoDatasetStatus, demoUsers: DemoUserSeed[]) {
    return (
      status.users >= demoUsers.length &&
      status.products >= DEMO_PRODUCTS.length &&
      status.orders >= DEMO_EXPECTED_ORDER_COUNT &&
      status.deliveries >= DEMO_EXPECTED_DELIVERY_COUNT
    );
  }
}
