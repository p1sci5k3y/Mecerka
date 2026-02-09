import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

    console.log('Seeding completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
