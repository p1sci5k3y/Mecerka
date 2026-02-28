const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');

async function testOrder() {
    const user = await prisma.user.findUnique({ where: { email: 'e2e-client-final-bypass-v3@test.com' } });
    if (!user) throw new Error("User not found");

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        throw new Error("JWT_SECRET environment variable is missing");
    }

    const token = jwt.sign({ sub: user.id, email: user.email, roles: user.roles }, jwtSecret, { expiresIn: '1h' });

    const payload = {
        items: [
            {
                productId: 5,
                quantity: 1
            }
        ],
        deliveryAddress: 'Calle Falsa 123'
    };

    const response = await fetch('http://localhost:3000/orders', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', data);
}

// eslint-disable-next-line unicorn/prefer-top-level-await
testOrder()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
