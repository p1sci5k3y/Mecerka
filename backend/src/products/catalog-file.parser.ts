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
    const format = this.detectFormat(file);
    const rows =
      format === ProductImportFormat.CSV
        ? this.parseCsv(file.buffer)
        : this.parseXlsx(file.buffer);

    if (rows.length === 0) {
      throw new BadRequestException('The uploaded catalog is empty');
    }

    return { format, rows };
  }

  private parseCsv(buffer: Buffer): ParsedCatalogRecord[] {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const matrix = this.parseDelimitedText(text);
    return this.toRecords(matrix);
  }

  private parseXlsx(buffer: Buffer): ParsedCatalogRecord[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
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
}
