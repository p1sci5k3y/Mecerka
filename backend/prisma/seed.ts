import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { maskEmail }: { maskEmail(email: string): string } = require('../seed-utils.js');

const prisma = new PrismaClient();
const generatedSeedPasswords = new Map<string, string>();

function isLocalOrDemoSeedMode() {
  return (
    process.env.DEMO_MODE === 'true' || process.env.NODE_ENV !== 'production'
  );
}

function generateSeedPassword() {
  return crypto.randomBytes(24).toString('base64url');
}

function resolveSeedPassword(envKey: string, label: string) {
  const configuredPassword = process.env[envKey]?.trim();
  if (configuredPassword) {
    return configuredPassword;
  }

  if (!isLocalOrDemoSeedMode()) {
    throw new Error(
      `${envKey} is required when seeding outside demo/local mode`,
    );
  }

  let generatedPassword = generatedSeedPasswords.get(envKey);
  if (!generatedPassword) {
    generatedPassword = generateSeedPassword();
    generatedSeedPasswords.set(envKey, generatedPassword);
    console.warn('[seed] Generated seed password', { account: label });
  }

  return generatedPassword;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
async function main() {
  console.log('Seeding database...');

  // Cities
  const cities = [
    { name: 'Madrid', slug: 'madrid', active: true },
    { name: 'Barcelona', slug: 'barcelona', active: true },
    { name: 'Valencia', slug: 'valencia', active: true },
    { name: 'Sevilla', slug: 'sevilla', active: true },
    { name: 'Malaga', slug: 'malaga', active: true },
    { name: 'Zaragoza', slug: 'zaragoza', active: true },
    { name: 'Bilbao', slug: 'bilbao', active: true },
    { name: 'Murcia', slug: 'murcia', active: true },
    { name: 'Palma', slug: 'palma', active: true },
    { name: 'Valladolid', slug: 'valladolid', active: true },
    { name: 'Alicante', slug: 'alicante', active: true },
    { name: 'A Coruna', slug: 'a-coruna', active: true },
    { name: 'Granada', slug: 'granada', active: true },
    { name: 'Cordoba', slug: 'cordoba', active: true },
    { name: 'Vigo', slug: 'vigo', active: true },
    { name: 'Gijon', slug: 'gijon', active: true },
    { name: 'Santander', slug: 'santander', active: true },
    { name: 'Pamplona', slug: 'pamplona', active: true },
    { name: 'Salamanca', slug: 'salamanca', active: true },
    { name: 'Cadiz', slug: 'cadiz', active: true },
    {
      name: 'Las Palmas de Gran Canaria',
      slug: 'las-palmas-de-gran-canaria',
      active: true,
    },
    {
      name: 'Santa Cruz de Tenerife',
      slug: 'santa-cruz-de-tenerife',
      active: true,
    },
  ];

  for (const city of cities) {
    await prisma.city.upsert({
      where: { slug: city.slug },
      update: {
        name: city.name,
        active: city.active,
      },
      create: city,
    });
    console.log(`Ensured city: ${city.name}`);
  }

  // Admin User
  const adminEmail = 'admin@meceka.local';
  const adminExists = await prisma.user.findUnique({
    where: { email: adminEmail },
  });
  if (!adminExists) {
    const adminPassword = resolveSeedPassword('SEED_ADMIN_PASSWORD', 'admin');
    const hashedPassword = await argon2.hash(adminPassword);
    await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        name: 'Admin',
        roles: [Role.ADMIN],
        mfaEnabled: false,
        emailVerified: true,
      },
    });
    console.log('[seed] Created admin user', { email: maskEmail(adminEmail) });
  }

  // Categories
  const categories = [
    {
      name: 'Alimentación',
      slug: 'alimentacion',
      image_url: 'https://example.com/food.jpg',
    },
    {
      name: 'Moda',
      slug: 'moda',
      image_url: 'https://example.com/fashion.jpg',
    },
    {
      name: 'Tecnología',
      slug: 'tecnologia',
      image_url: 'https://example.com/tech.jpg',
    },
  ];

  for (const category of categories) {
    const exists = await prisma.category.findUnique({
      where: { slug: category.slug },
    });
    if (!exists) {
      await prisma.category.create({ data: category });
      console.log(`Created category: ${category.name}`);
    }
  }

  // Runners (Mock Data)
  const runners = [
    {
      email: 'runner1@meceka.local',
      name: 'Runner Pro (Sol)',
      baseLat: 40.4168, // Puerta del Sol
      baseLng: -3.7038,
      priceBase: 2.5,
      pricePerKm: 0.5,
      maxDistanceKm: 10,
      ratingAvg: 4.9,
      isActive: true,
    },
    {
      email: 'runner2@meceka.local',
      name: 'Runner Eco (Atocha)',
      baseLat: 40.4065, // Atocha
      baseLng: -3.6896,
      priceBase: 1.5,
      pricePerKm: 0.4,
      maxDistanceKm: 10,
      ratingAvg: 4.2,
      isActive: true,
    },
    {
      email: 'runner3@meceka.local',
      name: 'Runner Far (Chamartín)',
      baseLat: 40.472, // Chamartín
      baseLng: -3.682,
      priceBase: 2,
      pricePerKm: 0.5,
      maxDistanceKm: 10,
      ratingAvg: 4.5,
      isActive: true,
    },
  ];

  for (const r of runners) {
    const userExists = await prisma.user.findUnique({
      where: { email: r.email },
    });
    if (!userExists) {
      const runnerPassword = resolveSeedPassword(
        'SEED_RUNNER_PASSWORD',
        'runner',
      );
      const hashedPassword = await argon2.hash(runnerPassword);
      await prisma.user.create({
        data: {
          email: r.email,
          password: hashedPassword,
          name: r.name,
          roles: [Role.RUNNER],
          mfaEnabled: false,
          emailVerified: true,
          runnerProfile: {
            create: {
              baseLat: r.baseLat,
              baseLng: r.baseLng,
              priceBase: r.priceBase,
              pricePerKm: r.pricePerKm,
              ratingAvg: r.ratingAvg,
              isActive: r.isActive,
            },
          },
        },
      });
      console.log('[seed] Created runner user', { email: maskEmail(r.email) });
    }
  }

  // --- MOCK DATA: Providers & Products ---
  console.log('Seeding Providers & Products...');

  // Get dependencies
  const madrid = await prisma.city.findUnique({ where: { slug: 'madrid' } });
  const alimentacion = await prisma.category.findUnique({
    where: { slug: 'alimentacion' },
  });
  const moda = await prisma.category.findUnique({ where: { slug: 'moda' } });

  if (madrid && alimentacion && moda) {
    // 1. Create Provider
    const providerEmail = 'provider@meceka.local';
    let provider = await prisma.user.findUnique({
      where: { email: providerEmail },
    });

    if (!provider) {
      const providerPassword = resolveSeedPassword(
        'SEED_PROVIDER_PASSWORD',
        'provider',
      );
      const pwd = await argon2.hash(providerPassword);
      provider = await prisma.user.create({
        data: {
          email: providerEmail,
          password: pwd,
          name: 'Mercado Central',
          roles: [Role.PROVIDER],
          mfaEnabled: false,
          emailVerified: true,
          // Mercado Central -> Plaza Mayor, Madrid
          address: 'Plaza Mayor, 1',
          latitude: 40.4155,
          longitude: -3.7074,
        },
      });
      console.log('[seed] Created provider user', {
        email: maskEmail(providerEmail),
      });
    }

    // 2. Create Products for Provider
    const products = [
      {
        name: 'Manzanas Golden (1kg)',
        price: 2.5,
        stock: 100,
        categoryId: alimentacion.id,
        imageUrl:
          'https://images.unsplash.com/photo-1570913149827-d2ac84ab3f9a?q=80&w=800',
      },
      {
        name: 'Pan Artesano',
        price: 1.2,
        stock: 50,
        categoryId: alimentacion.id,
        imageUrl:
          'https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=800',
      },
      {
        name: 'Camiseta Básica',
        price: 15,
        stock: 200,
        categoryId: moda.id,
        imageUrl:
          'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=800',
      },
    ];

    for (const p of products) {
      // Check if product exists for this provider (simple check by name)
      const exists = await prisma.product.findFirst({
        where: { name: p.name, providerId: provider.id },
      });

      if (!exists) {
        await prisma.product.create({
          data: {
            reference: p.name
              .toLowerCase()
              .replace(/\s+/g, '-')
              .replace(/[^a-z0-9()-]/g, ''),
            name: p.name,
            description: `Delicious ${p.name}`,
            price: p.price,
            stock: p.stock,
            imageUrl: p.imageUrl,
            providerId: provider.id,
            cityId: madrid.id, // All in Madrid for now
            categoryId: p.categoryId,
          },
        });
        console.log(`Created product: ${p.name}`);
      }
    }
  }

  // --- MOCK DATA: Clients ---
  console.log('Seeding Clients...');
  const clientEmail = 'client@meceka.local';
  const client = await prisma.user.findUnique({ where: { email: clientEmail } });

  if (!client) {
    const clientPassword = resolveSeedPassword('SEED_CLIENT_PASSWORD', 'client');
    const pwd = await argon2.hash(clientPassword);
    await prisma.user.create({
      data: {
        email: clientEmail,
        password: pwd,
        name: 'Juan Cliente',
        roles: [Role.CLIENT],
        mfaEnabled: false,
        emailVerified: true,
        // Juan Cliente -> Parque del Retiro, Madrid
        address: 'Parque del Retiro',
        latitude: 40.418,
        longitude: -3.683,
      },
    });
    console.log('[seed] Created client user', { email: maskEmail(clientEmail) });
  }

  console.log('Seeding completed.');
}

// eslint-disable-next-line unicorn/prefer-top-level-await
(async () => {
  let hasError = false;
  try {
    await main();
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown seed error';
    console.error('[seed] Failed', { message });
    hasError = true;
  } finally {
    await prisma.$disconnect();
    if (hasError) {
      process.exit(1);
    }
  }
})();
