import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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

  describe('additional branch coverage - ProductsService', () => {
    it('returns empty array from attachAvailableStock when products list is empty', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.stockReservation.groupBy.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
      expect(prismaMock.stockReservation.groupBy).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when product does not exist in assertProviderOwnedProduct', async () => {
      prismaMock.product.findUnique.mockResolvedValue(null);

      await expect(
        service.upsertClientDiscount('missing-prod', 'provider-1', {
          clientId: 'client-1',
          discountPrice: 10,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when client is not found in assertClientUser', async () => {
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        providerId: 'provider-1',
        price: 20,
        discountPrice: null,
      });
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.upsertClientDiscount('prod-1', 'provider-1', {
          clientId: 'inactive-client',
          discountPrice: 10,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when target user does not have CLIENT role', async () => {
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

    it('sets availableStock to 0 when reserved stock exceeds physical stock', async () => {
      prismaMock.product.findMany.mockResolvedValue([
        {
          id: 'prod-over',
          name: 'Overbooked',
          stock: 2,
          price: 10,
          provider: { id: 'p-1', name: 'P' },
          city: { id: 'c-1', name: 'Madrid' },
          category: { id: 'cat-1', name: 'X' },
        },
      ]);
      prismaMock.stockReservation.groupBy.mockResolvedValue([
        { productId: 'prod-over', _sum: { quantity: 100 } },
      ]);

      const result = await service.findAll();

      expect(result[0]).toEqual(expect.objectContaining({ availableStock: 0 }));
    });

    it('uses 0 when reservation _sum.quantity is null', async () => {
      prismaMock.product.findMany.mockResolvedValue([
        {
          id: 'prod-no-res',
          name: 'NoRes',
          stock: 5,
          price: 10,
          provider: { id: 'p-1', name: 'P' },
          city: { id: 'c-1', name: 'Madrid' },
          category: { id: 'cat-1', name: 'X' },
        },
      ]);
      prismaMock.stockReservation.groupBy.mockResolvedValue([
        { productId: 'prod-no-res', _sum: { quantity: null } },
      ]);

      const result = await service.findAll();

      expect(result[0]).toEqual(expect.objectContaining({ availableStock: 5 }));
    });
  });

  describe('create', () => {
    it('throws NotFoundException when user is not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.create(
          {
            name: 'Prod',
            price: 10,
            stock: 5,
            cityId: 'c1',
            categoryId: 'cat1',
          } as any,
          'missing-provider',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user has no stripeAccountId', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ stripeAccountId: null });

      await expect(
        service.create(
          {
            name: 'Prod',
            price: 10,
            stock: 5,
            cityId: 'c1',
            categoryId: 'cat1',
          } as any,
          'provider-1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('creates product when reference is explicitly provided', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeAccountId: 'acct_1',
      });
      prismaMock.product.findFirst.mockResolvedValue(null); // no collision
      prismaMock.product.create.mockResolvedValue({
        id: 'new-prod',
        name: 'Prod',
      });

      const result = await service.create(
        {
          name: 'Prod',
          price: 10,
          stock: 5,
          cityId: 'c1',
          categoryId: 'cat1',
          reference: 'my-ref',
        } as any,
        'provider-1',
      );

      expect(prismaMock.product.create).toHaveBeenCalled();
      expect(result).toEqual({ id: 'new-prod', name: 'Prod' });
    });

    it('derives reference from name when no reference is provided', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeAccountId: 'acct_1',
      });
      prismaMock.product.findFirst.mockResolvedValue(null);
      prismaMock.product.create.mockResolvedValue({
        id: 'new-prod',
        name: 'Prod',
      });

      await service.create(
        {
          name: 'My Product',
          price: 10,
          stock: 5,
          cityId: 'c1',
          categoryId: 'cat1',
        } as any,
        'provider-1',
      );

      expect(prismaMock.product.create).toHaveBeenCalled();
    });

    it('retries reference with suffix when there is a collision', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeAccountId: 'acct_1',
      });
      // First call finds existing (collision), second call finds null (available)
      prismaMock.product.findFirst
        .mockResolvedValueOnce({ id: 'existing' })
        .mockResolvedValueOnce(null);
      prismaMock.product.create.mockResolvedValue({ id: 'new-prod' });

      await service.create(
        {
          name: 'Prod',
          price: 10,
          stock: 5,
          cityId: 'c1',
          categoryId: 'cat1',
          reference: 'prod',
        } as any,
        'provider-1',
      );

      expect(prismaMock.product.findFirst).toHaveBeenCalledTimes(2);
      expect(prismaMock.product.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('throws NotFoundException when user is not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.update('prod-1', {} as any, 'missing-provider'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user has no stripeAccountId', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ stripeAccountId: null });

      await expect(
        service.update('prod-1', {} as any, 'provider-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when product is not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeAccountId: 'acct_1',
      });
      prismaMock.product.findUnique.mockResolvedValue(null);

      await expect(
        service.update('missing', {} as any, 'provider-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when product belongs to another provider', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeAccountId: 'acct_1',
      });
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        providerId: 'provider-2',
        price: 20,
        discountPrice: null,
      });

      await expect(
        service.update('prod-1', {} as any, 'provider-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('updates product successfully when no reference in dto', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeAccountId: 'acct_1',
      });
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        providerId: 'provider-1',
        price: 20,
        discountPrice: 15,
      });
      prismaMock.product.update.mockResolvedValue({
        id: 'prod-1',
        name: 'Updated',
      });

      const result = await service.update(
        'prod-1',
        { stock: 10 } as any,
        'provider-1',
      );

      expect(prismaMock.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ reference: expect.anything() }),
        }),
      );
      expect(result).toEqual({ id: 'prod-1', name: 'Updated' });
    });

    it('uses null for currentDiscountPrice when product has no discountPrice', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeAccountId: 'acct_1',
      });
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        providerId: 'provider-1',
        price: 20,
        discountPrice: null,
      });
      prismaMock.product.update.mockResolvedValue({ id: 'prod-1' });

      await service.update('prod-1', { stock: 5 } as any, 'provider-1');

      expect(prismaMock.product.update).toHaveBeenCalled();
    });

    it('includes reference in update data when dto has a reference', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeAccountId: 'acct_1',
      });
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        providerId: 'provider-1',
        price: 20,
        discountPrice: null,
      });
      prismaMock.product.findFirst.mockResolvedValue(null); // no collision
      prismaMock.product.update.mockResolvedValue({ id: 'prod-1' });

      await service.update(
        'prod-1',
        { reference: 'new-ref' } as any,
        'provider-1',
      );

      expect(prismaMock.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reference: 'new-ref' }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when product is not found', async () => {
      prismaMock.product.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing', 'provider-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when product belongs to another provider', async () => {
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        providerId: 'provider-2',
      });

      await expect(service.remove('prod-1', 'provider-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deletes product when owner matches', async () => {
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        providerId: 'provider-1',
      });
      prismaMock.product.delete = jest.fn().mockResolvedValue({ id: 'prod-1' });

      const result = await service.remove('prod-1', 'provider-1');

      expect(prismaMock.product.delete).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
      });
      expect(result).toEqual({ id: 'prod-1' });
    });
  });

  describe('listClientDiscounts', () => {
    it('returns mapped discounts for a provider-owned product', async () => {
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
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
          client: { id: 'client-1', name: 'Buyer', email: 'b@example.com' },
        },
      ]);

      const result = await service.listClientDiscounts('prod-1', 'provider-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({ id: 'disc-1', discountPrice: 15 }),
      );
    });
  });

  describe('mapClientDiscount - client undefined', () => {
    it('returns undefined for client field when discount has no client', async () => {
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
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
          client: null,
        },
      ]);

      const result = await service.listClientDiscounts('prod-1', 'provider-1');

      expect(result[0].client).toBeUndefined();
    });
  });

  describe('updateClientDiscount', () => {
    const baseProduct = {
      id: 'prod-1',
      providerId: 'provider-1',
      price: 20,
      discountPrice: null,
    };
    const baseDiscount = {
      id: 'disc-1',
      productId: 'prod-1',
      providerId: 'provider-1',
      discountPrice: 15,
      active: true,
      client: { id: 'client-1', name: 'Buyer', email: 'b@example.com' },
    };

    it('throws NotFoundException when discount is not found', async () => {
      prismaMock.product.findUnique.mockResolvedValue(baseProduct);
      prismaMock.providerClientProductDiscount.findFirst.mockResolvedValue(
        null,
      );

      await expect(
        service.updateClientDiscount('prod-1', 'disc-99', 'provider-1', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates discountPrice and active when both are provided', async () => {
      prismaMock.product.findUnique.mockResolvedValue(baseProduct);
      prismaMock.providerClientProductDiscount.findFirst.mockResolvedValue(
        baseDiscount,
      );
      prismaMock.providerClientProductDiscount.update.mockResolvedValue({
        ...baseDiscount,
        discountPrice: 12,
        active: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.updateClientDiscount(
        'prod-1',
        'disc-1',
        'provider-1',
        {
          discountPrice: 12,
          active: false,
        },
      );

      expect(
        prismaMock.providerClientProductDiscount.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ discountPrice: 12, active: false }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('uses existing discountPrice when dto.discountPrice is null', async () => {
      prismaMock.product.findUnique.mockResolvedValue(baseProduct);
      prismaMock.providerClientProductDiscount.findFirst.mockResolvedValue(
        baseDiscount,
      );
      prismaMock.providerClientProductDiscount.update.mockResolvedValue({
        ...baseDiscount,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.updateClientDiscount('prod-1', 'disc-1', 'provider-1', {});

      expect(
        prismaMock.providerClientProductDiscount.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            discountPrice: expect.anything(),
          }),
        }),
      );
    });

    it('skips active in update data when dto.active is null/undefined', async () => {
      prismaMock.product.findUnique.mockResolvedValue(baseProduct);
      prismaMock.providerClientProductDiscount.findFirst.mockResolvedValue(
        baseDiscount,
      );
      prismaMock.providerClientProductDiscount.update.mockResolvedValue({
        ...baseDiscount,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.updateClientDiscount('prod-1', 'disc-1', 'provider-1', {
        discountPrice: 12,
      });

      expect(
        prismaMock.providerClientProductDiscount.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ active: expect.anything() }),
        }),
      );
    });
  });

  describe('findMyProducts', () => {
    it('returns provider products with available stock', async () => {
      prismaMock.product.findMany.mockResolvedValue([
        {
          id: 'prod-1',
          name: 'My Prod',
          stock: 10,
          price: 15,
          provider: { id: 'p-1', name: 'P', email: 'p@test.com' },
          city: { id: 'c-1', name: 'Madrid' },
          category: { id: 'cat-1', name: 'X' },
        },
      ]);
      prismaMock.stockReservation.groupBy.mockResolvedValue([]);

      const result = await service.findMyProducts('p-1');

      expect(result[0]).toEqual(
        expect.objectContaining({ availableStock: 10 }),
      );
    });
  });
});
