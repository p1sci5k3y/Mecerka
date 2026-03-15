import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CitiesService } from './cities.service';

describe('CitiesService', () => {
  let service: CitiesService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      city: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CitiesService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<CitiesService>(CitiesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns active cities ordered by name for dropdown consumption', async () => {
    prismaMock.city.findMany.mockResolvedValue([
      { id: 'city-1', name: 'A Coruna', slug: 'a-coruna' },
      { id: 'city-2', name: 'Madrid', slug: 'madrid' },
    ]);

    const result = await service.findAll();

    expect(prismaMock.city.findMany).toHaveBeenCalledWith({
      where: { active: true },
      select: {
        id: true,
        name: true,
        slug: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
    expect(result).toEqual([
      { id: 'city-1', name: 'A Coruna', slug: 'a-coruna' },
      { id: 'city-2', name: 'Madrid', slug: 'madrid' },
    ]);
  });
});
