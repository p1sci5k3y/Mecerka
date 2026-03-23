import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductClientDiscountService } from './product-client-discount.service';

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
        ProductClientDiscountService,
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

    // create() - lines 201-224
    it('create() throws NotFoundException when provider user does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.create(
          {
            name: 'Chair',
            price: 20,
            stock: 10,
            cityId: 'c-1',
            categoryId: 'cat-1',
          } as any,
          'unknown-provider',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('create() throws ForbiddenException when provider has no stripeAccountId', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ stripeAccountId: null });
      prismaMock.product.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          {
            name: 'Chair',
            price: 20,
            stock: 10,
            cityId: 'c-1',
            categoryId: 'cat-1',
          } as any,
          'provider-no-stripe',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('create() creates a product when provider has stripeAccountId', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeAccountId: 'acct_test',
      });
      prismaMock.product.findFirst.mockResolvedValue(null);
      prismaMock.product.create = jest
        .fn()
        .mockResolvedValue({ id: 'new-prod', name: 'Chair' });

      const result = await service.create(
        {
          name: 'Chair',
          price: 20,
          stock: 10,
          cityId: 'c-1',
          categoryId: 'cat-1',
        } as any,
        'provider-1',
      );

      expect(result).toEqual(expect.objectContaining({ id: 'new-prod' }));
    });

    it('create() uses explicit reference when provided', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeAccountId: 'acct_test',
      });
      prismaMock.product.findFirst.mockResolvedValue(null);
      prismaMock.product.create = jest
        .fn()
        .mockResolvedValue({ id: 'prod-ref', reference: 'my-ref' });

      await service.create(
        {
          name: 'Chair',
          price: 20,
          stock: 10,
          cityId: 'c-1',
          categoryId: 'cat-1',
          reference: 'my-ref',
        } as any,
        'provider-1',
      );

      expect(prismaMock.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reference: 'my-ref' }),
        }),
      );
    });

    it('create() generates suffix when reference already exists', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeAccountId: 'acct_test',
      });
      prismaMock.product.findFirst
        .mockResolvedValueOnce({ id: 'existing-1' })
        .mockResolvedValueOnce(null);
      prismaMock.product.create = jest
        .fn()
        .mockResolvedValue({ id: 'new-with-suffix' });

      await service.create(
        {
          name: 'Chair',
          price: 20,
          stock: 10,
          cityId: 'c-1',
          categoryId: 'cat-1',
        } as any,
        'provider-1',
      );

      expect(prismaMock.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reference: 'Chair-1' }),
        }),
      );
    });

    it('ensureUniqueReference throws BadRequestException for empty reference', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeAccountId: 'acct_test',
      });

      await expect(
        service.create(
          {
            name: '',
            price: 20,
            stock: 10,
            cityId: 'c-1',
            categoryId: 'cat-1',
            reference: '   ',
          } as any,
          'provider-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    // findMyProducts() - lines 252-263
    it('findMyProducts() returns products with availableStock for a provider', async () => {
      prismaMock.product.findMany.mockResolvedValue([
        {
          id: 'my-prod',
          name: 'My Product',
          stock: 5,
          price: 10,
          provider: { id: 'provider-1', name: 'P', email: 'p@test.com' },
          city: { id: 'c-1', name: 'Madrid' },
          category: { id: 'cat-1', name: 'X' },
        },
      ]);
      prismaMock.stockReservation.groupBy.mockResolvedValue([]);

      const result = await service.findMyProducts('provider-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({ id: 'my-prod', availableStock: 5 }),
      );
    });

    // update() - lines 298-346
    it('update() throws NotFoundException when provider user does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.update('prod-1', { price: 25 } as any, 'unknown-provider'),
      ).rejects.toThrow(NotFoundException);
    });

    it('update() throws ForbiddenException when provider has no stripeAccountId', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ stripeAccountId: null });

      await expect(
        service.update('prod-1', { price: 25 } as any, 'provider-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('update() throws NotFoundException when product does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeAccountId: 'acct_test',
      });
      prismaMock.product.findUnique.mockResolvedValue(null);

      await expect(
        service.update('missing-prod', { price: 25 } as any, 'provider-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('update() throws ForbiddenException when product belongs to another provider', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeAccountId: 'acct_test',
      });
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        providerId: 'provider-2',
        price: 20,
        discountPrice: null,
      });

      await expect(
        service.update('prod-1', { price: 25 } as any, 'provider-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('update() succeeds with valid data', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeAccountId: 'acct_test',
      });
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        providerId: 'provider-1',
        price: 20,
        discountPrice: null,
      });
      prismaMock.product.findFirst.mockResolvedValue(null);
      prismaMock.product.update = jest
        .fn()
        .mockResolvedValue({ id: 'prod-1', price: 25 });

      const result = await service.update(
        'prod-1',
        { price: 25 } as any,
        'provider-1',
      );

      expect(result).toEqual(expect.objectContaining({ id: 'prod-1' }));
    });

    it('update() handles non-null discountPrice from DB', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        stripeAccountId: 'acct_test',
      });
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        providerId: 'provider-1',
        price: 20,
        discountPrice: 15,
      });
      prismaMock.product.findFirst.mockResolvedValue(null);
      prismaMock.product.update = jest
        .fn()
        .mockResolvedValue({ id: 'prod-1', price: 20 });

      await service.update('prod-1', {} as any, 'provider-1');

      expect(prismaMock.product.update).toHaveBeenCalled();
    });

    // remove() - lines 348-366
    it('remove() throws NotFoundException when product does not exist', async () => {
      prismaMock.product.findUnique.mockResolvedValue(null);

      await expect(
        service.remove('missing-prod', 'provider-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('remove() throws ForbiddenException when product belongs to another provider', async () => {
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        providerId: 'other-provider',
      });

      await expect(service.remove('prod-1', 'provider-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('remove() deletes the product successfully', async () => {
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        providerId: 'provider-1',
      });
      prismaMock.product.delete = jest.fn().mockResolvedValue({ id: 'prod-1' });

      const result = await service.remove('prod-1', 'provider-1');

      expect(result).toEqual(expect.objectContaining({ id: 'prod-1' }));
    });

    // listClientDiscounts() - lines 368-389
    it('listClientDiscounts() returns mapped discounts for owned product', async () => {
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
          client: { id: 'client-1', name: 'Buyer', email: 'buyer@test.com' },
        },
      ]);

      const result = await service.listClientDiscounts('prod-1', 'provider-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({ id: 'disc-1', discountPrice: 15 }),
      );
    });

    it('listClientDiscounts() maps null client to undefined', async () => {
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        providerId: 'provider-1',
        price: 20,
        discountPrice: null,
      });
      prismaMock.providerClientProductDiscount.findMany.mockResolvedValue([
        {
          id: 'disc-2',
          providerId: 'provider-1',
          clientId: 'client-2',
          productId: 'prod-1',
          discountPrice: 10,
          active: false,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
          client: null,
        },
      ]);

      const result = await service.listClientDiscounts('prod-1', 'provider-1');

      expect(result[0].client).toBeUndefined();
    });

    // updateClientDiscount() - lines 444-497
    it('updateClientDiscount() throws NotFoundException when discount not found', async () => {
      prismaMock.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        providerId: 'provider-1',
        price: 20,
        discountPrice: null,
      });
      prismaMock.providerClientProductDiscount.findFirst.mockResolvedValue(
        null,
      );

      await expect(
        service.updateClientDiscount(
          'prod-1',
          'disc-missing',
          'provider-1',
          {},
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('updateClientDiscount() updates discountPrice when provided', async () => {
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
        client: { id: 'client-1', name: 'Buyer', email: 'buyer@test.com' },
      });
      prismaMock.providerClientProductDiscount.update.mockResolvedValue({
        id: 'disc-1',
        providerId: 'provider-1',
        clientId: 'client-1',
        productId: 'prod-1',
        discountPrice: 12,
        active: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        client: { id: 'client-1', name: 'Buyer', email: 'buyer@test.com' },
      });

      const result = await service.updateClientDiscount(
        'prod-1',
        'disc-1',
        'provider-1',
        { discountPrice: 12 },
      );

      expect(result).toEqual(
        expect.objectContaining({ id: 'disc-1', discountPrice: 12 }),
      );
      expect(
        prismaMock.providerClientProductDiscount.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ discountPrice: 12 }),
        }),
      );
    });

    it('updateClientDiscount() keeps existing discountPrice when dto.discountPrice is null', async () => {
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
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        client: null,
      });

      const result = await service.updateClientDiscount(
        'prod-1',
        'disc-1',
        'provider-1',
        { active: false },
      );

      expect(result).toEqual(expect.objectContaining({ active: false }));
      expect(
        prismaMock.providerClientProductDiscount.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ active: false }),
        }),
      );
    });

    it('updateClientDiscount() updates active flag when provided', async () => {
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
        active: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        client: null,
      });

      await service.updateClientDiscount('prod-1', 'disc-1', 'provider-1', {
        active: true,
      });

      expect(
        prismaMock.providerClientProductDiscount.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ active: true }),
        }),
      );
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
});
