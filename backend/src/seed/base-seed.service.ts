import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type BaseCitySeed = {
  name: string;
  slug: string;
};

type BaseCategorySeed = {
  name: string;
  slug: string;
  image_url?: string;
};

@Injectable()
export class BaseSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BaseSeedService.name);
  private baseSeedPromise: Promise<void> | null = null;

  private static readonly STRUCTURAL_CITIES: BaseCitySeed[] = [
    { name: 'Madrid', slug: 'madrid' },
    { name: 'Valencia', slug: 'valencia' },
    { name: 'Toledo', slug: 'toledo' },
  ];

  private static readonly STRUCTURAL_CATEGORIES: BaseCategorySeed[] = [
    {
      name: 'Panadería',
      slug: 'panaderia',
      image_url: '/demo-products/bread.jpg',
    },
    {
      name: 'Verduras',
      slug: 'verduras',
      image_url: '/demo-products/tomatoes.jpg',
    },
    {
      name: 'Despensa',
      slug: 'despensa',
      image_url: '/demo-products/olive-oil.jpg',
    },
    {
      name: 'Lácteos',
      slug: 'lacteos',
      image_url: '/demo-products/cheese.jpg',
    },
  ];

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    await this.ensureBaseData();
  }

  async ensureBaseData() {
    if (!this.baseSeedPromise) {
      this.baseSeedPromise = this.runBaseSeed().catch((error) => {
        this.baseSeedPromise = null;
        throw error;
      });
    }

    return this.baseSeedPromise;
  }

  private async runBaseSeed() {
    for (const city of BaseSeedService.STRUCTURAL_CITIES) {
      await this.prisma.city.upsert({
        where: { slug: city.slug },
        update: {},
        create: {
          name: city.name,
          slug: city.slug,
          active: true,
        },
      });
    }

    for (const category of BaseSeedService.STRUCTURAL_CATEGORIES) {
      await this.prisma.category.upsert({
        where: { slug: category.slug },
        update: {},
        create: {
          name: category.name,
          slug: category.slug,
          image_url: category.image_url,
        },
      });
    }

    this.logger.log(
      `seed.base cities=${BaseSeedService.STRUCTURAL_CITIES.length} categories=${BaseSeedService.STRUCTURAL_CATEGORIES.length}`,
    );
  }
}
