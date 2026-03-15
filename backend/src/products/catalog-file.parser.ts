import { BadRequestException, Injectable } from '@nestjs/common';
import { ProductImportFormat } from '@prisma/client';
import XLSX from 'xlsx';

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
  private static readonly MAX_WORKSHEET_COUNT = 1;
  private static readonly ALLOWED_CSV_MIME_TYPES = new Set([
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'text/plain',
  ]);
  private static readonly ALLOWED_XLSX_MIME_TYPES = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
  ]);

  detectFormat(file: UploadedCatalogFile): ProductImportFormat {
    const normalizedName = file.originalname.toLowerCase();

    if (normalizedName.endsWith('.csv')) {
      return ProductImportFormat.CSV;
    }

    if (normalizedName.endsWith('.xlsx')) {
      return ProductImportFormat.XLSX;
    }

    throw new BadRequestException('Only CSV and XLSX files are supported');
  }

  parse(file: UploadedCatalogFile): {
    format: ProductImportFormat;
    rows: ParsedCatalogRecord[];
  } {
    this.validateUploadEnvelope(file);

    const format = this.detectFormat(file);
    this.validateMimeType(file, format);
    const rows =
      format === ProductImportFormat.CSV
        ? this.parseCsv(file.buffer)
        : this.parseXlsx(file.buffer);

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

    if (
      format === ProductImportFormat.XLSX &&
      !CatalogFileParser.ALLOWED_XLSX_MIME_TYPES.has(mimetype)
    ) {
      throw new BadRequestException('Invalid XLSX content type');
    }
  }

  private parseCsv(buffer: Buffer): ParsedCatalogRecord[] {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const matrix = this.parseDelimitedText(text);
    return this.toRecords(matrix);
  }

  private parseXlsx(buffer: Buffer): ParsedCatalogRecord[] {
    if (!this.isZipLike(buffer)) {
      throw new BadRequestException('Malformed XLSX file');
    }

    let workbook: XLSX.WorkBook;

    try {
      workbook = XLSX.read(buffer, {
        type: 'buffer',
        dense: true,
        raw: false,
      });
    } catch {
      throw new BadRequestException('Malformed XLSX file');
    }

    if (
      workbook.SheetNames.length === 0 ||
      workbook.SheetNames.length > CatalogFileParser.MAX_WORKSHEET_COUNT
    ) {
      throw new BadRequestException(
        'The uploaded workbook must contain exactly one worksheet',
      );
    }

    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new BadRequestException(
        'The uploaded workbook does not contain sheets',
      );
    }

    const matrix = XLSX.utils.sheet_to_json<string[]>(
      workbook.Sheets[firstSheetName],
      {
        header: 1,
        raw: false,
        defval: '',
      },
    );

    return this.toRecords(matrix);
  }

  private parseDelimitedText(text: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          currentField += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === ',' && !inQuotes) {
        currentRow.push(currentField);
        currentField = '';
        continue;
      }

      if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') {
          index += 1;
        }
        currentRow.push(currentField);
        currentField = '';

        if (currentRow.some((value) => value.trim() !== '')) {
          rows.push(currentRow);
        }

        currentRow = [];
        continue;
      }

      currentField += char;
    }

    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField);
      if (currentRow.some((value) => value.trim() !== '')) {
        rows.push(currentRow);
      }
    }

    return rows;
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

  private isZipLike(buffer: Buffer): boolean {
    return (
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04
    );
  }
}
