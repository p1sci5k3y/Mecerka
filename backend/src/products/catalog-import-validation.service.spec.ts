import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogImportValidationService } from './catalog-import-validation.service';

describe('CatalogImportValidationService', () => {
  let service: CatalogImportValidationService;
  let prismaMock: {
    category: {
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prismaMock = {
      category: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogImportValidationService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<CatalogImportValidationService>(
      CatalogImportValidationService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes valid rows against known categories', async () => {
    prismaMock.category.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'Furniture', slug: 'furniture' },
    ]);

    const result = await service.normalizeRows([
      {
        reference: 'CHAIR-001',
        name: 'Oak Chair',
        description: 'Handmade chair',
        category: 'furniture',
        price: '149.00',
        discount_price: '129.00',
        stock: '12',
        image_url: 'https://cdn.example.com/chair.jpg',
      },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.normalizedRows).toEqual([
      expect.objectContaining({
        reference: 'CHAIR-001',
        categoryId: 'cat-1',
        discountPrice: 129,
      }),
    ]);
  });

  it('rejects duplicate references inside the uploaded file', async () => {
    prismaMock.category.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'Furniture', slug: 'furniture' },
    ]);

    const result = await service.normalizeRows([
      {
        reference: 'REF-001',
        name: 'Chair A',
        description: 'A',
        category: 'furniture',
        price: '10.00',
        discount_price: '',
        stock: '1',
        image_url: '',
      },
      {
        reference: 'REF-001',
        name: 'Chair B',
        description: 'B',
        category: 'furniture',
        price: '12.00',
        discount_price: '',
        stock: '2',
        image_url: '',
      },
    ]);

    expect(result.normalizedRows).toHaveLength(1);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'reference',
          message: 'duplicate reference "REF-001" in uploaded file',
        }),
      ]),
    );
  });

  it('rejects spreadsheet formula-like values in free-text fields', async () => {
    prismaMock.category.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'Furniture', slug: 'furniture' },
    ]);

    const result = await service.normalizeRows([
      {
        reference: 'REF-001',
        name: '=HYPERLINK("https://bad.example")',
        description: 'A',
        category: 'furniture',
        price: '10.00',
        discount_price: '',
        stock: '1',
        image_url: '',
      },
    ]);

    expect(result.normalizedRows).toEqual([]);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'name',
          message: 'name must not start with spreadsheet formula characters',
        }),
      ]),
    );
  });

  it('rejects invalid prices, stock, discount and image URLs', async () => {
    prismaMock.category.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'Furniture', slug: 'furniture' },
    ]);

    const result = await service.normalizeRows([
      {
        reference: 'REF-001',
        name: 'Chair',
        description: 'A',
        category: 'furniture',
        price: '10.00',
        discount_price: '15.00',
        stock: '1.5',
        image_url: 'notaurl',
      },
      {
        reference: 'REF-002',
        name: 'Table',
        description: 'B',
        category: 'furniture',
        price: 'NOT_A_PRICE',
        discount_price: '',
        stock: '2',
        image_url: '',
      },
    ]);

    expect(result.normalizedRows).toEqual([]);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'discount_price' }),
        expect.objectContaining({ field: 'stock' }),
        expect.objectContaining({ field: 'image_url' }),
        expect.objectContaining({ field: 'price', rowNumber: 3 }),
      ]),
    );
  });
});
