import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertProviderDto } from './dto/upsert-provider.dto';

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  private static readonly MAX_SLUG_SOURCE_LENGTH = 200;

  private slugify(value: string): string {
    const normalizedInput = value
      .normalize('NFKD')
      .slice(0, ProvidersService.MAX_SLUG_SOURCE_LENGTH);

    let slug = '';
    let lastWasDash = false;

    for (const rawChar of normalizedInput) {
      const codePoint = rawChar.codePointAt(0);

      if (
        codePoint !== undefined &&
        codePoint >= 0x0300 &&
        codePoint <= 0x036f
      ) {
        continue;
      }

      const char = rawChar.toLowerCase();
      const isAsciiLetter = char >= 'a' && char <= 'z';
      const isDigit = char >= '0' && char <= '9';

      if (isAsciiLetter || isDigit) {
        slug += char;
        lastWasDash = false;
        continue;
      }

      if (!lastWasDash && slug.length > 0) {
        slug += '-';
        lastWasDash = true;
      }
    }

    if (slug.endsWith('-')) {
      slug = slug.slice(0, -1);
    }

    return slug;
  }

  private async ensureUniqueSlug(
    userId: string,
    businessName: string,
    requestedSlug?: string,
  ): Promise<string> {
    const baseSlug = this.slugify(requestedSlug || businessName);

    if (!baseSlug) {
      throw new BadRequestException('Provider slug cannot be empty');
    }

    let candidate = baseSlug;
    let suffix = 1;

    while (true) {
      const existing = await this.prisma.provider.findFirst({
        where: {
          slug: candidate,
          NOT: { userId },
        },
        select: { id: true },
      });

      if (!existing) {
        return candidate;
      }

      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
  }

  private async assertProviderUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, roles: true, active: true },
    });

    if (!user?.active) {
      throw new NotFoundException('Provider user not found or inactive');
    }

    if (!user.roles.includes('PROVIDER')) {
      throw new BadRequestException('User does not have PROVIDER role');
    }

    return user;
  }

  async getOwnProfile(userId: string) {
    await this.assertProviderUser(userId);

    return this.prisma.provider.findUnique({
      where: { userId },
      include: {
        city: true,
        category: true,
        user: {
          select: { id: true, name: true, email: true, stripeAccountId: true },
        },
      },
    });
  }

  async upsertOwnProfile(userId: string, dto: UpsertProviderDto) {
    await this.assertProviderUser(userId);
    const slug = await this.ensureUniqueSlug(
      userId,
      dto.businessName,
      dto.slug,
    );

    return this.prisma.provider.upsert({
      where: { userId },
      update: {
        slug,
        businessName: dto.businessName,
        cityId: dto.cityId,
        categoryId: dto.categoryId,
        description: dto.description,
        workshopHistory: dto.workshopHistory,
        photos: dto.photos,
        videoUrl: dto.videoUrl,
        websiteUrl: dto.websiteUrl,
        isPublished: dto.isPublished ?? false,
      },
      create: {
        userId,
        slug,
        businessName: dto.businessName,
        cityId: dto.cityId,
        categoryId: dto.categoryId,
        description: dto.description,
        workshopHistory: dto.workshopHistory,
        photos: dto.photos,
        videoUrl: dto.videoUrl,
        websiteUrl: dto.websiteUrl,
        isPublished: dto.isPublished ?? false,
      },
      include: {
        city: true,
        category: true,
      },
    });
  }

  async publishOwnProfile(userId: string, isPublished: boolean) {
    await this.assertProviderUser(userId);

    const provider = await this.prisma.provider.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!provider) {
      throw new NotFoundException('Provider profile not found');
    }

    return this.prisma.provider.update({
      where: { userId },
      data: { isPublished },
      include: {
        city: true,
        category: true,
      },
    });
  }

  async getPublicProfile(slug: string) {
    const provider = await this.prisma.provider.findFirst({
      where: {
        slug,
        isPublished: true,
        user: {
          active: true,
          stripeAccountId: { not: null },
        },
      },
      include: {
        city: true,
        category: true,
        user: {
          select: { id: true, name: true },
        },
      },
    });

    if (!provider) {
      throw new NotFoundException('Provider page not found');
    }

    const products = await this.prisma.product.findMany({
      where: {
        providerId: provider.userId,
        isActive: true,
      },
      include: {
        category: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      id: provider.id,
      slug: provider.slug,
      businessName: provider.businessName,
      description: provider.description,
      workshopHistory: provider.workshopHistory,
      photos: provider.photos,
      videoUrl: provider.videoUrl,
      websiteUrl: provider.websiteUrl,
      city: provider.city,
      category: provider.category,
      owner: provider.user,
      products,
    };
  }
}
