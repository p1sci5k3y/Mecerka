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

  beforeEach(async () => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'test';
        if (key === 'DEMO_MODE') return 'false';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemoService,
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: {} },
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
});
