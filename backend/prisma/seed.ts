import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// eslint-disable-next-line sonarjs/cognitive-complexity
async function main() {
    console.log('Seeding database...');

    // Cities
    const cities = [
        { name: 'Madrid', slug: 'madrid', active: true },
        { name: 'Barcelona', slug: 'barcelona', active: true },
        { name: 'Valencia', slug: 'valencia', active: true },
    ];

    for (const city of cities) {
        const exists = await prisma.city.findUnique({ where: { slug: city.slug } });
        if (!exists) {
            await prisma.city.create({ data: city });
            console.log(`Created city: ${city.name}`);
        }
    }

    // Admin User
    const adminEmail = 'admin@meceka.local';
    const adminExists = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!adminExists) {
        const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin123!';
        if (!process.env.SEED_ADMIN_PASSWORD) {
            console.warn('WARNING: Using insecure default password for admin user. Set SEED_ADMIN_PASSWORD env var.');
        }
        const hashedPassword = await argon2.hash(adminPassword);
        await prisma.user.create({
            data: {
                email: adminEmail,
                password: hashedPassword,
                name: 'Admin',
                roles: [Role.ADMIN],
                mfaEnabled: false,
                emailVerified: true
            }
        });
        console.log('Created admin user: admin@meceka.local');
    }

    // Categories
    const categories = [
        { name: 'Alimentación', slug: 'alimentacion', image_url: 'https://example.com/food.jpg' },
        { name: 'Moda', slug: 'moda', image_url: 'https://example.com/fashion.jpg' },
        { name: 'Tecnología', slug: 'tecnologia', image_url: 'https://example.com/tech.jpg' },
    ];

    for (const category of categories) {
        const exists = await prisma.category.findUnique({ where: { slug: category.slug } });
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
            isActive: true
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
            isActive: true
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
            isActive: true
        }
    ];

    for (const r of runners) {
        const userExists = await prisma.user.findUnique({ where: { email: r.email } });
        if (!userExists) {
            const hashedPassword = await argon2.hash('Runner123!');
            const user = await prisma.user.create({
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
                            isActive: r.isActive
                        }
                    }
                }
            });
            console.log(`Created runner: ${user.name}`);
        }
    }


    // --- MOCK DATA: Providers & Products ---
    console.log('Seeding Providers & Products...');

    // Get dependencies
    const madrid = await prisma.city.findUnique({ where: { slug: 'madrid' } });
    const alimentacion = await prisma.category.findUnique({ where: { slug: 'alimentacion' } });
    const moda = await prisma.category.findUnique({ where: { slug: 'moda' } });

    if (madrid && alimentacion && moda) {
        // 1. Create Provider
        const providerEmail = 'provider@meceka.local';
        let provider = await prisma.user.findUnique({ where: { email: providerEmail } });

        if (!provider) {
            const pwd = await argon2.hash('Provider123!');
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
                    longitude: -3.7074
                }
            });
            console.log(`Created provider: ${provider.name}`);
        }

        // 2. Create Products for Provider
        const products = [
            { name: 'Manzanas Golden (1kg)', price: 2.5, stock: 100, categoryId: alimentacion.id },
            { name: 'Pan Artesano', price: 1.2, stock: 50, categoryId: alimentacion.id },
            { name: 'Camiseta Básica', price: 15, stock: 200, categoryId: moda.id } // Different category
        ];

        for (const p of products) {
            // Check if product exists for this provider (simple check by name)
            const exists = await prisma.product.findFirst({
                where: { name: p.name, providerId: provider.id }
            });

            if (!exists) {
                await prisma.product.create({
                    data: {
                        name: p.name,
                        description: `Delicious ${p.name}`,
                        price: p.price,
                        stock: p.stock,
                        imageUrl: 'https://images.unsplash.com/photo-1568724309179-1c662888c385',
                        providerId: provider.id,
                        cityId: madrid.id, // All in Madrid for now
                        categoryId: p.categoryId
                    }
                });
                console.log(`Created product: ${p.name}`);
            }
        }
    }

    // --- MOCK DATA: Clients ---
    console.log('Seeding Clients...');
    const clientEmail = 'client@meceka.local';
    let client = await prisma.user.findUnique({ where: { email: clientEmail } });

    if (!client) {
        const pwd = await argon2.hash('Client123!');
        client = await prisma.user.create({
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
                longitude: -3.683
            }
        });
        console.log(`Created client: ${client.name}`);
    }

    console.log('Seeding completed.');
}

// eslint-disable-next-line unicorn/prefer-top-level-await
main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
