import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProvidersService } from './providers.service';

describe('ProvidersService', () => {
  let service: ProvidersService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
      },
      provider: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      product: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProvidersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ProvidersService>(ProvidersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates or updates the provider profile with a unique slug', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'provider-user',
      roles: [Role.PROVIDER],
      active: true,
    });
    prismaMock.provider.findFirst
      .mockResolvedValueOnce({ id: 'existing-provider' })
      .mockResolvedValueOnce(null);
    prismaMock.provider.upsert.mockImplementation(({ create }: any) => create);

    const result = await service.upsertOwnProfile('provider-user', {
      businessName: 'Workshop Norte',
      slug: 'workshop-norte',
      cityId: 'city-1',
      categoryId: 'category-1',
      description: 'Traditional craftwork',
      workshopHistory: 'Founded in 1984',
      photos: ['https://cdn.example.com/photo-1.jpg'],
      websiteUrl: 'https://workshop.example.com',
      videoUrl: 'https://cdn.example.com/video.mp4',
      isPublished: true,
    });

    expect(prismaMock.provider.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'provider-user' },
        create: expect.objectContaining({
          slug: 'workshop-norte-1',
        }),
        update: expect.objectContaining({
          slug: 'workshop-norte-1',
        }),
      }),
    );
    expect(result.slug).toBe('workshop-norte-1');
  });

  it('returns the published provider page with active products', async () => {
    prismaMock.provider.findFirst.mockResolvedValue({
      id: 'provider-profile',
      userId: 'provider-user',
      slug: 'workshop-norte',
      businessName: 'Workshop Norte',
      description: 'Traditional craftwork',
      workshopHistory: 'Founded in 1984',
      photos: ['https://cdn.example.com/photo-1.jpg'],
      videoUrl: null,
      websiteUrl: 'https://workshop.example.com',
      city: { id: 'city-1', name: 'Seville' },
      category: { id: 'category-1', name: 'Furniture' },
      user: { id: 'provider-user', name: 'Ana Provider' },
    });
    prismaMock.product.findMany.mockResolvedValue([
      { id: 'product-1', name: 'Oak Chair', isActive: true },
    ]);

    const result = await service.getPublicProfile('workshop-norte');

    expect(prismaMock.product.findMany).toHaveBeenCalledWith({
      where: {
        providerId: 'provider-user',
        isActive: true,
      },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual(
      expect.objectContaining({
        slug: 'workshop-norte',
        businessName: 'Workshop Norte',
        owner: { id: 'provider-user', name: 'Ana Provider' },
        products: [{ id: 'product-1', name: 'Oak Chair', isActive: true }],
      }),
    );
  });

  it('rejects unknown public slugs', async () => {
    prismaMock.provider.findFirst.mockResolvedValue(null);

    await expect(service.getPublicProfile('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('normalizes long hostile slug input into a bounded safe slug', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'provider-user',
      roles: [Role.PROVIDER],
      active: true,
    });
    prismaMock.provider.findFirst.mockResolvedValue(null);
    prismaMock.provider.upsert.mockImplementation(({ create }: any) => create);

    const result = await service.upsertOwnProfile('provider-user', {
      businessName: 'ignored-business-name',
      slug: `${'Á'.repeat(300)}!!!____----${'x'.repeat(80)}`,
      cityId: 'city-1',
      categoryId: 'category-1',
      description: 'Traditional craftwork',
      workshopHistory: 'Founded in 1984',
      photos: ['https://cdn.example.com/photo-1.jpg'],
      websiteUrl: 'https://workshop.example.com',
      videoUrl: 'https://cdn.example.com/video.mp4',
      isPublished: true,
    });

    expect(result.slug).toMatch(/^[a-z0-9-]+$/);
    expect(result.slug.length).toBeLessThanOrEqual(200);
    expect(result.slug).not.toContain('--');
    expect(result.slug.startsWith('-')).toBe(false);
    expect(result.slug.endsWith('-')).toBe(false);
  });

  // ─── branch coverage additions ────────────────────────────────────────────

  describe('branch coverage', () => {
    describe('assertProviderUser', () => {
      it('throws NotFoundException when user is null', async () => {
        prismaMock.user.findUnique.mockResolvedValue(null);

        await expect(service.getOwnProfile('missing-user')).rejects.toThrow(
          NotFoundException,
        );
      });

      it('throws NotFoundException when user is inactive', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'provider-user',
          roles: [Role.PROVIDER],
          active: false,
        });

        await expect(service.getOwnProfile('provider-user')).rejects.toThrow(
          NotFoundException,
        );
      });

      it('throws BadRequestException when user does not have PROVIDER role', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'client-user',
          roles: [Role.CLIENT],
          active: true,
        });

        await expect(service.getOwnProfile('client-user')).rejects.toThrow(
          BadRequestException,
        );
      });
    });

    describe('publishOwnProfile', () => {
      it('throws NotFoundException when provider profile does not exist', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'provider-user',
          roles: [Role.PROVIDER],
          active: true,
        });
        prismaMock.provider.findUnique.mockResolvedValue(null);

        await expect(
          service.publishOwnProfile('provider-user', true),
        ).rejects.toThrow(NotFoundException);
      });

      it('publishes the profile when provider exists', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'provider-user',
          roles: [Role.PROVIDER],
          active: true,
        });
        prismaMock.provider.findUnique.mockResolvedValue({ id: 'prov-1' });
        prismaMock.provider.update.mockResolvedValue({
          id: 'prov-1',
          isPublished: true,
          city: null,
          category: null,
        });

        const result = await service.publishOwnProfile('provider-user', true);

        expect(prismaMock.provider.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: { isPublished: true } }),
        );
        expect(result).toMatchObject({ isPublished: true });
      });
    });

    describe('ensureUniqueSlug', () => {
      it('appends suffix when slug is already taken', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'provider-user',
          roles: [Role.PROVIDER],
          active: true,
        });

        // First call: slug is taken, second call: slug-1 is available
        prismaMock.provider.findFirst
          .mockResolvedValueOnce({ id: 'other-prov' }) // 'workshop' taken
          .mockResolvedValueOnce(null); // 'workshop-1' available

        prismaMock.provider.upsert.mockImplementation(
          ({ create }: any) => create,
        );

        const result = await service.upsertOwnProfile('provider-user', {
          businessName: 'Workshop',
          cityId: 'city-1',
          categoryId: 'cat-1',
          description: 'desc',
          workshopHistory: '',
          photos: [],
          isPublished: false,
        });

        expect(result.slug).toBe('workshop-1');
      });
    });
  });
});
