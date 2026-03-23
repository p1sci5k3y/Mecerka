import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductImportFormat, ProductImportJobStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogFileParser } from './catalog-file.parser';
import { CatalogImportService } from './catalog-import.service';
import { CatalogImportValidationService } from './catalog-import-validation.service';

describe('CatalogImportService', () => {
  let service: CatalogImportService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      provider: {
        findUnique: jest.fn(),
      },
      category: {
        findMany: jest.fn(),
      },
      productImportJob: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      product: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogImportService,
        CatalogFileParser,
        CatalogImportValidationService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<CatalogImportService>(CatalogImportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('validates a CSV catalog and stores a normalized job payload', async () => {
    prismaMock.provider.findUnique.mockResolvedValue({
      userId: 'provider-1',
      cityId: 'city-1',
    });
    prismaMock.category.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'Furniture', slug: 'furniture' },
    ]);
    prismaMock.productImportJob.create.mockImplementation(({ data }: any) => ({
      id: 'job-1',
      ...data,
    }));

    const file = {
      originalname: 'catalog.csv',
      buffer: Buffer.from(
        [
          'reference,name,description,category,price,discount_price,stock,image_url',
          'CHAIR-001,Oak Chair,Handmade chair,furniture,149.00,129.00,12,https://cdn.example.com/chair.jpg',
          'TABLE-002,Walnut Table,Large table,Furniture,299.00,,3,',
        ].join('\n'),
      ),
    };

    const result = await service.validateImport('provider-1', file);

    expect(result.status).toBe(ProductImportJobStatus.VALIDATED);
    expect(result.format).toBe(ProductImportFormat.CSV);
    expect(result.validRows).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(result.payload).toEqual({
      cityId: 'city-1',
      rows: [
        expect.objectContaining({
          reference: 'CHAIR-001',
          categoryId: 'cat-1',
          discountPrice: 129,
        }),
        expect.objectContaining({
          reference: 'TABLE-002',
          categoryId: 'cat-1',
          discountPrice: null,
        }),
      ],
    });
  });

  it('fails validation when rows contain unknown categories or invalid discounts', async () => {
    prismaMock.provider.findUnique.mockResolvedValue({
      userId: 'provider-1',
      cityId: 'city-1',
    });
    prismaMock.category.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'Furniture', slug: 'furniture' },
    ]);
    prismaMock.productImportJob.create.mockImplementation(
      ({ data }: any) => data,
    );

    const file = {
      originalname: 'catalog.csv',
      buffer: Buffer.from(
        [
          'reference,name,description,category,price,discount_price,stock,image_url',
          'CHAIR-001,Oak Chair,Handmade chair,unknown-category,149.00,129.00,12,https://cdn.example.com/chair.jpg',
          'TABLE-002,Walnut Table,Large table,furniture,299.00,350.00,3,',
        ].join('\n'),
      ),
    };

    const result = await service.validateImport('provider-1', file);

    expect(result.status).toBe(ProductImportJobStatus.FAILED);
    expect(result.validRows).toBe(0);
    expect(result.payload).toBeUndefined();
    expect(result.validationErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'category',
          rowNumber: 2,
        }),
        expect.objectContaining({
          field: 'discount_price',
          rowNumber: 3,
        }),
      ]),
    );
  });

  it('applies a validated import job using per-reference upserts', async () => {
    prismaMock.productImportJob.findFirst.mockResolvedValue({
      id: 'job-1',
      providerId: 'provider-1',
      status: ProductImportJobStatus.VALIDATED,
      payload: {
        cityId: 'city-1',
        rows: [
          {
            reference: 'CHAIR-001',
            name: 'Oak Chair',
            description: 'Handmade chair',
            categoryId: 'cat-1',
            price: 149,
            discountPrice: 129,
            stock: 12,
            imageUrl: 'https://cdn.example.com/chair.jpg',
          },
          {
            reference: 'TABLE-002',
            name: 'Walnut Table',
            description: 'Large table',
            categoryId: 'cat-1',
            price: 299,
            discountPrice: null,
            stock: 3,
            imageUrl: null,
          },
        ],
      },
    });

    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback({
        product: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 'product-2' }),
          upsert: jest.fn().mockResolvedValue({}),
        },
        productImportJob: {
          update: jest.fn().mockImplementation(({ data }: any) => ({
            id: 'job-1',
            ...data,
          })),
        },
      }),
    );

    const result = await service.applyImport('provider-1', 'job-1');

    expect(result.status).toBe(ProductImportJobStatus.APPLIED);
    expect(result.createdCount).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(result.appliedAt).toBeInstanceOf(Date);
  });

  it('exports a provider catalog to CSV with round-trip headers', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      {
        reference: 'CHAIR-001',
        name: 'Oak Chair',
        description: 'Handmade chair',
        price: 149,
        discountPrice: 129,
        stock: 12,
        imageUrl: 'https://cdn.example.com/chair.jpg',
        category: { slug: 'furniture', name: 'Furniture' },
      },
    ]);

    const file = await service.exportCatalog('provider-1');
    const body = file.buffer.toString('utf8');

    expect(file.filename).toBe('catalog-export.csv');
    expect(body).toContain(
      'reference,name,description,category,price,discount_price,stock,image_url',
    );
    expect(body).toContain(
      'CHAIR-001,Oak Chair,Handmade chair,furniture,149.00,129.00,12,https://cdn.example.com/chair.jpg',
    );
  });

  it('rejects apply on unknown jobs', async () => {
    prismaMock.productImportJob.findFirst.mockResolvedValue(null);

    await expect(service.applyImport('provider-1', 'job-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects apply on failed jobs', async () => {
    prismaMock.productImportJob.findFirst.mockResolvedValue({
      id: 'job-1',
      providerId: 'provider-1',
      status: ProductImportJobStatus.FAILED,
      payload: null,
    });

    await expect(service.applyImport('provider-1', 'job-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects oversized catalog uploads before job creation', async () => {
    prismaMock.provider.findUnique.mockResolvedValue({
      userId: 'provider-1',
      cityId: 'city-1',
    });

    await expect(
      service.validateImport('provider-1', {
        originalname: 'catalog.csv',
        mimetype: 'text/csv',
        size: 5 * 1024 * 1024 + 1,
        buffer: Buffer.from(
          'reference,name,category,price,stock\nA,Chair,furniture,10,1',
        ),
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prismaMock.productImportJob.create).not.toHaveBeenCalled();
  });

  it('rejects non-CSV uploads', async () => {
    prismaMock.provider.findUnique.mockResolvedValue({
      userId: 'provider-1',
      cityId: 'city-1',
    });

    await expect(
      service.validateImport('provider-1', {
        originalname: 'catalog.xlsx',
        mimetype: 'application/octet-stream',
        buffer: Buffer.from('not-a-real-xlsx'),
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prismaMock.productImportJob.create).not.toHaveBeenCalled();
  });

  it('rejects CSV files with inconsistent column counts', async () => {
    prismaMock.provider.findUnique.mockResolvedValue({
      userId: 'provider-1',
      cityId: 'city-1',
    });

    await expect(
      service.validateImport('provider-1', {
        originalname: 'catalog.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from(
          [
            'reference,name,category,price,stock',
            'A-1,Chair,furniture,10,1',
            'B-1,Table,furniture,20',
          ].join('\n'),
        ),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects CSV files with more than 1000 rows', async () => {
    prismaMock.provider.findUnique.mockResolvedValue({
      userId: 'provider-1',
      cityId: 'city-1',
    });

    const rows = [
      'reference,name,category,price,stock',
      ...Array.from(
        { length: 1001 },
        (_, index) => `REF-${index},Chair ${index},furniture,10,1`,
      ),
    ];

    await expect(
      service.validateImport('provider-1', {
        originalname: 'catalog.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from(rows.join('\n')),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects CSV files with more than 50 columns', async () => {
    prismaMock.provider.findUnique.mockResolvedValue({
      userId: 'provider-1',
      cityId: 'city-1',
    });

    const headers = Array.from({ length: 51 }, (_, index) => `col_${index}`);
    const row = Array.from({ length: 51 }, (_, index) => `value_${index}`);

    await expect(
      service.validateImport('provider-1', {
        originalname: 'catalog.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from([headers.join(','), row.join(',')].join('\n')),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects CSV files with oversized cells', async () => {
    prismaMock.provider.findUnique.mockResolvedValue({
      userId: 'provider-1',
      cityId: 'city-1',
    });

    const oversizedName = 'A'.repeat(2001);

    await expect(
      service.validateImport('provider-1', {
        originalname: 'catalog.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from(
          [
            'reference,name,category,price,stock',
            `A-1,${oversizedName},furniture,10,1`,
          ].join('\n'),
        ),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects formula-like values in free-text catalog fields', async () => {
    prismaMock.provider.findUnique.mockResolvedValue({
      userId: 'provider-1',
      cityId: 'city-1',
    });
    prismaMock.category.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'Furniture', slug: 'furniture' },
    ]);
    prismaMock.productImportJob.create.mockImplementation(
      ({ data }: any) => data,
    );

    const result = await service.validateImport('provider-1', {
      originalname: 'catalog.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(
        [
          'reference,name,description,category,price,stock,image_url',
          'A-1,"=HYPERLINK(""https://bad.example"")",desc,furniture,10,1,https://cdn.example.com/a.jpg',
        ].join('\n'),
      ),
    });

    expect(result.status).toBe(ProductImportJobStatus.FAILED);
    expect(result.validationErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'name',
          message: 'name must not start with spreadsheet formula characters',
        }),
      ]),
    );
  });

  it('sanitizes export cells that could trigger spreadsheet formulas', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      {
        reference: 'CHAIR-001',
        name: '=Unsafe Name',
        description: '+Potential formula',
        price: 149,
        discountPrice: null,
        stock: 12,
        imageUrl: 'https://cdn.example.com/chair.jpg',
        category: { slug: 'furniture', name: 'Furniture' },
      },
    ]);

    const file = await service.exportCatalog('provider-1');
    const body = file.buffer.toString('utf8');

    expect(body).toContain("'=Unsafe Name");
    expect(body).toContain("'+Potential formula");
  });

  // ─── branch coverage additions ────────────────────────────────────────────

  describe('branch coverage', () => {
    describe('validateImport', () => {
      it('throws BadRequestException when file is missing', async () => {
        await expect(
          service.validateImport('provider-1', undefined),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws BadRequestException when file buffer is empty', async () => {
        await expect(
          service.validateImport('provider-1', {
            buffer: Buffer.alloc(0),
          } as any),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws NotFoundException when provider does not exist', async () => {
        prismaMock.provider.findUnique.mockResolvedValue(null);

        await expect(
          service.validateImport('missing-provider', {
            buffer: Buffer.from('reference,name\nREF-001,Test'),
            originalname: 'catalog.csv',
          } as any),
        ).rejects.toThrow(NotFoundException);
      });

      it('creates FAILED job when CSV rows have validation errors', async () => {
        prismaMock.provider.findUnique.mockResolvedValue({
          userId: 'provider-1',
          cityId: 'city-1',
        });
        prismaMock.category.findMany.mockResolvedValue([
          { id: 'cat-1', name: 'Furniture', slug: 'furniture' },
        ]);
        prismaMock.productImportJob.create.mockImplementation(
          ({ data }: any) => ({
            id: 'job-fail',
            ...data,
          }),
        );

        const file = {
          originalname: 'catalog.csv',
          buffer: Buffer.from(
            [
              'reference,name,description,category,price,discount_price,stock,image_url',
              ',Missing Reference,desc,furniture,10.00,,5,', // missing reference
            ].join('\n'),
          ),
        };

        const result = await service.validateImport('provider-1', file);

        expect(result.status).toBe(ProductImportJobStatus.FAILED);
        expect(result.failedCount).toBeGreaterThan(0);
      });

      it('creates FAILED job for duplicate reference in file', async () => {
        prismaMock.provider.findUnique.mockResolvedValue({
          userId: 'provider-1',
          cityId: 'city-1',
        });
        prismaMock.category.findMany.mockResolvedValue([
          { id: 'cat-1', name: 'Furniture', slug: 'furniture' },
        ]);
        prismaMock.productImportJob.create.mockImplementation(
          ({ data }: any) => ({
            id: 'job-dup',
            ...data,
          }),
        );

        const file = {
          originalname: 'catalog.csv',
          buffer: Buffer.from(
            [
              'reference,name,description,category,price,discount_price,stock,image_url',
              'REF-001,Chair A,desc,furniture,10.00,,5,',
              'REF-001,Chair B,desc,furniture,15.00,,3,', // duplicate ref
            ].join('\n'),
          ),
        };

        const result = await service.validateImport('provider-1', file);

        expect(result.status).toBe(ProductImportJobStatus.FAILED);
      });

      it('creates FAILED job when category is unknown', async () => {
        prismaMock.provider.findUnique.mockResolvedValue({
          userId: 'provider-1',
          cityId: 'city-1',
        });
        prismaMock.category.findMany.mockResolvedValue([]);
        prismaMock.productImportJob.create.mockImplementation(
          ({ data }: any) => ({
            id: 'job-cat',
            ...data,
          }),
        );

        const file = {
          originalname: 'catalog.csv',
          buffer: Buffer.from(
            [
              'reference,name,description,category,price,discount_price,stock,image_url',
              'REF-001,Chair,desc,unknown-category,10.00,,5,',
            ].join('\n'),
          ),
        };

        const result = await service.validateImport('provider-1', file);

        expect(result.status).toBe(ProductImportJobStatus.FAILED);
      });

      it('creates FAILED job when price is invalid', async () => {
        prismaMock.provider.findUnique.mockResolvedValue({
          userId: 'provider-1',
          cityId: 'city-1',
        });
        prismaMock.category.findMany.mockResolvedValue([
          { id: 'cat-1', name: 'Furniture', slug: 'furniture' },
        ]);
        prismaMock.productImportJob.create.mockImplementation(
          ({ data }: any) => ({
            id: 'job-price',
            ...data,
          }),
        );

        const file = {
          originalname: 'catalog.csv',
          buffer: Buffer.from(
            [
              'reference,name,description,category,price,discount_price,stock,image_url',
              'REF-001,Chair,desc,furniture,NOT_A_PRICE,,5,',
            ].join('\n'),
          ),
        };

        const result = await service.validateImport('provider-1', file);

        expect(result.status).toBe(ProductImportJobStatus.FAILED);
      });

      it('creates FAILED job when stock is invalid (float)', async () => {
        prismaMock.provider.findUnique.mockResolvedValue({
          userId: 'provider-1',
          cityId: 'city-1',
        });
        prismaMock.category.findMany.mockResolvedValue([
          { id: 'cat-1', name: 'Furniture', slug: 'furniture' },
        ]);
        prismaMock.productImportJob.create.mockImplementation(
          ({ data }: any) => ({
            id: 'job-stock',
            ...data,
          }),
        );

        const file = {
          originalname: 'catalog.csv',
          buffer: Buffer.from(
            [
              'reference,name,description,category,price,discount_price,stock,image_url',
              'REF-001,Chair,desc,furniture,10.00,,1.5,', // float stock not valid
            ].join('\n'),
          ),
        };

        const result = await service.validateImport('provider-1', file);

        expect(result.status).toBe(ProductImportJobStatus.FAILED);
      });

      it('creates FAILED job when image_url is invalid', async () => {
        prismaMock.provider.findUnique.mockResolvedValue({
          userId: 'provider-1',
          cityId: 'city-1',
        });
        prismaMock.category.findMany.mockResolvedValue([
          { id: 'cat-1', name: 'Furniture', slug: 'furniture' },
        ]);
        prismaMock.productImportJob.create.mockImplementation(
          ({ data }: any) => ({
            id: 'job-imgurl',
            ...data,
          }),
        );

        const file = {
          originalname: 'catalog.csv',
          buffer: Buffer.from(
            [
              'reference,name,description,category,price,discount_price,stock,image_url',
              'REF-001,Chair,desc,furniture,10.00,,5,not-a-valid-url',
            ].join('\n'),
          ),
        };

        const result = await service.validateImport('provider-1', file);

        expect(result.status).toBe(ProductImportJobStatus.FAILED);
      });

      it('creates FAILED job when discount_price >= price', async () => {
        prismaMock.provider.findUnique.mockResolvedValue({
          userId: 'provider-1',
          cityId: 'city-1',
        });
        prismaMock.category.findMany.mockResolvedValue([
          { id: 'cat-1', name: 'Furniture', slug: 'furniture' },
        ]);
        prismaMock.productImportJob.create.mockImplementation(
          ({ data }: any) => ({
            id: 'job-discount',
            ...data,
          }),
        );

        const file = {
          originalname: 'catalog.csv',
          buffer: Buffer.from(
            [
              'reference,name,description,category,price,discount_price,stock,image_url',
              'REF-001,Chair,desc,furniture,10.00,10.00,5,', // discount == price
            ].join('\n'),
          ),
        };

        const result = await service.validateImport('provider-1', file);

        expect(result.status).toBe(ProductImportJobStatus.FAILED);
      });
    });

    describe('getImportJob', () => {
      it('throws NotFoundException when job does not exist', async () => {
        prismaMock.productImportJob.findFirst.mockResolvedValue(null);

        await expect(
          service.getImportJob('provider-1', 'missing-job'),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('applyImport', () => {
      it('throws NotFoundException when job does not exist', async () => {
        prismaMock.productImportJob.findFirst.mockResolvedValue(null);

        await expect(
          service.applyImport('provider-1', 'missing-job'),
        ).rejects.toThrow(NotFoundException);
      });

      it('returns job immediately if already APPLIED', async () => {
        const job = {
          id: 'job-1',
          status: ProductImportJobStatus.APPLIED,
          payload: null,
        };
        prismaMock.productImportJob.findFirst.mockResolvedValue(job);

        const result = await service.applyImport('provider-1', 'job-1');

        expect(result).toEqual(job);
      });

      it('throws BadRequestException if job status is not VALIDATED', async () => {
        prismaMock.productImportJob.findFirst.mockResolvedValue({
          id: 'job-1',
          status: ProductImportJobStatus.FAILED,
          payload: null,
        });

        await expect(
          service.applyImport('provider-1', 'job-1'),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('exportTemplate', () => {
      it('returns a CSV template file', () => {
        const result = service.exportTemplate();

        expect(result.filename).toBe('catalog-template.csv');
        expect(result.contentType).toContain('text/csv');
        expect(result.buffer.toString('utf8')).toContain('reference');
      });
    });
  });
});
