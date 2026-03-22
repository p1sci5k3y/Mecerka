import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { OrderItemsService } from './order-items.service';

describe('OrderItemsService', () => {
  let service: OrderItemsService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      providerOrder: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderItemsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<OrderItemsService>(OrderItemsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('additional branch coverage - getProviderStats', () => {
    it('returns zeros when there are no provider orders', async () => {
      prismaMock.providerOrder.findMany.mockResolvedValue([]);

      const result = await service.getProviderStats('provider-1');

      expect(result).toEqual({
        totalRevenue: 0,
        totalOrders: 0,
        itemsSold: 0,
        averageTicket: 0,
      });
    });

    it('calculates revenue, order count, items sold and average ticket', async () => {
      prismaMock.providerOrder.findMany.mockResolvedValue([
        {
          items: [
            { priceAtPurchase: '10.00', quantity: 2 },
            { priceAtPurchase: '5.00', quantity: 1 },
          ],
        },
        {
          items: [{ priceAtPurchase: '20.00', quantity: 3 }],
        },
      ]);

      const result = await service.getProviderStats('provider-1');

      expect(result.totalOrders).toBe(2);
      expect(result.totalRevenue).toBe(85); // 20+5+60
      expect(result.itemsSold).toBe(6);
      expect(result.averageTicket).toBe(42.5);
    });
  });

  describe('additional branch coverage - getProviderSalesChart', () => {
    it('returns empty array when there are no orders in last 30 days', async () => {
      prismaMock.providerOrder.findMany.mockResolvedValue([]);

      const result = await service.getProviderSalesChart('provider-1');

      expect(result).toEqual([]);
    });

    it('groups sales by date', async () => {
      const date1 = new Date('2026-03-10T10:00:00.000Z');
      const date2 = new Date('2026-03-11T12:00:00.000Z');

      prismaMock.providerOrder.findMany.mockResolvedValue([
        {
          createdAt: date1,
          items: [{ priceAtPurchase: '15.00', quantity: 2 }],
        },
        {
          createdAt: date1,
          items: [{ priceAtPurchase: '10.00', quantity: 1 }],
        },
        {
          createdAt: date2,
          items: [{ priceAtPurchase: '20.00', quantity: 1 }],
        },
      ]);

      const result = await service.getProviderSalesChart('provider-1');

      expect(result).toEqual([
        { date: '2026-03-10', amount: 40 }, // 30 + 10
        { date: '2026-03-11', amount: 20 },
      ]);
    });
  });

  describe('additional branch coverage - getProviderTopProducts', () => {
    it('returns empty array when there are no orders', async () => {
      prismaMock.providerOrder.findMany.mockResolvedValue([]);

      const result = await service.getProviderTopProducts('provider-1');

      expect(result).toEqual([]);
    });

    it('aggregates product stats across multiple orders', async () => {
      prismaMock.providerOrder.findMany.mockResolvedValue([
        {
          items: [
            {
              productId: 'prod-1',
              priceAtPurchase: '10.00',
              quantity: 2,
              product: { name: 'Chair' },
            },
            {
              productId: 'prod-2',
              priceAtPurchase: '50.00',
              quantity: 1,
              product: { name: 'Table' },
            },
          ],
        },
        {
          items: [
            {
              productId: 'prod-1',
              priceAtPurchase: '10.00',
              quantity: 3,
              product: { name: 'Chair' },
            },
          ],
        },
      ]);

      const result = await service.getProviderTopProducts('provider-1');

      // prod-1: revenue=50, prod-2: revenue=50 (sorted desc, prod-2 comes first by insert order at same revenue)
      expect(result).toHaveLength(2);
      const prod1 = result.find((p: any) => p.name === 'Chair');
      expect(prod1).toEqual({ name: 'Chair', revenue: 50, quantity: 5 });
      const prod2 = result.find((p: any) => p.name === 'Table');
      expect(prod2).toEqual({ name: 'Table', revenue: 50, quantity: 1 });
    });

    it('returns at most 5 products sorted by revenue descending', async () => {
      const items = Array.from({ length: 7 }, (_, i) => ({
        productId: `prod-${i}`,
        priceAtPurchase: `${(i + 1) * 10}.00`,
        quantity: 1,
        product: { name: `Product ${i}` },
      }));

      prismaMock.providerOrder.findMany.mockResolvedValue([{ items }]);

      const result = await service.getProviderTopProducts('provider-1');

      expect(result).toHaveLength(5);
      // First should be highest revenue (prod-6: 70)
      expect(result[0].name).toBe('Product 6');
    });
  });
});
