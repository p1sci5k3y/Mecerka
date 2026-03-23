import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { BaseSeedService } from '../seed/base-seed.service';
import { DemoCatalogService } from './demo-catalog.service';

describe('DemoCatalogService', () => {
  let service: DemoCatalogService;
  let prismaMock: {
    city: { findUnique: jest.Mock };
    category: { findMany: jest.Mock };
  };
  let productsService: { create: jest.Mock };
  let baseSeedService: { ensureBaseData: jest.Mock };

  beforeEach(async () => {
    prismaMock = {
      city: { findUnique: jest.fn() },
      category: { findMany: jest.fn() },
    };
    productsService = {
      create: jest.fn(),
    };
    baseSeedService = {
      ensureBaseData: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemoCatalogService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ProductsService, useValue: productsService },
        { provide: BaseSeedService, useValue: baseSeedService },
      ],
    }).compile();

    service = module.get(DemoCatalogService);
  });

  it('creates the demo catalog with resolved providers and categories', async () => {
    prismaMock.city.findUnique.mockResolvedValue({
      id: 'city-1',
      name: 'Toledo',
      slug: 'toledo',
    });
    prismaMock.category.findMany.mockResolvedValue([
      { id: 'cat-pan', slug: 'panaderia' },
      { id: 'cat-ver', slug: 'verduras' },
      { id: 'cat-des', slug: 'despensa' },
    ]);
    productsService.create.mockResolvedValue({ id: 'product-1' });

    const result = await service.createDemoCatalog(async (email) => ({
      id: email.includes('provider2') ? 'provider-2' : 'provider-1',
    }));

    expect(baseSeedService.ensureBaseData).toHaveBeenCalled();
    expect(productsService.create).toHaveBeenCalledTimes(6);
    expect(result.city.slug).toBe('toledo');
    expect(result.products).toHaveLength(6);
  });

  it('fails when the base city is missing', async () => {
    prismaMock.city.findUnique.mockResolvedValue(null);

    await expect(
      service.createDemoCatalog(async () => ({ id: 'provider-1' })),
    ).rejects.toThrow(ConflictException);
  });
});
