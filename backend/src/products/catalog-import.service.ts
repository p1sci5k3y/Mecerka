import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductImportJobStatus } from '@prisma/client';
import {
  CatalogFileParser,
  type UploadedCatalogFile,
} from './catalog-file.parser';
import { PrismaService } from '../prisma/prisma.service';
import {
  CatalogImportValidationService,
  type NormalizedCatalogRow,
} from './catalog-import-validation.service';

@Injectable()
export class CatalogImportService {
  private static readonly FORMULA_PREFIXES = new Set(['=', '+', '-', '@']);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogFileParser: CatalogFileParser,
    private readonly catalogImportValidationService: CatalogImportValidationService,
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
    const { normalizedRows, errors } =
      await this.catalogImportValidationService.normalizeRows(parsed.rows);

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

  async exportCatalog(providerId: string) {
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

    return {
      filename: 'catalog-export.csv',
      contentType: 'text/csv; charset=utf-8',
      buffer: Buffer.from(this.toCsv(rows), 'utf8'),
    };
  }

  exportTemplate() {
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

    return {
      filename: 'catalog-template.csv',
      contentType: 'text/csv; charset=utf-8',
      buffer: Buffer.from(this.toCsv(sampleRows), 'utf8'),
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
          .map((header) =>
            this.escapeCsvCell(
              this.sanitizeCsvExportCell(String(row[header] ?? '')),
            ),
          )
          .join(','),
      ),
    ];

    return `${lines.join('\n')}\n`;
  }

  private sanitizeCsvExportCell(value: string): string {
    const normalized = value.trimStart();

    if (!normalized) {
      return value;
    }

    if (CatalogImportService.FORMULA_PREFIXES.has(normalized[0])) {
      return `'${value}`;
    }

    return value;
  }

  private escapeCsvCell(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }

    return value;
  }
}
