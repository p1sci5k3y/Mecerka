import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { BaseSeedService } from '../seed/base-seed.service';
import { DemoCatalogService } from './demo-catalog.service';
import { DEMO_CATEGORIES, DEMO_CITIES, DEMO_PRODUCTS } from './demo.seed-data';

describe('DemoCatalogService', () => {
  let service: DemoCatalogService;
  let prismaMock: {
    city: { findMany: jest.Mock };
    category: { findMany: jest.Mock };
  };
  let productsService: { create: jest.Mock };
  let baseSeedService: { ensureBaseData: jest.Mock };

  beforeEach(async () => {
    prismaMock = {
      city: { findMany: jest.fn() },
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
    prismaMock.city.findMany.mockResolvedValue(
      DEMO_CITIES.map((city, index) => ({
        id: `city-${index + 1}`,
        name: city.name,
        slug: city.slug,
      })),
    );
    prismaMock.category.findMany.mockResolvedValue(
      DEMO_CATEGORIES.map((category, index) => ({
        id: `cat-${index + 1}`,
        slug: category.slug,
      })),
    );
    productsService.create.mockResolvedValue({ id: 'product-1' });

    const result = await service.createDemoCatalog(async (email) => ({
      id: `provider-${email}`,
    }));

    expect(baseSeedService.ensureBaseData).toHaveBeenCalled();
    expect(productsService.create).toHaveBeenCalledTimes(DEMO_PRODUCTS.length);
    expect(result.cities).toHaveLength(DEMO_CITIES.length);
    expect(result.products).toHaveLength(DEMO_PRODUCTS.length);
    expect(result.products[0]).toHaveProperty('citySlug');
  });

  it('fails when one of the base cities is missing', async () => {
    prismaMock.city.findMany.mockResolvedValue([
      { id: 'city-1', name: 'Toledo', slug: 'toledo' },
    ]);

    await expect(
      service.createDemoCatalog(async () => ({ id: 'provider-1' })),
    ).rejects.toThrow(ConflictException);
  });
});
