import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DemoService } from './demo.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AdminService } from '../admin/admin.service';
import { ProductsService } from '../products/products.service';
import { OrdersService } from '../orders/orders.service';
import { DeliveryService } from '../delivery/delivery.service';
import { CartService } from '../cart/cart.service';
import { PaymentsService } from '../payments/payments.service';
import { BaseSeedService } from '../seed/base-seed.service';

describe('DemoService', () => {
  let service: DemoService;
  let configService: { get: jest.Mock };
  let prismaMock: {
    user: { count: jest.Mock; findUnique: jest.Mock };
    product: { count: jest.Mock };
    order: { count: jest.Mock };
    deliveryOrder: { count: jest.Mock };
  };

  beforeEach(async () => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'test';
        if (key === 'DEMO_MODE') return 'false';
        return undefined;
      }),
    };
    prismaMock = {
      user: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      product: {
        count: jest.fn().mockResolvedValue(0),
      },
      order: {
        count: jest.fn().mockResolvedValue(0),
      },
      deliveryOrder: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemoService,
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuthService, useValue: {} },
        { provide: AdminService, useValue: {} },
        { provide: ProductsService, useValue: {} },
        { provide: OrdersService, useValue: {} },
        { provide: DeliveryService, useValue: {} },
        { provide: CartService, useValue: {} },
        { provide: PaymentsService, useValue: {} },
        {
          provide: BaseSeedService,
          useValue: { ensureBaseData: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(DemoService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('runs reset idempotently on repeated calls', async () => {
    const cleanupSpy = jest
      .spyOn<any, any>(service as any, 'cleanupDemoData')
      .mockResolvedValue(undefined);
    const seedSpy = jest
      .spyOn<any, any>(service as any, 'seedDemoData')
      .mockResolvedValue({ status: 'ok' });

    await expect(service.reset('admin-1')).resolves.toEqual({
      status: 'reset_complete',
    });
    await expect(service.reset('admin-1')).resolves.toEqual({
      status: 'reset_complete',
    });

    expect(cleanupSpy).toHaveBeenCalledTimes(2);
    expect(seedSpy).toHaveBeenCalledTimes(2);
  });

  it('blocks demo endpoints in production unless DEMO_MODE=true', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'production';
      if (key === 'DEMO_MODE') return 'false';
      return undefined;
    });

    await expect(service.seed('admin-1')).rejects.toThrow(ForbiddenException);
    await expect(service.reset('admin-1')).rejects.toThrow(ForbiddenException);
  });

  it('repairs incomplete demo data on bootstrap instead of leaving a partial seed', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'development';
      if (key === 'DEMO_MODE') return 'true';
      if (key === 'DEMO_PASSWORD') return 'DemoPass123!';
      return undefined;
    });
    prismaMock.user.count.mockResolvedValue(7);
    prismaMock.product.count.mockResolvedValue(6);
    prismaMock.order.count.mockResolvedValue(0);
    prismaMock.deliveryOrder.count.mockResolvedValue(0);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'admin-1' });

    const cleanupSpy = jest
      .spyOn<any, any>(service as any, 'cleanupDemoData')
      .mockResolvedValue(undefined);
    const seedSpy = jest
      .spyOn<any, any>(service as any, 'seedDemoData')
      .mockResolvedValue({ status: 'ok' });

    await service.onApplicationBootstrap();

    expect(cleanupSpy).toHaveBeenCalledWith('admin-1');
    expect(seedSpy).toHaveBeenCalledWith('admin-1');
  });

  it('skips seeding on bootstrap when DEMO_MODE is false', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'DEMO_MODE') return 'false';
      return undefined;
    });

    const seedSpy = jest
      .spyOn<any, any>(service as any, 'seedDemoData')
      .mockResolvedValue(undefined);

    await service.onApplicationBootstrap();

    expect(seedSpy).not.toHaveBeenCalled();
  });

  it('skips cleanup and seed on bootstrap when demo dataset is already complete', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'DEMO_MODE') return 'true';
      return undefined;
    });
    prismaMock.user.count.mockResolvedValue(10);
    prismaMock.product.count.mockResolvedValue(10);
    prismaMock.order.count.mockResolvedValue(5);
    prismaMock.deliveryOrder.count.mockResolvedValue(3);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'admin-1' });

    const cleanupSpy = jest
      .spyOn<any, any>(service as any, 'cleanupDemoData')
      .mockResolvedValue(undefined);
    const seedSpy = jest
      .spyOn<any, any>(service as any, 'seedDemoData')
      .mockResolvedValue(undefined);

    await service.onApplicationBootstrap();

    expect(cleanupSpy).not.toHaveBeenCalled();
    expect(seedSpy).not.toHaveBeenCalled();
  });

  it('skips cleanup but runs seed when no existing demo data on bootstrap', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'DEMO_MODE') return 'true';
      return undefined;
    });
    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.product.count.mockResolvedValue(0);
    prismaMock.order.count.mockResolvedValue(0);
    prismaMock.deliveryOrder.count.mockResolvedValue(0);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'admin-1' });

    const cleanupSpy = jest
      .spyOn<any, any>(service as any, 'cleanupDemoData')
      .mockResolvedValue(undefined);
    const seedSpy = jest
      .spyOn<any, any>(service as any, 'seedDemoData')
      .mockResolvedValue({ status: 'ok' });

    await service.onApplicationBootstrap();

    expect(cleanupSpy).not.toHaveBeenCalled();
    expect(seedSpy).toHaveBeenCalled();
  });

  it('logs warning and does not throw when bootstrap seed fails', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'DEMO_MODE') return 'true';
      return undefined;
    });
    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.product.count.mockResolvedValue(0);
    prismaMock.order.count.mockResolvedValue(0);
    prismaMock.deliveryOrder.count.mockResolvedValue(0);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'admin-1' });

    jest
      .spyOn<any, any>(service as any, 'seedDemoData')
      .mockRejectedValue(new Error('DB failure'));

    await expect(service.onApplicationBootstrap()).resolves.not.toThrow();
  });

  it('logs warning with unknown error string when bootstrap error is not an Error instance', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'DEMO_MODE') return 'true';
      return undefined;
    });
    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.product.count.mockResolvedValue(0);
    prismaMock.order.count.mockResolvedValue(0);
    prismaMock.deliveryOrder.count.mockResolvedValue(0);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'admin-1' });

    jest
      .spyOn<any, any>(service as any, 'seedDemoData')
      .mockRejectedValue('string error');

    await expect(service.onApplicationBootstrap()).resolves.not.toThrow();
  });

  it('seed() skips cleanup when there is no existing demo data', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'development';
      if (key === 'DEMO_MODE') return 'true';
      return undefined;
    });
    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.product.count.mockResolvedValue(0);
    prismaMock.order.count.mockResolvedValue(0);
    prismaMock.deliveryOrder.count.mockResolvedValue(0);

    const cleanupSpy = jest
      .spyOn<any, any>(service as any, 'cleanupDemoData')
      .mockResolvedValue(undefined);
    const seedSpy = jest
      .spyOn<any, any>(service as any, 'seedDemoData')
      .mockResolvedValue({ status: 'ok' });

    await service.seed('admin-1');

    expect(cleanupSpy).not.toHaveBeenCalled();
    expect(seedSpy).toHaveBeenCalledWith('admin-1');
  });

  it('seed() runs cleanup when existing demo data is present', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'development';
      if (key === 'DEMO_MODE') return 'true';
      return undefined;
    });
    prismaMock.user.count.mockResolvedValue(3);
    prismaMock.product.count.mockResolvedValue(0);
    prismaMock.order.count.mockResolvedValue(0);
    prismaMock.deliveryOrder.count.mockResolvedValue(0);

    const cleanupSpy = jest
      .spyOn<any, any>(service as any, 'cleanupDemoData')
      .mockResolvedValue(undefined);
    jest
      .spyOn<any, any>(service as any, 'seedDemoData')
      .mockResolvedValue({ status: 'ok' });

    await service.seed('admin-1');

    expect(cleanupSpy).toHaveBeenCalledWith('admin-1');
  });

  it('allows demo endpoints when production with DEMO_MODE=true', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'production';
      if (key === 'DEMO_MODE') return 'true';
      return undefined;
    });
    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.product.count.mockResolvedValue(0);
    prismaMock.order.count.mockResolvedValue(0);
    prismaMock.deliveryOrder.count.mockResolvedValue(0);

    jest
      .spyOn<any, any>(service as any, 'cleanupDemoData')
      .mockResolvedValue(undefined);
    jest
      .spyOn<any, any>(service as any, 'seedDemoData')
      .mockResolvedValue({ status: 'ok' });

    await expect(service.seed('admin-1')).resolves.toBeDefined();
  });
});
