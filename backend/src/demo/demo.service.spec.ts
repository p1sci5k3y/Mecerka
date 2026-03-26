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
    user: { count: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock };
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
        findMany: jest.fn().mockResolvedValue([]),
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
    jest
      .spyOn<any, any>(service as any, 'areDemoCredentialsCurrent')
      .mockResolvedValue(true);

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

  it('reseeds on bootstrap when dataset is complete but demo credentials are stale', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'DEMO_MODE') return 'true';
      return undefined;
    });
    prismaMock.user.count.mockResolvedValue(10);
    prismaMock.product.count.mockResolvedValue(10);
    prismaMock.order.count.mockResolvedValue(5);
    prismaMock.deliveryOrder.count.mockResolvedValue(3);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'admin-1' });
    jest
      .spyOn<any, any>(service as any, 'areDemoCredentialsCurrent')
      .mockResolvedValue(false);

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

  describe('getDemoDatasetStatus branch coverage', () => {
    it('isDemoDatasetComplete returns true when all counts meet thresholds', () => {
      const status = { users: 7, products: 6, orders: 3, deliveries: 2 };
      const result = (service as any).isDemoDatasetComplete(status);
      expect(result).toBe(true);
    });

    it('isDemoDatasetComplete returns false when orders < 3', () => {
      const status = { users: 7, products: 6, orders: 2, deliveries: 2 };
      const result = (service as any).isDemoDatasetComplete(status);
      expect(result).toBe(false);
    });

    it('isDemoDatasetComplete returns false when deliveries < 2', () => {
      const status = { users: 7, products: 6, orders: 3, deliveries: 1 };
      const result = (service as any).isDemoDatasetComplete(status);
      expect(result).toBe(false);
    });

    it('isDemoDatasetComplete returns false when users < DEMO_USERS.length', () => {
      const status = { users: 3, products: 6, orders: 3, deliveries: 2 };
      const result = (service as any).isDemoDatasetComplete(status);
      expect(result).toBe(false);
    });

    it('isDemoDatasetComplete returns false when products < DEMO_PRODUCTS.length', () => {
      const status = { users: 7, products: 3, orders: 3, deliveries: 2 };
      const result = (service as any).isDemoDatasetComplete(status);
      expect(result).toBe(false);
    });

    it('hasAnyDemoData returns false when all counts are 0', () => {
      const status = { users: 0, products: 0, orders: 0, deliveries: 0 };
      const result = (service as any).hasAnyDemoData(status);
      expect(result).toBe(false);
    });

    it('hasAnyDemoData returns true when only products > 0', () => {
      const status = { users: 0, products: 1, orders: 0, deliveries: 0 };
      const result = (service as any).hasAnyDemoData(status);
      expect(result).toBe(true);
    });

    it('hasAnyDemoData returns true when only orders > 0', () => {
      const status = { users: 0, products: 0, orders: 1, deliveries: 0 };
      const result = (service as any).hasAnyDemoData(status);
      expect(result).toBe(true);
    });

    it('hasAnyDemoData returns true when only deliveries > 0', () => {
      const status = { users: 0, products: 0, orders: 0, deliveries: 1 };
      const result = (service as any).hasAnyDemoData(status);
      expect(result).toBe(true);
    });
  });

  describe('ensureDemoAdmin', () => {
    it('returns existing admin without registering when already in DB', async () => {
      const existingAdmin = { id: 'existing-admin-id' };
      prismaMock.user.findUnique.mockResolvedValue(existingAdmin);

      const result = await (service as any).ensureDemoAdmin();

      expect(result).toEqual(existingAdmin);
    });

    it('registers a new admin when not found in DB', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const registerAndVerifySpy = jest
        .spyOn<any, any>(service as any, 'registerAndVerifyUser')
        .mockResolvedValue({ id: 'new-admin-id' });

      const result = await (service as any).ensureDemoAdmin();

      expect(registerAndVerifySpy).toHaveBeenCalled();
      expect(result).toEqual({ id: 'new-admin-id' });
    });
  });

  describe('getDemoPassword', () => {
    it('returns the fixed shared demo password', () => {
      const result = (service as any).getDemoPassword();
      expect(result).toBe('DemoPass123!');
    });
  });

  describe('assertDemoEnabled', () => {
    it('does not throw when not in production', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'DEMO_MODE') return 'false';
        return undefined;
      });

      expect(() => (service as any).assertDemoEnabled()).not.toThrow();
    });

    it('does not throw in production when DEMO_MODE=true', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'DEMO_MODE') return 'true';
        return undefined;
      });

      expect(() => (service as any).assertDemoEnabled()).not.toThrow();
    });

    it('throws ForbiddenException in production when DEMO_MODE=false', () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'DEMO_MODE') return 'false';
        return undefined;
      });

      expect(() => (service as any).assertDemoEnabled()).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('onApplicationBootstrap additional coverage', () => {
    it('repairs demo data when there is partial data but no admin in DB', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'DEMO_MODE') return 'true';
        return undefined;
      });
      prismaMock.user.count.mockResolvedValue(3);
      prismaMock.product.count.mockResolvedValue(2);
      prismaMock.order.count.mockResolvedValue(0);
      prismaMock.deliveryOrder.count.mockResolvedValue(0);
      prismaMock.user.findUnique.mockResolvedValue(null);

      const registerSpy = jest
        .spyOn<any, any>(service as any, 'registerAndVerifyUser')
        .mockResolvedValue({ id: 'new-admin' });
      const cleanupSpy = jest
        .spyOn<any, any>(service as any, 'cleanupDemoData')
        .mockResolvedValue(undefined);
      const seedSpy = jest
        .spyOn<any, any>(service as any, 'seedDemoData')
        .mockResolvedValue({ status: 'ok' });

      await service.onApplicationBootstrap();

      expect(registerSpy).toHaveBeenCalled();
      expect(cleanupSpy).toHaveBeenCalled();
      expect(seedSpy).toHaveBeenCalled();
    });
  });
});
