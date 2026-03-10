import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Role, DeliveryStatus, ProviderOrderStatus } from '@prisma/client';

describe('Order Lifecycle (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    let clientToken: string;
    let providerToken: string;
    let runnerToken: string;

    let providerId: string;
    let cityId: string;
    let productId: string;

    let createdOrderId: string;
    let providerOrderId: string;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
        await app.init();

        prisma = app.get<PrismaService>(PrismaService);

        // Clean DB setup (or handle uniquely)
        const suffix = Date.now().toString();

        await request(app.getHttpServer())
            .post('/auth/register')
            .send({ email: `client_${suffix}@e2e.com`, password: 'A1_StrongPassword!', name: 'Client', role: Role.CLIENT });

        const client = await prisma.user.findFirst({ where: { email: `client_${suffix}@e2e.com` } });
        await prisma.user.update({ where: { id: client!.id }, data: { emailVerified: true } });

        await request(app.getHttpServer())
            .post('/auth/register')
            .send({ email: `prov_${suffix}@e2e.com`, password: 'A1_StrongPassword!', name: 'Provider', role: Role.PROVIDER });
        const prov = await prisma.user.findFirst({ where: { email: `prov_${suffix}@e2e.com` } });
        await prisma.user.update({ where: { id: prov!.id }, data: { emailVerified: true } });
        providerId = prov!.id;

        await request(app.getHttpServer())
            .post('/auth/register')
            .send({ email: `run_${suffix}@e2e.com`, password: 'A1_StrongPassword!', name: 'Runner', role: Role.RUNNER });
        const runUsr = await prisma.user.findFirst({ where: { email: `run_${suffix}@e2e.com` } });
        await prisma.user.update({ where: { id: runUsr!.id }, data: { emailVerified: true } });

        // Login calls
        const cLogin = await request(app.getHttpServer()).post('/auth/login').send({ email: `client_${suffix}@e2e.com`, password: 'A1_StrongPassword!' });
        clientToken = cLogin.body.access_token;

        const pLogin = await request(app.getHttpServer()).post('/auth/login').send({ email: `prov_${suffix}@e2e.com`, password: 'A1_StrongPassword!' });
        providerToken = pLogin.body.access_token;

        const rLogin = await request(app.getHttpServer()).post('/auth/login').send({ email: `run_${suffix}@e2e.com`, password: 'A1_StrongPassword!' });
        runnerToken = rLogin.body.access_token;

        // Set pin for client
        await request(app.getHttpServer()).post('/users/pin').set('Authorization', `Bearer ${clientToken}`).send({ pin: '123456' });

        // Create city, category, product
        const city = await prisma.city.create({ data: { name: `City E2E ${suffix}`, slug: `city-e2e-${suffix}` } });
        const cat = await prisma.category.create({ data: { name: `Cat E2E ${suffix}`, slug: `cat-e2e-${suffix}` } });
        const prod = await prisma.product.create({
            data: { name: `Prod E2E ${suffix}`, price: 10.5, stock: 100, providerId, cityId: city.id, categoryId: cat.id }
        });

        cityId = city.id;
        productId = prod.id;
    });

    afterAll(async () => {
        await app.close();
    });

    it('1. POST /orders - Client creates an order', async () => {
        const res = await request(app.getHttpServer())
            .post('/orders')
            .set('Authorization', `Bearer ${clientToken}`)
            .send({
                pin: '123456',
                deliveryAddress: '123 E2E Street',
                items: [
                    { productId, quantity: 2 }
                ]
            });

        expect(res.status).toBe(201);
        expect(res.body.id).toBeDefined();
        expect(res.body.status).toBe(DeliveryStatus.PENDING);
        createdOrderId = res.body.id;

        // Simulate webhook confirmation because we bypass stripe
        await prisma.order.update({
            where: { id: createdOrderId },
            data: { status: DeliveryStatus.CONFIRMED }
        });
        const orderWithPO = await prisma.order.findUnique({ where: { id: createdOrderId }, include: { providerOrders: true } });
        providerOrderId = orderWithPO!.providerOrders[0].id;
    });

    it('2. GET /orders/:id - Provider can see the order', async () => {
        const res = await request(app.getHttpServer())
            .get(`/orders/${createdOrderId}`)
            .set('Authorization', `Bearer ${providerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(createdOrderId);
    });

    it('3. PATCH /orders/provider-order/:id/status - Provider accepts the order', async () => {
        const res = await request(app.getHttpServer())
            .patch(`/orders/provider-order/${providerOrderId}/status`)
            .set('Authorization', `Bearer ${providerToken}`)
            .send({ status: ProviderOrderStatus.ACCEPTED });

        expect(res.status).toBe(200);

        // Move through states
        await request(app.getHttpServer()).patch(`/orders/provider-order/${providerOrderId}/status`).set('Authorization', `Bearer ${providerToken}`).send({ status: ProviderOrderStatus.PREPARING });
        await request(app.getHttpServer()).patch(`/orders/provider-order/${providerOrderId}/status`).set('Authorization', `Bearer ${providerToken}`).send({ status: ProviderOrderStatus.READY_FOR_PICKUP });
    });

    it('4. PATCH /orders/:id/accept - Runner accepts the delivery', async () => {
        // We update manually because all POs are ready for pickup
        await prisma.order.update({ where: { id: createdOrderId }, data: { status: DeliveryStatus.READY_FOR_ASSIGNMENT } });

        const res = await request(app.getHttpServer())
            .patch(`/orders/${createdOrderId}/accept`)
            .set('Authorization', `Bearer ${runnerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe(DeliveryStatus.ASSIGNED);
    });

    it('5. PATCH /orders/:id/complete - Runner completes the delivery', async () => {
        // Provide Order picked up
        await request(app.getHttpServer()).patch(`/orders/provider-order/${providerOrderId}/status`).set('Authorization', `Bearer ${runnerToken}`).send({ status: ProviderOrderStatus.PICKED_UP });

        // Order in transit
        await request(app.getHttpServer()).patch(`/orders/${createdOrderId}/in-transit`).set('Authorization', `Bearer ${runnerToken}`);

        const res = await request(app.getHttpServer())
            .patch(`/orders/${createdOrderId}/complete`)
            .set('Authorization', `Bearer ${runnerToken}`);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe(DeliveryStatus.DELIVERED);
    });
});
