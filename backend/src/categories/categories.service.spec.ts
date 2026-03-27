import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prismaMock: {
    category: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prismaMock = {
      category: {
        create: jest.fn().mockResolvedValue({ id: 'cat-1', name: 'Ceramica' }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'cat-1', name: 'Ceramica' }]),
      },
    };
    service = new CategoriesService(prismaMock as never);
  });

  it('creates categories through Prisma', async () => {
    const dto = { name: 'Ceramica' };

    await expect(service.create(dto as never)).resolves.toEqual({
      id: 'cat-1',
      name: 'Ceramica',
    });
    expect(prismaMock.category.create).toHaveBeenCalledWith({
      data: dto,
    });
  });

  it('lists all categories through Prisma', async () => {
    await expect(service.findAll()).resolves.toEqual([
      { id: 'cat-1', name: 'Ceramica' },
    ]);
    expect(prismaMock.category.findMany).toHaveBeenCalled();
  });
});
