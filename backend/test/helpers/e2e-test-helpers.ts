import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DeliveryStatus,
  ProviderOrderStatus,
  ProviderPaymentStatus,
  Role,
  RoleGrantSource,
  RoleRequestStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertTestEnvironment } from '../test-env';

type CreateTestUserOptions = {
  email?: string;
  password?: string;
  name?: string;
  roles?: Role[];
  emailVerified?: boolean;
  mfaEnabled?: boolean;
  active?: boolean;
  stripeAccountId?: string | null;
  requestedRole?: Role | null;
  roleStatus?: RoleRequestStatus | null;
  requestedAt?: Date | null;
  fiscalIdHash?: string | null;
  fiscalIdLast4?: string | null;
  fiscalCountry?: string | null;
  lastRoleGrantedById?: string | null;
  lastRoleSource?: RoleGrantSource | null;
  withRunnerProfile?: boolean;
};

type CatalogFixture = {
  city: { id: string; name: string; slug: string };
  category: { id: string; name: string; slug: string };
};

type OrderFixtureOptions = {
  clientId: string;
  cityId: string;
  runnerId?: string | null;
  providerId?: string;
  productId?: string;
  status?: DeliveryStatus;
};

export const TEST_PASSWORD = 'Str0ng!Passw0rd';

export async function createTestApp() {
  assertTestEnvironment();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  const prisma = app.get<PrismaService>(PrismaService);
  return { app, prisma };
}

export async function closeTestApp(app: INestApplication) {
  if (!app) {
    return;
  }

  await app.close();
}

export async function truncateDatabase(prisma: PrismaService) {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) {
    return;
  }

  const quotedTables = tables
    .map(({ tablename }: { tablename: string }) => `"${tablename}"`)
    .join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE;`,
  );
}

export async function createTestUser(
  prisma: PrismaService,
  options: CreateTestUserOptions = {},
) {
  const suffix = crypto.randomUUID();
  const email = options.email ?? `user.${suffix}@example.test`;
  const password = options.password ?? TEST_PASSWORD;
  const hashedPassword = await argon2.hash(password);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name: options.name ?? `User ${suffix.slice(0, 8)}`,
      roles: options.roles ?? [Role.CLIENT],
      emailVerified: options.emailVerified ?? true,
      mfaEnabled: options.mfaEnabled ?? false,
      active: options.active ?? true,
      stripeAccountId:
        options.stripeAccountId === undefined ? null : options.stripeAccountId,
      requestedRole: options.requestedRole ?? null,
      roleStatus: options.roleStatus ?? null,
      requestedAt: options.requestedAt ?? null,
      fiscalIdHash: options.fiscalIdHash ?? null,
      fiscalIdLast4: options.fiscalIdLast4 ?? null,
      fiscalCountry: options.fiscalCountry ?? null,
      lastRoleGrantedById: options.lastRoleGrantedById ?? null,
      lastRoleSource: options.lastRoleSource ?? null,
    },
  });

  if (options.withRunnerProfile) {
    await prisma.runnerProfile.create({
      data: {
        userId: user.id,
      },
    });
  }

  return { user, password };
}

export async function loginAndGetToken(
  app: INestApplication,
  email: string,
  password: string,
) {
  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password });

  return response;
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function createCatalogFixture(
  prisma: PrismaService,
  suffix = crypto.randomUUID().slice(0, 8),
): Promise<CatalogFixture> {
  const city = await prisma.city.create({
    data: {
      name: `City ${suffix}`,
      slug: `city-${suffix}`,
    },
  });

  const category = await prisma.category.create({
    data: {
      name: `Category ${suffix}`,
      slug: `category-${suffix}`,
    },
  });

  return { city, category };
}

export async function createProductFixture(
  prisma: PrismaService,
  providerId: string,
  cityId: string,
  categoryId: string,
  suffix = crypto.randomUUID().slice(0, 8),
) {
  return prisma.product.create({
    data: {
      providerId,
      cityId,
      categoryId,
      reference: `prod-${suffix}`,
      name: `Product ${suffix}`,
      price: 12.5,
      stock: 20,
      description: `Product ${suffix} description`,
      imageUrl: 'https://example.test/product.jpg',
    },
  });
}

export async function createOrderFixture(
  prisma: PrismaService,
  options: OrderFixtureOptions,
) {
  const order = await prisma.order.create({
    data: {
      clientId: options.clientId,
      cityId: options.cityId,
      runnerId: options.runnerId ?? null,
      totalPrice: 20,
      status: options.status ?? DeliveryStatus.PENDING,
      checkoutIdempotencyKey: crypto.randomUUID(),
      deliveryAddress: 'Integration Test Street 1',
    },
  });

  if (options.providerId && options.productId) {
    const providerOrder = await prisma.providerOrder.create({
      data: {
        orderId: order.id,
        providerId: options.providerId,
        subtotalAmount: 20,
        status: ProviderOrderStatus.PENDING,
        paymentStatus: ProviderPaymentStatus.PENDING,
      },
    });

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: options.productId },
    });

    const orderItem = await prisma.orderItem.create({
      data: {
        providerOrderId: providerOrder.id,
        productId: options.productId,
        quantity: 2,
        priceAtPurchase: product.discountPrice ?? product.price,
      },
    });

    return { order, providerOrder, orderItem };
  }

  return { order };
}

export async function requestRole(
  app: INestApplication,
  token: string,
  payload: Record<string, unknown>,
) {
  return request(app.getHttpServer())
    .post('/users/request-role')
    .set(authHeader(token))
    .send(payload);
}
