import { ConflictException, Injectable } from '@nestjs/common';
import { BaseSeedService } from '../seed/base-seed.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import type { DemoSeededProduct } from './demo-order-scenario.service';
import { DEMO_CATEGORIES, DEMO_CITY, DEMO_PRODUCTS } from './demo.seed-data';

@Injectable()
export class DemoCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
    private readonly baseSeedService: BaseSeedService,
  ) {}

  async createDemoCatalog(
    findUserByEmail: (email: string) => Promise<{ id: string }>,
  ) {
    await this.baseSeedService.ensureBaseData();

    const city = await this.prisma.city.findUnique({
      where: { slug: DEMO_CITY.slug },
      select: { id: true, name: true, slug: true },
    });

    if (!city) {
      throw new ConflictException('Base city not found for demo seed');
    }

    const categories = new Map<string, string>();
    const seededCategories = await this.prisma.category.findMany({
      where: {
        slug: {
          in: DEMO_CATEGORIES.map((category) => category.slug),
        },
      },
      select: {
        id: true,
        slug: true,
      },
    });

    for (const category of seededCategories) {
      categories.set(category.slug, category.id);
    }

    const usersByEmail = new Map<string, string>();
    for (const email of [
      'provider.demo@local.test',
      'provider2.demo@local.test',
    ]) {
      const user = await findUserByEmail(email);
      usersByEmail.set(email, user.id);
    }

    const products: DemoSeededProduct[] = [];
    for (const product of DEMO_PRODUCTS) {
      const providerId = usersByEmail.get(product.providerEmail);
      const categoryId = categories.get(product.categorySlug);

      if (!providerId || !categoryId) {
        throw new ConflictException(
          `Demo product dependencies missing for ${product.name}`,
        );
      }

      const created = await this.productsService.create(
        {
          name: product.name,
          description: product.description,
          price: product.price,
          stock: product.stock,
          cityId: city.id,
          categoryId,
          imageUrl: `/demo-products/${product.imageFilename}`,
        },
        providerId,
      );

      products.push(created);
    }

    return {
      city,
      products,
    };
  }
}
