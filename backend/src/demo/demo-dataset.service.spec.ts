import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { DEMO_USERS } from './demo.seed-data';
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
    prismaMock.user.count.mockResolvedValue(7);
    prismaMock.product.count.mockResolvedValue(6);
    prismaMock.order.count.mockResolvedValue(3);
    prismaMock.deliveryOrder.count.mockResolvedValue(2);

    await expect(service.getDemoDatasetStatus()).resolves.toEqual({
      users: 7,
      products: 6,
      orders: 3,
      deliveries: 2,
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
          users: 7,
          products: 6,
          orders: 3,
          deliveries: 2,
        },
        DEMO_USERS,
      ),
    ).toBe(true);
  });
});
