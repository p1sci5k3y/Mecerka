import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      product: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
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
      stockReservation: {
        groupBy: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('adds availableStock to product lists using active reservations only', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Chair',
        stock: 10,
        price: 50,
        provider: { id: 'provider-1', name: 'Provider 1' },
        city: { id: 'city-1', name: 'Madrid' },
        category: { id: 'cat-1', name: 'Furniture' },
      },
      {
        id: 'prod-2',
        name: 'Table',
        stock: 1,
        price: 100,
        provider: { id: 'provider-1', name: 'Provider 1' },
        city: { id: 'city-1', name: 'Madrid' },
        category: { id: 'cat-1', name: 'Furniture' },
      },
    ]);
    prismaMock.stockReservation.groupBy.mockResolvedValue([
      {
        productId: 'prod-1',
        _sum: { quantity: 3 },
      },
      {
        productId: 'prod-2',
        _sum: { quantity: 5 },
      },
    ]);

    const result = await service.findAll();

    expect(result).toEqual([
      expect.objectContaining({
        id: 'prod-1',
        availableStock: 7,
      }),
      expect.objectContaining({
        id: 'prod-2',
        availableStock: 0,
      }),
    ]);
    expect(prismaMock.stockReservation.groupBy).toHaveBeenCalledWith({
      by: ['productId'],
      where: {
        productId: { in: ['prod-1', 'prod-2'] },
        status: 'ACTIVE',
        expiresAt: { gt: expect.any(Date) },
      },
      _sum: {
        quantity: true,
      },
    });
  });

  it('adds availableStock to a single product view', async () => {
    prismaMock.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      name: 'Chair',
      stock: 8,
      price: 50,
      provider: { id: 'provider-1', name: 'Provider 1' },
      city: { id: 'city-1', name: 'Madrid' },
      category: { id: 'cat-1', name: 'Furniture' },
    });
    prismaMock.stockReservation.groupBy.mockResolvedValue([
      {
        productId: 'prod-1',
        _sum: { quantity: 2 },
      },
    ]);

    const result = await service.findOne('prod-1');

    expect(result).toEqual(
      expect.objectContaining({
        id: 'prod-1',
        availableStock: 6,
      }),
    );
  });

  it('throws not found when the product does not exist', async () => {
    prismaMock.product.findFirst.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('upserts a provider-owned client discount for a concrete client', async () => {
    prismaMock.product.findUnique.mockResolvedValue({
      id: 'prod-1',
      providerId: 'provider-1',
      price: 20,
      discountPrice: 18,
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'client-1',
      active: true,
      roles: ['CLIENT'],
      name: 'Buyer',
      email: 'buyer@example.com',
    });
    prismaMock.providerClientProductDiscount.upsert.mockResolvedValue({
      id: 'discount-1',
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

    expect(
      prismaMock.providerClientProductDiscount.upsert,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          providerId_clientId_productId: {
            providerId: 'provider-1',
            clientId: 'client-1',
            productId: 'prod-1',
          },
        },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'discount-1',
        providerId: 'provider-1',
        clientId: 'client-1',
        productId: 'prod-1',
        discountPrice: 15,
        active: true,
      }),
    );
  });

  it('rejects client discounts for products owned by another provider', async () => {
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
});
