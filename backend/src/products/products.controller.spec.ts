import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { CatalogImportService } from './catalog-import.service';

describe('ProductsController', () => {
  let controller: ProductsController;
  let productsServiceMock: any;
  let catalogImportServiceMock: any;

  const fakeUser = {
    userId: 'provider-1',
    roles: ['PROVIDER'] as any,
    mfaEnabled: false,
    mfaAuthenticated: true,
  };

  beforeEach(async () => {
    productsServiceMock = {
      create: jest.fn().mockResolvedValue({ id: 'prod-1' }),
      findAll: jest.fn().mockResolvedValue([]),
      findMyProducts: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'prod-1' }),
      update: jest.fn().mockResolvedValue({ id: 'prod-1' }),
      remove: jest.fn().mockResolvedValue({ id: 'prod-1' }),
      listClientDiscounts: jest.fn().mockResolvedValue([]),
      upsertClientDiscount: jest.fn().mockResolvedValue({ id: 'disc-1' }),
      updateClientDiscount: jest.fn().mockResolvedValue({ id: 'disc-1' }),
    };

    catalogImportServiceMock = {
      validateImport: jest.fn().mockResolvedValue({ jobId: 'job-1' }),
      applyImport: jest.fn().mockResolvedValue({ status: 'APPLIED' }),
      getImportJob: jest.fn().mockResolvedValue({ jobId: 'job-1' }),
      exportCatalog: jest.fn().mockResolvedValue({
        contentType: 'text/csv',
        filename: 'catalog.csv',
        buffer: Buffer.from('data'),
      }),
      exportTemplate: jest.fn().mockReturnValue({
        contentType: 'text/csv',
        filename: 'template.csv',
        buffer: Buffer.from('template'),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        { provide: ProductsService, useValue: productsServiceMock },
        { provide: CatalogImportService, useValue: catalogImportServiceMock },
      ],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('create delegates to productsService.create', async () => {
    const dto = { name: 'Chair', price: 50, stock: 10 } as any;
    const result = await controller.create(dto, { user: fakeUser });
    expect(productsServiceMock.create).toHaveBeenCalledWith(dto, 'provider-1');
    expect(result).toEqual({ id: 'prod-1' });
  });

  it('findAll returns all active products', async () => {
    const result = await controller.findAll();
    expect(productsServiceMock.findAll).toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('findMyProducts delegates with user id', async () => {
    const result = await controller.findMyProducts({ user: fakeUser });
    expect(productsServiceMock.findMyProducts).toHaveBeenCalledWith(
      'provider-1',
    );
    expect(result).toEqual([]);
  });

  it('findOne delegates with the given id', async () => {
    const result = await controller.findOne('prod-1');
    expect(productsServiceMock.findOne).toHaveBeenCalledWith('prod-1');
    expect(result).toEqual({ id: 'prod-1' });
  });

  it('update delegates with id, dto and user id', async () => {
    const dto = { price: 60 } as any;
    const result = await controller.update('prod-1', dto, { user: fakeUser });
    expect(productsServiceMock.update).toHaveBeenCalledWith(
      'prod-1',
      dto,
      'provider-1',
    );
    expect(result).toEqual({ id: 'prod-1' });
  });

  it('remove delegates with id and user id', async () => {
    const result = await controller.remove('prod-1', { user: fakeUser });
    expect(productsServiceMock.remove).toHaveBeenCalledWith(
      'prod-1',
      'provider-1',
    );
    expect(result).toEqual({ id: 'prod-1' });
  });

  it('listClientDiscounts delegates with product id and user id', async () => {
    const result = await controller.listClientDiscounts('prod-1', {
      user: fakeUser,
    });
    expect(productsServiceMock.listClientDiscounts).toHaveBeenCalledWith(
      'prod-1',
      'provider-1',
    );
    expect(result).toEqual([]);
  });

  it('upsertClientDiscount delegates with product id, dto and user id', async () => {
    const dto = { clientId: 'client-1', discountPrice: 10 } as any;
    const result = await controller.upsertClientDiscount('prod-1', dto, {
      user: fakeUser,
    });
    expect(productsServiceMock.upsertClientDiscount).toHaveBeenCalledWith(
      'prod-1',
      'provider-1',
      dto,
    );
    expect(result).toEqual({ id: 'disc-1' });
  });

  it('updateClientDiscount delegates correctly', async () => {
    const dto = { discountPrice: 8 } as any;
    const result = await controller.updateClientDiscount(
      'prod-1',
      'disc-1',
      dto,
      { user: fakeUser },
    );
    expect(productsServiceMock.updateClientDiscount).toHaveBeenCalledWith(
      'prod-1',
      'disc-1',
      'provider-1',
      dto,
    );
    expect(result).toEqual({ id: 'disc-1' });
  });

  it('validateCatalogImport delegates to catalogImportService', async () => {
    const file = { originalname: 'test.csv', buffer: Buffer.from('') } as any;
    const result = await controller.validateCatalogImport(file, {
      user: fakeUser,
    });
    expect(catalogImportServiceMock.validateImport).toHaveBeenCalledWith(
      'provider-1',
      file,
    );
    expect(result).toEqual({ jobId: 'job-1' });
  });

  it('applyCatalogImport delegates to catalogImportService', async () => {
    const result = await controller.applyCatalogImport('job-1', {
      user: fakeUser,
    });
    expect(catalogImportServiceMock.applyImport).toHaveBeenCalledWith(
      'provider-1',
      'job-1',
    );
    expect(result).toEqual({ status: 'APPLIED' });
  });

  it('getCatalogImportJob delegates to catalogImportService', async () => {
    const result = await controller.getCatalogImportJob('job-1', {
      user: fakeUser,
    });
    expect(catalogImportServiceMock.getImportJob).toHaveBeenCalledWith(
      'provider-1',
      'job-1',
    );
    expect(result).toEqual({ jobId: 'job-1' });
  });

  it('exportCatalog sets response headers and returns a StreamableFile', async () => {
    const resMock = { setHeader: jest.fn() };
    const result = await controller.exportCatalog(
      { user: fakeUser },
      resMock as any,
    );
    expect(resMock.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(resMock.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="catalog.csv"',
    );
    expect(result).toBeDefined();
  });

  it('getCatalogTemplate sets response headers and returns a StreamableFile', () => {
    const resMock = { setHeader: jest.fn() };
    const result = controller.getCatalogTemplate(resMock as any);
    expect(resMock.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(result).toBeDefined();
  });
});
