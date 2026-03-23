import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertDiscountPriceValid,
  normalizeProductReference,
} from './product-catalog.utils';
import type { ParsedCatalogRecord } from './catalog-file.parser';

export interface CatalogValidationError {
  rowNumber: number;
  field: string;
  message: string;
}

export interface NormalizedCatalogRow {
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
export class CatalogImportValidationService {
  private static readonly FORMULA_PREFIXES = new Set(['=', '+', '-', '@']);

  constructor(private readonly prisma: PrismaService) {}

  async normalizeRows(rows: ParsedCatalogRecord[]) {
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
      const rawName = (row.name ?? '').trim();
      const description = this.normalizeOptionalText(row.description);
      const rawCategory = (row.category ?? '').trim();
      const categoryToken = rawCategory.toLowerCase();
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

      if (!rawName) {
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

      this.pushFormulaInjectionError(
        errors,
        rowNumber,
        'reference',
        row.reference,
      );
      this.pushFormulaInjectionError(errors, rowNumber, 'name', row.name);
      this.pushFormulaInjectionError(
        errors,
        rowNumber,
        'description',
        row.description,
      );
      this.pushFormulaInjectionError(
        errors,
        rowNumber,
        'category',
        row.category,
      );
      this.pushFormulaInjectionError(
        errors,
        rowNumber,
        'image_url',
        row.image_url,
      );

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
          name: rawName,
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

  private pushFormulaInjectionError(
    errors: CatalogValidationError[],
    rowNumber: number,
    field: string,
    value?: string,
  ) {
    if (!this.hasFormulaLikePrefix(value)) {
      return;
    }

    errors.push({
      rowNumber,
      field,
      message: `${field} must not start with spreadsheet formula characters`,
    });
  }

  private hasFormulaLikePrefix(value?: string): boolean {
    const normalized = value?.trim();

    if (!normalized) {
      return false;
    }

    return CatalogImportValidationService.FORMULA_PREFIXES.has(normalized[0]);
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
}
