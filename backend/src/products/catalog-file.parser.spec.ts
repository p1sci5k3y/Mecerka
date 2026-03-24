import { BadRequestException } from '@nestjs/common';
import { ProductImportFormat } from '@prisma/client';
import { CatalogFileParser, UploadedCatalogFile } from './catalog-file.parser';

describe('CatalogFileParser', () => {
  let parser: CatalogFileParser;

  beforeEach(() => {
    parser = new CatalogFileParser();
  });

  function makeFile(
    contents: string,
    overrides: Partial<UploadedCatalogFile> = {},
  ): UploadedCatalogFile {
    return {
      originalname: 'catalog.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(contents, 'utf8'),
      ...overrides,
    };
  }

  it('parses a valid csv catalog file', () => {
    const result = parser.parse(
      makeFile(
        'reference,name,category,price,stock\nSKU-1,Tomate,Fruit,3.50,12\n',
      ),
    );

    expect(result).toEqual({
      format: ProductImportFormat.CSV,
      rows: [
        {
          reference: 'SKU-1',
          name: 'Tomate',
          category: 'Fruit',
          price: '3.50',
          stock: '12',
        },
      ],
    });
  });

  it('allows csv files without a declared mime type', () => {
    const result = parser.parse(
      makeFile(
        'reference,name,category,price,stock\nSKU-1,Tomate,Fruit,3.50,12\n',
        { mimetype: undefined },
      ),
    );

    expect(result.format).toBe(ProductImportFormat.CSV);
  });

  it('rejects unsupported file extensions', () => {
    expect(() =>
      parser.detectFormat(
        makeFile('reference,name\nx,y\n', { originalname: 'catalog.json' }),
      ),
    ).toThrow(new BadRequestException('Only CSV files are supported'));
  });

  it('rejects uploads above the maximum size limit', () => {
    expect(() =>
      parser.parse(
        makeFile('reference,name,category,price,stock\n', {
          size: 5 * 1024 * 1024 + 1,
        }),
      ),
    ).toThrow(
      new BadRequestException('Catalog file exceeds the 5 MB size limit'),
    );
  });

  it('rejects unsupported csv mime types', () => {
    expect(() =>
      parser.parse(
        makeFile('reference,name,category,price,stock\n', {
          mimetype: 'application/json',
        }),
      ),
    ).toThrow(new BadRequestException('Invalid CSV content type'));
  });

  it('rejects malformed csv payloads', () => {
    expect(() =>
      parser.parse(makeFile('"reference","name"\n"broken\n')),
    ).toThrow(new BadRequestException('Malformed CSV file'));
  });

  it('rejects catalogs without a header row and missing required headers', () => {
    expect(() => parser.parse(makeFile(''))).toThrow(
      new BadRequestException('The uploaded catalog must include a header row'),
    );

    expect(() =>
      parser.parse(makeFile('reference,name,category,price\nSKU-1,A,B,12\n')),
    ).toThrow(
      new BadRequestException(
        'Missing required column "stock" in uploaded catalog',
      ),
    );
  });

  it('rejects row and column counts above the configured limits', () => {
    const header = Array.from({ length: 51 }, (_, index) => `col${index}`).join(
      ',',
    );
    const tooManyRows =
      'reference,name,category,price,stock\n' +
      Array.from({ length: 1001 }, (_, index) => `SKU-${index},A,B,1,2`).join(
        '\n',
      );

    expect(() => parser.parse(makeFile(`${header}\n${header}\n`))).toThrow(
      new BadRequestException('Catalog file exceeds the 50 column limit'),
    );
    expect(() => parser.parse(makeFile(tooManyRows))).toThrow(
      new BadRequestException('Catalog file exceeds the 1000 row limit'),
    );
  });

  it('rejects inconsistent columns and oversized cells in data rows', () => {
    const oversizedCell = 'x'.repeat(2001);
    const toRecords = (
      parser as unknown as {
        toRecords: (matrix: string[][]) => Record<string, string>[];
      }
    ).toRecords.bind(parser);

    expect(() =>
      toRecords([
        ['reference', 'name', 'category', 'price', 'stock'],
        ['SKU-1', 'A', 'B', '3.5'],
      ]),
    ).toThrow(
      new BadRequestException('Malformed CSV file: inconsistent column count'),
    );

    expect(() =>
      toRecords([
        ['reference', 'name', 'category', 'price', 'stock'],
        ['SKU-1', oversizedCell, 'B', '3.5', '1'],
      ]),
    ).toThrow(
      new BadRequestException(
        'Catalog file exceeds the 2000 character limit per cell',
      ),
    );
  });
});
