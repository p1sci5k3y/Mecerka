import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ProductImportFormat,
  ProductImportJobStatus,
} from '@prisma/client';
import XLSX from 'xlsx';
import {
  CatalogFileParser,
  type ParsedCatalogRecord,
  type UploadedCatalogFile,
} from './catalog-file.parser';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertDiscountPriceValid,
  normalizeProductReference,
} from './product-catalog.utils';

interface CatalogValidationError {
  rowNumber: number;
  field: string;
  message: string;
}

interface NormalizedCatalogRow {
  rowNumber: number;
  reference: string;
  name: string;
  description: string | null;
  categoryId: string;
  categoryLabel: string;
  price: number;
  discountPrice: number | null;
  stock: number;
  imageUrl: string | null;
}

@Injectable()
export class CatalogImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogFileParser: CatalogFileParser,
  ) {}

  async validateImport(providerId: string, file?: UploadedCatalogFile) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Catalog file is required');
    }

    const provider = await this.prisma.provider.findUnique({
      where: { userId: providerId },
      select: { userId: true, cityId: true },
    });

    if (!provider) {
      throw new NotFoundException('Provider profile not found');
    }

    const parsed = this.catalogFileParser.parse(file);
    const { normalizedRows, errors } = await this.normalizeRows(parsed.rows);

    return this.prisma.productImportJob.create({
      data: {
        providerId,
        format: parsed.format,
        filename: file.originalname,
        status:
          errors.length === 0
            ? ProductImportJobStatus.VALIDATED
            : ProductImportJobStatus.FAILED,
        totalRows: parsed.rows.length,
        validRows: normalizedRows.length,
        failedCount: errors.length,
        validationErrors: errors as unknown as Prisma.InputJsonValue,
        ...(errors.length === 0
          ? {
              payload: {
                cityId: provider.cityId,
                rows: normalizedRows,
              } as unknown as Prisma.InputJsonValue,
            }
          : {}),
      },
    });
  }

  async getImportJob(providerId: string, jobId: string) {
    const job = await this.prisma.productImportJob.findFirst({
      where: { id: jobId, providerId },
    });

    if (!job) {
      throw new NotFoundException('Import job not found');
    }

    return job;
  }

  async applyImport(providerId: string, jobId: string) {
    const job = await this.prisma.productImportJob.findFirst({
      where: { id: jobId, providerId },
    });

    if (!job) {
      throw new NotFoundException('Import job not found');
    }

    if (job.status === ProductImportJobStatus.APPLIED) {
      return job;
    }

    if (job.status !== ProductImportJobStatus.VALIDATED || !job.payload) {
      throw new BadRequestException(
        'Only validated import jobs can be applied',
      );
    }

    const payload = job.payload as unknown as {
      cityId: string;
      rows: NormalizedCatalogRow[];
    };

    const result = await this.prisma.$transaction(async (tx) => {
      let createdCount = 0;
      let updatedCount = 0;

      for (const row of payload.rows) {
        const existing = await tx.product.findUnique({
          where: {
            providerId_reference: {
              providerId,
              reference: row.reference,
            },
          },
          select: { id: true },
        });

        await tx.product.upsert({
          where: {
            providerId_reference: {
              providerId,
              reference: row.reference,
            },
          },
          update: {
            name: row.name,
            description: row.description,
            categoryId: row.categoryId,
            cityId: payload.cityId,
            price: row.price,
            discountPrice: row.discountPrice,
            stock: row.stock,
            imageUrl: row.imageUrl,
            isActive: true,
          },
          create: {
            providerId,
            reference: row.reference,
            name: row.name,
            description: row.description,
            categoryId: row.categoryId,
            cityId: payload.cityId,
            price: row.price,
            discountPrice: row.discountPrice,
            stock: row.stock,
            imageUrl: row.imageUrl,
            isActive: true,
          },
        });

        if (existing) {
          updatedCount += 1;
        } else {
          createdCount += 1;
        }
      }

      return tx.productImportJob.update({
        where: { id: jobId },
        data: {
          status: ProductImportJobStatus.APPLIED,
          appliedAt: new Date(),
          createdCount,
          updatedCount,
          failedCount: 0,
        },
      });
    });

    return result;
  }

  async exportCatalog(providerId: string, format: 'csv' | 'xlsx') {
    const products = await this.prisma.product.findMany({
      where: { providerId },
      include: {
        category: {
          select: { slug: true, name: true },
        },
      },
      orderBy: [{ name: 'asc' }, { reference: 'asc' }],
    });

    const rows = products.map((product) => ({
      reference: product.reference,
      name: product.name,
      description: product.description ?? '',
      category: product.category.slug || product.category.name,
      price: Number(product.price).toFixed(2),
      discount_price:
        product.discountPrice !== null
          ? Number(product.discountPrice).toFixed(2)
          : '',
      stock: product.stock,
      image_url: product.imageUrl ?? '',
    }));

    if (format === 'xlsx') {
      return this.buildWorkbookResponse(rows, 'catalog-export.xlsx');
    }

    return {
      filename: 'catalog-export.csv',
      contentType: 'text/csv; charset=utf-8',
      buffer: Buffer.from(this.toCsv(rows), 'utf8'),
    };
  }

  exportTemplate(format: 'csv' | 'xlsx') {
    const sampleRows = [
      {
        reference: 'CHAIR-001',
        name: 'Oak Chair',
        description: 'Handmade oak dining chair',
        category: 'furniture',
        price: '149.00',
        discount_price: '129.00',
        stock: 12,
        image_url: 'https://cdn.example.com/products/chair-001.jpg',
      },
    ];

    if (format === 'xlsx') {
      return this.buildWorkbookResponse(sampleRows, 'catalog-template.xlsx');
    }

    return {
      filename: 'catalog-template.csv',
      contentType: 'text/csv; charset=utf-8',
      buffer: Buffer.from(this.toCsv(sampleRows), 'utf8'),
    };
  }

  private async normalizeRows(rows: ParsedCatalogRecord[]) {
    const categories = await this.prisma.category.findMany({
      select: { id: true, name: true, slug: true },
    });
    const categoryIndex = new Map<string, string>();

    for (const category of categories) {
      categoryIndex.set(category.id.toLowerCase(), category.id);
      categoryIndex.set(category.slug.toLowerCase(), category.id);
      categoryIndex.set(category.name.toLowerCase(), category.id);
    }

    const errors: CatalogValidationError[] = [];
    const normalizedRows: NormalizedCatalogRow[] = [];
    const referencesInFile = new Set<string>();

    rows.forEach((row, rowIndex) => {
      const rowNumber = rowIndex + 2;
      const reference = normalizeProductReference(row.reference ?? '');
      const name = (row.name ?? '').trim();
      const description = this.normalizeOptionalText(row.description);
      const categoryToken = (row.category ?? '').trim().toLowerCase();
      const price = this.parsePrice(row.price);
      const discountPrice = this.parseOptionalPrice(row.discount_price);
      const stock = this.parseStock(row.stock);
      const imageUrl = this.normalizeOptionalText(row.image_url);

      if (!reference) {
        errors.push({
          rowNumber,
          field: 'reference',
          message: 'reference is required',
        });
      } else if (referencesInFile.has(reference)) {
        errors.push({
          rowNumber,
          field: 'reference',
          message: `duplicate reference "${reference}" in uploaded file`,
        });
      } else {
        referencesInFile.add(reference);
      }

      if (!name) {
        errors.push({
          rowNumber,
          field: 'name',
          message: 'name is required',
        });
      }

      const categoryId = categoryIndex.get(categoryToken);
      if (!categoryId) {
        errors.push({
          rowNumber,
          field: 'category',
          message: `unknown category "${row.category ?? ''}"`,
        });
      }

      if (price === null) {
        errors.push({
          rowNumber,
          field: 'price',
          message: 'price must be a positive decimal number',
        });
      }

      if (stock === null) {
        errors.push({
          rowNumber,
          field: 'stock',
          message: 'stock must be a non-negative integer',
        });
      }

      if (imageUrl && !this.isValidHttpUrl(imageUrl)) {
        errors.push({
          rowNumber,
          field: 'image_url',
          message: 'image_url must be a valid http/https URL',
        });
      }

      if (price !== null) {
        try {
          assertDiscountPriceValid(price, discountPrice);
        } catch {
          errors.push({
            rowNumber,
            field: 'discount_price',
            message: 'discount_price must be lower than price',
          });
        }
      }

      const rowHasErrors = errors.some(
        (error) => error.rowNumber === rowNumber,
      );
      if (!rowHasErrors && categoryId && price !== null && stock !== null) {
        normalizedRows.push({
          rowNumber,
          reference,
          name,
          description,
          categoryId,
          categoryLabel: row.category,
          price,
          discountPrice,
          stock,
          imageUrl,
        });
      }
    });

    return { normalizedRows, errors };
  }

  private normalizeOptionalText(value?: string): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private parsePrice(value?: string): number | null {
    if (!value?.trim()) {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  }

  private parseOptionalPrice(value?: string): number | null {
    if (!value?.trim()) {
      return null;
    }

    return this.parsePrice(value);
  }

  private parseStock(value?: string): number | null {
    if (value === undefined || value === null || value.trim() === '') {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return null;
    }

    return parsed;
  }

  private isValidHttpUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private buildWorkbookResponse(
    rows: Record<string, string | number>[],
    filename: string,
  ) {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'catalog');

    return {
      filename,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
    };
  }

  private toCsv(rows: Record<string, string | number>[]): string {
    if (rows.length === 0) {
      return 'reference,name,description,category,price,discount_price,stock,image_url\n';
    }

    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((header) => this.escapeCsvCell(String(row[header] ?? '')))
          .join(','),
      ),
    ];

    return `${lines.join('\n')}\n`;
  }

  private escapeCsvCell(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }

    return value;
  }
}
