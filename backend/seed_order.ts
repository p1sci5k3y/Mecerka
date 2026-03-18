import {
  PrismaClient,
  DeliveryStatus,
  ProviderOrderStatus,
  Role,
} from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';

const prisma = new PrismaClient();
const generatedSeedValues = new Map<string, string>();

function generatePassword() {
  return crypto.randomBytes(24).toString('base64url');
}

function generatePin() {
  return crypto.randomInt(1000, 10_000).toString();
}

function resolveOrGenerate(
  envKey: string,
  label: string,
  factory: () => string,
) {
  const configuredValue = process.env[envKey]?.trim();
  if (configuredValue) {
    return configuredValue;
  }

  let generatedValue = generatedSeedValues.get(envKey);
  if (!generatedValue) {
    generatedValue = factory();
    generatedSeedValues.set(envKey, generatedValue);
    console.warn(`[seed_order] Generated ${label}`);
  }

  return generatedValue;
}

async function main() {
  // 1. Get or create a Client
  let client = await prisma.user.findFirst({
    where: { email: 'e2e_client@mecerka.com', roles: { has: Role.CLIENT } },
  });
  if (!client) {
    const clientPassword = resolveOrGenerate(
      'E2E_SEED_CLIENT_PASSWORD',
      'client password',
      generatePassword,
    );
    const clientPin = resolveOrGenerate(
      'E2E_SEED_CLIENT_PIN',
      'client pin',
      generatePin,
    );
    client = await prisma.user.create({
      data: {
        email: 'e2e_client@mecerka.com',
        name: 'E2E Client',
        password: await argon2.hash(clientPassword),
        roles: [Role.CLIENT],
        emailVerified: true,
        mfaEnabled: false,
        pin: await argon2.hash(clientPin),
      },
    });
  }

  // 2. Get or create a Provider
  let provider = await prisma.user.findFirst({
    where: { email: 'e2e_provider@mecerka.com', roles: { has: Role.PROVIDER } },
  });
  if (!provider) {
    const providerPassword = resolveOrGenerate(
      'E2E_SEED_PROVIDER_PASSWORD',
      'provider password',
      generatePassword,
    );
    provider = await prisma.user.create({
      data: {
        email: 'e2e_provider@mecerka.com',
        name: 'E2E Provider',
        password: await argon2.hash(providerPassword),
        roles: [Role.PROVIDER],
        emailVerified: true,
        mfaEnabled: false,
      },
    });
  }

  // 3. Get or create a City
  let city = await prisma.city.findFirst();
  if (!city) {
    city = await prisma.city.create({
      data: {
        name: 'Madrid',
        slug: 'madrid',
        active: true,
      },
    });
  }

  // 4. Get or create a Category
  let category = await prisma.category.findFirst();
  if (!category) {
    category = await prisma.category.create({
      data: {
        name: 'E2E Validation Category',
        slug: 'e2e-validation-category',
      },
    });
  }

  // 5. Get or create a Product
  let product = await prisma.product.findFirst({
    where: { providerId: provider.id },
  });
  if (!product) {
    product = await prisma.product.create({
      data: {
        reference: 'E2E-VALIDATION-PRODUCT',
        providerId: provider.id,
        cityId: city.id,
        categoryId: category.id,
        name: 'E2E Validation Product',
        description: 'Product used for E2E testing',
        price: 15.5,
        stock: 100,
        isActive: true,
      },
    });
  }

  // 6. Create an order that is READY_FOR_ASSIGNMENT
  const order = await prisma.order.create({
    data: {
      clientId: client.id,
      cityId: city.id,
      checkoutIdempotencyKey: `seed-order-${Date.now()}`,
      status: DeliveryStatus.READY_FOR_ASSIGNMENT,
      totalPrice: 15.5,
      deliveryFee: 3.5,
      deliveryAddress: 'Calle Princesa 12, Madrid',
      deliveryLat: 40.425,
      deliveryLng: -3.715,
      paymentRef: `pi_dummy_e2e_${Date.now()}`,
      confirmedAt: new Date(),
      providerOrders: {
        create: [
          {
            providerId: provider.id,
            status: ProviderOrderStatus.READY_FOR_PICKUP,
            subtotalAmount: 15.5,
            paymentStatus: 'PAID',
            items: {
              create: [
                {
                  productId: product.id,
                  quantity: 1,
                  priceAtPurchase: 15.5,
                },
              ],
            },
          },
        ],
      },
    },
  });

  console.log(`Successfully seeded Order ID: ${order.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
