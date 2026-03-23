import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductClientDiscountService } from './product-client-discount.service';

describe('ProductClientDiscountService', () => {
  let service: ProductClientDiscountService;
  let prismaMock: {
    product: {
      findUnique: jest.Mock;
    };
    providerClientProductDiscount: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      product: {
        findUnique: jest.fn(),
      },
      providerClientProductDiscount: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductClientDiscountService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ProductClientDiscountService>(
      ProductClientDiscountService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('lists mapped discounts for an owned product', async () => {
    prismaMock.product.findUnique.mockResolvedValue({
      id: 'prod-1',
      providerId: 'provider-1',
      price: 20,
      discountPrice: null,
    });
    prismaMock.providerClientProductDiscount.findMany.mockResolvedValue([
      {
        id: 'disc-1',
        providerId: 'provider-1',
        clientId: 'client-1',
        productId: 'prod-1',
        discountPrice: 15,
        active: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        client: {
          id: 'client-1',
          name: 'Buyer',
          email: 'buyer@example.com',
        },
      },
    ]);

    const result = await service.listClientDiscounts('prod-1', 'provider-1');

    expect(result).toEqual([
      expect.objectContaining({
        id: 'disc-1',
        discountPrice: 15,
        client: expect.objectContaining({
          id: 'client-1',
          email: 'buyer@example.com',
        }),
      }),
    ]);
  });

  it('rejects discounts for a product owned by another provider', async () => {
    prismaMock.product.findUnique.mockResolvedValue({
      id: 'prod-1',
      providerId: 'provider-2',
      price: 20,
      discountPrice: null,
    });

    await expect(
      service.upsertClientDiscount('prod-1', 'provider-1', {
        clientId: 'client-1',
        discountPrice: 15,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('upserts a discount for an active client user', async () => {
    prismaMock.product.findUnique.mockResolvedValue({
      id: 'prod-1',
      providerId: 'provider-1',
      price: 20,
      discountPrice: null,
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'client-1',
      active: true,
      roles: ['CLIENT'],
      name: 'Buyer',
      email: 'buyer@example.com',
    });
    prismaMock.providerClientProductDiscount.upsert.mockResolvedValue({
      id: 'disc-1',
      providerId: 'provider-1',
      clientId: 'client-1',
      productId: 'prod-1',
      discountPrice: 15,
      active: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      client: {
        id: 'client-1',
        name: 'Buyer',
        email: 'buyer@example.com',
      },
    });

    const result = await service.upsertClientDiscount('prod-1', 'provider-1', {
      clientId: 'client-1',
      discountPrice: 15,
    });

    expect(prismaMock.providerClientProductDiscount.upsert).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        id: 'disc-1',
        clientId: 'client-1',
        discountPrice: 15,
      }),
    );
  });

  it('rejects users without the CLIENT role', async () => {
    prismaMock.product.findUnique.mockResolvedValue({
      id: 'prod-1',
      providerId: 'provider-1',
      price: 20,
      discountPrice: null,
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      active: true,
      roles: ['RUNNER'],
      name: 'Runner',
      email: 'runner@example.com',
    });

    await expect(
      service.upsertClientDiscount('prod-1', 'provider-1', {
        clientId: 'user-1',
        discountPrice: 10,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('updates an existing discount and keeps the stored price when omitted', async () => {
    prismaMock.product.findUnique.mockResolvedValue({
      id: 'prod-1',
      providerId: 'provider-1',
      price: 20,
      discountPrice: null,
    });
    prismaMock.providerClientProductDiscount.findFirst.mockResolvedValue({
      id: 'disc-1',
      productId: 'prod-1',
      providerId: 'provider-1',
      discountPrice: 15,
      active: true,
      client: null,
    });
    prismaMock.providerClientProductDiscount.update.mockResolvedValue({
      id: 'disc-1',
      providerId: 'provider-1',
      clientId: 'client-1',
      productId: 'prod-1',
      discountPrice: 15,
      active: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      client: null,
    });

    const result = await service.updateClientDiscount(
      'prod-1',
      'disc-1',
      'provider-1',
      { active: false },
    );

    expect(
      prismaMock.providerClientProductDiscount.update,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ active: false }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ active: false }));
  });

  it('throws when the existing discount cannot be found', async () => {
    prismaMock.product.findUnique.mockResolvedValue({
      id: 'prod-1',
      providerId: 'provider-1',
      price: 20,
      discountPrice: null,
    });
    prismaMock.providerClientProductDiscount.findFirst.mockResolvedValue(null);

    await expect(
      service.updateClientDiscount('prod-1', 'missing', 'provider-1', {}),
    ).rejects.toThrow(NotFoundException);
  });
});
