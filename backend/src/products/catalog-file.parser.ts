import { BadRequestException, Injectable } from '@nestjs/common';
import { ProductImportFormat } from '@prisma/client';
import { parse } from 'csv-parse/sync';

export interface UploadedCatalogFile {
  originalname: string;
  mimetype?: string;
  buffer: Buffer;
  size?: number;
}

export type ParsedCatalogRecord = Record<string, string>;

@Injectable()
export class CatalogFileParser {
  private static readonly MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
  private static readonly MAX_ROW_COUNT = 1000;
  private static readonly MAX_COLUMN_COUNT = 50;
  private static readonly ALLOWED_CSV_MIME_TYPES = new Set([
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'text/plain',
  ]);

  detectFormat(file: UploadedCatalogFile): ProductImportFormat {
    const normalizedName = file.originalname.toLowerCase();

    if (normalizedName.endsWith('.csv')) {
      return ProductImportFormat.CSV;
    }

    throw new BadRequestException('Only CSV files are supported');
  }

  parse(file: UploadedCatalogFile): {
    format: ProductImportFormat;
    rows: ParsedCatalogRecord[];
  } {
    this.validateUploadEnvelope(file);

    const format = this.detectFormat(file);
    this.validateMimeType(file, format);
    const rows = this.parseCsv(file.buffer);

    if (rows.length === 0) {
      throw new BadRequestException('The uploaded catalog is empty');
    }

    return { format, rows };
  }

  private validateUploadEnvelope(file: UploadedCatalogFile) {
    const declaredSize = file.size ?? file.buffer.length;
    const effectiveSize = Math.max(file.buffer.length, declaredSize);

    if (effectiveSize > CatalogFileParser.MAX_UPLOAD_BYTES) {
      throw new BadRequestException('Catalog file exceeds the 5 MB size limit');
    }
  }

  private validateMimeType(
    file: UploadedCatalogFile,
    format: ProductImportFormat,
  ) {
    const mimetype = file.mimetype?.trim().toLowerCase();

    if (!mimetype) {
      return;
    }

    if (
      format === ProductImportFormat.CSV &&
      !CatalogFileParser.ALLOWED_CSV_MIME_TYPES.has(mimetype)
    ) {
      throw new BadRequestException('Invalid CSV content type');
    }
  }

  private parseCsv(buffer: Buffer): ParsedCatalogRecord[] {
    try {
      const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
      const matrix = parse(text, {
        bom: true,
        columns: false,
        skip_empty_lines: true,
        relax_column_count: false,
        trim: false,
        max_record_size: 64 * 1024,
      }) as string[][];

      return this.toRecords(matrix);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Malformed CSV file');
    }
  }

  private toRecords(matrix: string[][]): ParsedCatalogRecord[] {
    const [headerRow, ...dataRows] = matrix;

    if (!headerRow || headerRow.length === 0) {
      throw new BadRequestException(
        'The uploaded catalog must include a header row',
      );
    }

    const headers = headerRow.map((header) => this.normalizeHeader(header));
    const requiredHeaders = ['reference', 'name', 'category', 'price', 'stock'];

    if (headers.length > CatalogFileParser.MAX_COLUMN_COUNT) {
      throw new BadRequestException(
        `Catalog file exceeds the ${CatalogFileParser.MAX_COLUMN_COUNT} column limit`,
      );
    }

    for (const requiredHeader of requiredHeaders) {
      if (!headers.includes(requiredHeader)) {
        throw new BadRequestException(
          `Missing required column "${requiredHeader}" in uploaded catalog`,
        );
      }
    }

    if (dataRows.length > CatalogFileParser.MAX_ROW_COUNT) {
      throw new BadRequestException(
        `Catalog file exceeds the ${CatalogFileParser.MAX_ROW_COUNT} row limit`,
      );
    }

    return dataRows.map((row) => {
      if (row.length > CatalogFileParser.MAX_COLUMN_COUNT) {
        throw new BadRequestException(
          `Catalog file exceeds the ${CatalogFileParser.MAX_COLUMN_COUNT} column limit`,
        );
      }

      if (row.length !== headers.length) {
        throw new BadRequestException(
          'Malformed CSV file: inconsistent column count',
        );
      }

      const record: ParsedCatalogRecord = {};

      headers.forEach((header, index) => {
        record[header] = String(row[index] ?? '').trim();
      });

      return record;
    });
  }

  private normalizeHeader(header: string): string {
    return header.trim().toLowerCase().replace(/\s+/g, '_');
  }
}
