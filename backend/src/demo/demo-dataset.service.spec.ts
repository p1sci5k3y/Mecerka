import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEMO_EXPECTED_DELIVERY_COUNT,
  DEMO_EXPECTED_ORDER_COUNT,
  DEMO_PRODUCTS,
  DEMO_USERS,
} from './demo.seed-data';
import { DemoDatasetService } from './demo-dataset.service';

describe('DemoDatasetService', () => {
  let service: DemoDatasetService;
  let prismaMock: {
    user: { count: jest.Mock };
    product: { count: jest.Mock };
    order: { count: jest.Mock };
    deliveryOrder: { count: jest.Mock };
  };

  beforeEach(async () => {
    prismaMock = {
      user: { count: jest.fn().mockResolvedValue(0) },
      product: { count: jest.fn().mockResolvedValue(0) },
      order: { count: jest.fn().mockResolvedValue(0) },
      deliveryOrder: { count: jest.fn().mockResolvedValue(0) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemoDatasetService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(DemoDatasetService);
  });

  it('returns aggregated demo dataset counts', async () => {
    prismaMock.user.count.mockResolvedValue(DEMO_USERS.length);
    prismaMock.product.count.mockResolvedValue(DEMO_PRODUCTS.length);
    prismaMock.order.count.mockResolvedValue(DEMO_EXPECTED_ORDER_COUNT);
    prismaMock.deliveryOrder.count.mockResolvedValue(
      DEMO_EXPECTED_DELIVERY_COUNT,
    );

    await expect(service.getDemoDatasetStatus()).resolves.toEqual({
      users: DEMO_USERS.length,
      products: DEMO_PRODUCTS.length,
      orders: DEMO_EXPECTED_ORDER_COUNT,
      deliveries: DEMO_EXPECTED_DELIVERY_COUNT,
    });
  });

  it('detects partial demo data', () => {
    expect(
      service.hasAnyDemoData({
        users: 0,
        products: 1,
        orders: 0,
        deliveries: 0,
      }),
    ).toBe(true);
  });

  it('detects a complete demo dataset', () => {
    expect(
      service.isDemoDatasetComplete(
        {
          users: DEMO_USERS.length,
          products: DEMO_PRODUCTS.length,
          orders: DEMO_EXPECTED_ORDER_COUNT,
          deliveries: DEMO_EXPECTED_DELIVERY_COUNT,
        },
        DEMO_USERS,
      ),
    ).toBe(true);
  });
});
