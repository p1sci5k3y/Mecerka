import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { AdminService } from '../admin/admin.service';
import { AuthService } from '../auth/auth.service';
import { CartService } from '../cart/cart.service';
import { DeliveryService } from '../delivery/delivery.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { BaseSeedService } from '../seed/base-seed.service';

type DemoUserSeed = {
  email: string;
  name: string;
  kind: 'ADMIN' | 'PROVIDER' | 'RUNNER' | 'USER';
};

type DemoProductSeed = {
  name: string;
  price: number;
  stock: number;
  providerEmail: string;
  categorySlug: string;
  imageFilename: string;
  description: string;
};

@Injectable()
export class DemoService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoService.name);
  private static readonly DEMO_EMAIL_DOMAIN = '@local.test';
  private static readonly DEMO_CITY = {
    name: 'Toledo',
    slug: 'toledo',
  };
  private static readonly DEMO_CATEGORIES = [
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
  ] as const;
  private static readonly DEMO_USERS: DemoUserSeed[] = [
    {
      email: 'admin.demo@local.test',
      name: 'Admin Demo',
      kind: 'ADMIN',
    },
    {
      email: 'provider.demo@local.test',
      name: 'Panadería San Isidro',
      kind: 'PROVIDER',
    },
    {
      email: 'provider2.demo@local.test',
      name: 'Verduras del Tajo',
      kind: 'PROVIDER',
    },
    {
      email: 'runner.demo@local.test',
      name: 'Runner Demo 1',
      kind: 'RUNNER',
    },
    {
      email: 'runner2.demo@local.test',
      name: 'Runner Demo 2',
      kind: 'RUNNER',
    },
    {
      email: 'user.demo@local.test',
      name: 'Usuario Demo 1',
      kind: 'USER',
    },
    {
      email: 'user2.demo@local.test',
      name: 'Usuario Demo 2',
      kind: 'USER',
    },
  ];
  private static readonly DEMO_PRODUCTS: DemoProductSeed[] = [
    {
      name: 'Pan artesano',
      price: 2.5,
      stock: 30,
      providerEmail: 'provider.demo@local.test',
      categorySlug: 'panaderia',
      imageFilename: 'bread.jpg',
      description: 'Hogaza artesanal para pedidos de demo.',
    },
    {
      name: 'Empanada gallega',
      price: 6.9,
      stock: 20,
      providerEmail: 'provider.demo@local.test',
      categorySlug: 'panaderia',
      imageFilename: 'empanada.jpg',
      description: 'Empanada lista para probar el flujo de compra.',
    },
    {
      name: 'Tomates ecológicos',
      price: 3.2,
      stock: 40,
      providerEmail: 'provider2.demo@local.test',
      categorySlug: 'verduras',
      imageFilename: 'tomatoes.jpg',
      description: 'Tomates frescos para pedidos de demo.',
    },
    {
      name: 'Huevos camperos',
      price: 4.4,
      stock: 25,
      providerEmail: 'provider2.demo@local.test',
      categorySlug: 'despensa',
      imageFilename: 'eggs.jpg',
      description: 'Docena de huevos camperos de muestra.',
    },
    {
      name: 'Queso manchego',
      price: 8.75,
      stock: 18,
      providerEmail: 'provider2.demo@local.test',
      categorySlug: 'despensa',
      imageFilename: 'cheese.jpg',
      description: 'Queso manchego curado para la demo.',
    },
    {
      name: 'Aceite de oliva',
      price: 9.5,
      stock: 22,
      providerEmail: 'provider2.demo@local.test',
      categorySlug: 'despensa',
      imageFilename: 'olive-oil.jpg',
      description: 'Aceite de oliva virgen extra para pedidos demo.',
    },
  ];

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly adminService: AdminService,
    private readonly productsService: ProductsService,
    private readonly ordersService: OrdersService,
    private readonly deliveryService: DeliveryService,
    private readonly cartService: CartService,
    private readonly paymentsService: PaymentsService,
    private readonly baseSeedService: BaseSeedService,
  ) {}

  async onApplicationBootstrap() {
    await this.baseSeedService.ensureBaseData();

    const demoMode = this.configService.get<string>('DEMO_MODE') === 'true';
    if (!demoMode) {
      return;
    }

    try {
      if (await this.hasExistingDemoData()) {
        return;
      }

      const admin = await this.registerAndVerifyUser(
        DemoService.DEMO_USERS.find((user) => user.kind === 'ADMIN')!,
      );

      await this.seedDemoData(admin.id);

      this.logger.log(`demo.autoseed actor=${admin.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'unknown demo auto-seed error';
      this.logger.warn(`demo.autoseed_failed reason=${message}`);
    }
  }

  private assertDemoEnabled() {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    const demoMode = this.configService.get<string>('DEMO_MODE') === 'true';

    if (isProduction && !demoMode) {
      throw new ForbiddenException(
        'Demo endpoints are disabled in production unless DEMO_MODE=true',
      );
    }
  }

  private async hasExistingDemoData() {
    const user = await this.prisma.user.findFirst({
      where: {
        email: { endsWith: DemoService.DEMO_EMAIL_DOMAIN },
      },
      select: { id: true },
    });

    return Boolean(user);
  }

  private async seedDemoData(adminActorId: string) {
    const adminSeed = DemoService.DEMO_USERS.find(
      (user) => user.kind === 'ADMIN',
    )!;
    const existingAdmin = await this.prisma.user.findUnique({
      where: { email: adminSeed.email },
      select: { id: true },
    });

    if (!existingAdmin) {
      await this.registerAndVerifyUser(adminSeed);
    }

    for (const seed of DemoService.DEMO_USERS.filter(
      (user) => user.kind !== 'ADMIN',
    )) {
      await this.registerAndVerifyUser(seed);
    }

    await this.applyRoleShape(adminActorId);
    await this.bootstrapDemoPaymentAccounts();

    const { products } = await this.createDemoCatalog();
    const orders = await this.createDemoOrders(products);

    this.logger.log(
      `demo.seed actor=${adminActorId} users=${DemoService.DEMO_USERS.length} products=${products.length} orders=${orders.length}`,
    );

    return {
      status: 'ok',
      usersCreated: DemoService.DEMO_USERS.length,
      productsCreated: products.length,
      ordersCreated: orders.length,
    };
  }

  private async findUserByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        roles: true,
        verificationToken: true,
        stripeAccountId: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`Demo user ${email} was not created`);
    }

    return user;
  }

  private getDemoPassword() {
    const configuredPassword = this.configService
      .get<string>('DEMO_PASSWORD')
      ?.trim();

    if (configuredPassword) {
      return configuredPassword;
    }

    throw new ConflictException(
      'DEMO_PASSWORD must be set when DEMO_MODE is enabled',
    );
  }

  private async registerAndVerifyUser(seed: DemoUserSeed) {
    await this.authService.register({
      email: seed.email,
      password: this.getDemoPassword(),
      name: seed.name,
    });

    const created = await this.findUserByEmail(seed.email);
    if (created.verificationToken) {
      await this.authService.verifyEmail(created.verificationToken);
    }

    return this.findUserByEmail(seed.email);
  }

  private async applyRoleShape(adminId: string) {
    const admin = await this.findUserByEmail('admin.demo@local.test');
    await this.adminService.grantRole(admin.id, Role.ADMIN, adminId);
    await this.adminService.revokeRole(admin.id, Role.CLIENT, adminId);

    for (const email of [
      'provider.demo@local.test',
      'provider2.demo@local.test',
    ]) {
      const provider = await this.findUserByEmail(email);
      await this.adminService.grantProvider(provider.id, adminId);
      await this.adminService.revokeRole(provider.id, Role.CLIENT, adminId);
    }

    for (const email of ['runner.demo@local.test', 'runner2.demo@local.test']) {
      const runner = await this.findUserByEmail(email);
      await this.adminService.grantRunner(runner.id, adminId);
      await this.adminService.revokeRole(runner.id, Role.CLIENT, adminId);
    }
  }

  private async bootstrapDemoPaymentAccounts() {
    const accountIds = new Map<string, string>([
      ['provider.demo@local.test', 'acct_demo_provider_1'],
      ['provider2.demo@local.test', 'acct_demo_provider_2'],
      ['runner.demo@local.test', 'acct_demo_runner_1'],
      ['runner2.demo@local.test', 'acct_demo_runner_2'],
    ]);

    for (const [email, accountId] of accountIds.entries()) {
      const user = await this.findUserByEmail(email);
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          stripeAccountId: accountId,
        },
      });
    }
  }

  private async createDemoCatalog() {
    await this.baseSeedService.ensureBaseData();

    const city = await this.prisma.city.findUnique({
      where: { slug: DemoService.DEMO_CITY.slug },
      select: { id: true, name: true, slug: true },
    });

    if (!city) {
      throw new ConflictException('Base city not found for demo seed');
    }

    const categories = new Map<string, string>();
    const seededCategories = await this.prisma.category.findMany({
      where: {
        slug: {
          in: DemoService.DEMO_CATEGORIES.map((category) => category.slug),
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
      const user = await this.findUserByEmail(email);
      usersByEmail.set(email, user.id);
    }

    const products = [];
    for (const product of DemoService.DEMO_PRODUCTS) {
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

  private async createCheckoutOrder(
    clientId: string,
    items: Array<{ productId: string; quantity: number }>,
    idempotencyKey: string,
  ) {
    for (const item of items) {
      await this.cartService.addItem(clientId, item);
    }

    return this.ordersService.checkoutFromCart(clientId, idempotencyKey);
  }

  private async confirmDemoProviderOrderPayment(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        providerOrders: true,
      },
    });

    if (!order || order.providerOrders.length !== 1) {
      throw new ConflictException(
        'Demo payment confirmation requires a single-provider order',
      );
    }

    const providerOrder = order.providerOrders[0];
    if (!providerOrder) {
      throw new NotFoundException('ProviderOrder not found');
    }

    const session = await this.ordersService.prepareProviderOrderPayment(
      providerOrder.id,
    );
    const externalSessionId = `demo_pi_${providerOrder.id.replace(/-/g, '').slice(0, 24)}`;

    await this.prisma.providerPaymentSession.update({
      where: { id: session.id },
      data: {
        externalSessionId,
      },
    });

    await this.prisma.providerOrder.update({
      where: { id: providerOrder.id },
      data: {
        paymentRef: externalSessionId,
      },
    });

    const provider = await this.prisma.user.findUnique({
      where: { id: providerOrder.providerId },
      select: {
        stripeAccountId: true,
      },
    });

    if (!provider?.stripeAccountId) {
      throw new ConflictException(
        'Demo provider is missing a connected account bootstrap value',
      );
    }

    return this.paymentsService.confirmProviderOrderPayment(
      externalSessionId,
      `demo_evt_${providerOrder.id.replace(/-/g, '')}`,
      'payment_intent.succeeded',
      {
        amount: Math.round(Number(providerOrder.subtotalAmount) * 100),
        amountReceived: Math.round(Number(providerOrder.subtotalAmount) * 100),
        currency: 'eur',
        accountId: provider.stripeAccountId,
        metadata: {
          orderId,
          providerOrderId: providerOrder.id,
          providerPaymentSessionId: session.id,
        },
      },
    );
  }

  private async createDemoOrders(products: any[]) {
    const productsByName = new Map<string, any>(
      products.map((product) => [product.name, product]),
    );
    const user1 = await this.findUserByEmail('user.demo@local.test');
    const user2 = await this.findUserByEmail('user2.demo@local.test');
    const runner1 = await this.findUserByEmail('runner.demo@local.test');
    const runner2 = await this.findUserByEmail('runner2.demo@local.test');

    const pendingOrder = await this.createCheckoutOrder(
      user1.id,
      [
        {
          productId: productsByName.get('Pan artesano').id,
          quantity: 2,
        },
        {
          productId: productsByName.get('Empanada gallega').id,
          quantity: 1,
        },
      ],
      'demo-pending-order',
    );

    const deliveringOrder = await this.createCheckoutOrder(
      user1.id,
      [
        {
          productId: productsByName.get('Tomates ecológicos').id,
          quantity: 3,
        },
        {
          productId: productsByName.get('Huevos camperos').id,
          quantity: 1,
        },
      ],
      'demo-delivering-order',
    );
    await this.confirmDemoProviderOrderPayment(deliveringOrder.id);
    const deliveringDelivery = await this.deliveryService.createDeliveryOrder(
      {
        orderId: deliveringOrder.id,
        deliveryFee: 4.5,
        currency: 'EUR',
      },
      user1.id,
      [Role.CLIENT],
    );
    await this.deliveryService.assignRunner(
      deliveringDelivery.id,
      { runnerId: runner1.id },
      user1.id,
      [Role.CLIENT],
    );
    await this.deliveryService.markPickupPending(
      deliveringDelivery.id,
      runner1.id,
      [Role.RUNNER],
    );
    await this.deliveryService.confirmPickup(
      deliveringDelivery.id,
      runner1.id,
      [Role.RUNNER],
    );
    await this.deliveryService.startTransit(deliveringDelivery.id, runner1.id, [
      Role.RUNNER,
    ]);
    await this.deliveryService.updateRunnerLocation(
      deliveringDelivery.id,
      runner1.id,
      [Role.RUNNER],
      {
        latitude: 40.417,
        longitude: -3.703,
      },
    );

    const deliveredOrder = await this.createCheckoutOrder(
      user2.id,
      [
        {
          productId: productsByName.get('Queso manchego').id,
          quantity: 1,
        },
        {
          productId: productsByName.get('Aceite de oliva').id,
          quantity: 1,
        },
      ],
      'demo-delivered-order',
    );
    await this.confirmDemoProviderOrderPayment(deliveredOrder.id);
    const deliveredDelivery = await this.deliveryService.createDeliveryOrder(
      {
        orderId: deliveredOrder.id,
        deliveryFee: 4.9,
        currency: 'EUR',
      },
      user2.id,
      [Role.CLIENT],
    );
    await this.deliveryService.assignRunner(
      deliveredDelivery.id,
      { runnerId: runner2.id },
      user2.id,
      [Role.CLIENT],
    );
    await this.deliveryService.markPickupPending(
      deliveredDelivery.id,
      runner2.id,
      [Role.RUNNER],
    );
    await this.deliveryService.confirmPickup(deliveredDelivery.id, runner2.id, [
      Role.RUNNER,
    ]);
    await this.deliveryService.startTransit(deliveredDelivery.id, runner2.id, [
      Role.RUNNER,
    ]);
    await this.deliveryService.updateRunnerLocation(
      deliveredDelivery.id,
      runner2.id,
      [Role.RUNNER],
      {
        latitude: 40.418,
        longitude: -3.702,
      },
    );
    await this.deliveryService.confirmDelivery(
      deliveredDelivery.id,
      runner2.id,
      [Role.RUNNER],
      {
        deliveryNotes: 'Entrega demo completada',
      },
    );

    return [pendingOrder, deliveringOrder, deliveredOrder];
  }

  private async cleanupDemoData(adminActorId: string) {
    const demoUsers = await this.prisma.user.findMany({
      where: {
        email: { endsWith: DemoService.DEMO_EMAIL_DOMAIN },
      },
      select: {
        id: true,
        email: true,
        roles: true,
      },
    });

    const userIds = demoUsers.map((user) => user.id);
    const providerIds = demoUsers
      .filter((user) => user.roles.includes(Role.PROVIDER))
      .map((user) => user.id);
    const runnerIds = demoUsers
      .filter((user) => user.roles.includes(Role.RUNNER))
      .map((user) => user.id);

    const orders = await this.prisma.order.findMany({
      where: {
        clientId: {
          in: userIds,
        },
      },
      select: {
        id: true,
      },
    });
    const orderIds = orders.map((order) => order.id);

    const providerOrders = orderIds.length
      ? await this.prisma.providerOrder.findMany({
          where: {
            orderId: {
              in: orderIds,
            },
          },
          select: {
            id: true,
          },
        })
      : [];
    const providerOrderIds = providerOrders.map(
      (providerOrder) => providerOrder.id,
    );

    const deliveryOrders = orderIds.length
      ? await this.prisma.deliveryOrder.findMany({
          where: {
            orderId: {
              in: orderIds,
            },
          },
          select: {
            id: true,
          },
        })
      : [];
    const deliveryOrderIds = deliveryOrders.map(
      (deliveryOrder) => deliveryOrder.id,
    );

    const deliveryJobs = deliveryOrderIds.length
      ? await this.prisma.deliveryJob.findMany({
          where: {
            deliveryOrderId: {
              in: deliveryOrderIds,
            },
          },
          select: {
            id: true,
          },
        })
      : [];
    const deliveryJobIds = deliveryJobs.map((job) => job.id);

    const products = providerIds.length
      ? await this.prisma.product.findMany({
          where: {
            providerId: {
              in: providerIds,
            },
          },
          select: {
            id: true,
          },
        })
      : [];
    const productIds = products.map((product) => product.id);

    await this.prisma.$transaction(async (tx) => {
      if (deliveryJobIds.length > 0) {
        await tx.deliveryJobClaim.deleteMany({
          where: {
            jobId: {
              in: deliveryJobIds,
            },
          },
        });
      }

      if (deliveryOrderIds.length > 0) {
        await tx.deliveryIncident.deleteMany({
          where: {
            deliveryOrderId: {
              in: deliveryOrderIds,
            },
          },
        });
        await tx.runnerPaymentSession.deleteMany({
          where: {
            deliveryOrderId: {
              in: deliveryOrderIds,
            },
          },
        });
        await tx.refundRequest.deleteMany({
          where: {
            deliveryOrderId: {
              in: deliveryOrderIds,
            },
          },
        });
        await tx.deliveryJob.deleteMany({
          where: {
            deliveryOrderId: {
              in: deliveryOrderIds,
            },
          },
        });
        await tx.runnerLocation.deleteMany({
          where: {
            runnerId: {
              in: runnerIds,
            },
          },
        });
        await tx.deliveryOrder.deleteMany({
          where: {
            id: {
              in: deliveryOrderIds,
            },
          },
        });
      }

      if (providerOrderIds.length > 0) {
        await tx.providerPaymentSession.deleteMany({
          where: {
            providerOrderId: {
              in: providerOrderIds,
            },
          },
        });
        await tx.stockReservation.deleteMany({
          where: {
            providerOrderId: {
              in: providerOrderIds,
            },
          },
        });
        await tx.refundRequest.deleteMany({
          where: {
            providerOrderId: {
              in: providerOrderIds,
            },
          },
        });
        await tx.orderItem.deleteMany({
          where: {
            providerOrderId: {
              in: providerOrderIds,
            },
          },
        });
        await tx.providerOrder.deleteMany({
          where: {
            id: {
              in: providerOrderIds,
            },
          },
        });
      }

      if (orderIds.length > 0) {
        await tx.orderSummaryDocument.deleteMany({
          where: {
            orderId: {
              in: orderIds,
            },
          },
        });
        await tx.order.deleteMany({
          where: {
            id: {
              in: orderIds,
            },
          },
        });
      }

      if (userIds.length > 0) {
        await tx.cartItem.deleteMany({
          where: {
            cartProvider: {
              cartGroup: {
                clientId: {
                  in: userIds,
                },
              },
            },
          },
        });
        await tx.cartProvider.deleteMany({
          where: {
            cartGroup: {
              clientId: {
                in: userIds,
              },
            },
          },
        });
        await tx.cartGroup.deleteMany({
          where: {
            clientId: {
              in: userIds,
            },
          },
        });
      }

      if (providerIds.length > 0) {
        await tx.productImportJob.deleteMany({
          where: {
            providerId: {
              in: providerIds,
            },
          },
        });
      }

      if (productIds.length > 0) {
        await tx.product.deleteMany({
          where: {
            id: {
              in: productIds,
            },
          },
        });
      }

      if (userIds.length > 0) {
        await tx.paymentAccount.deleteMany({
          where: {
            ownerId: {
              in: [...providerIds, ...runnerIds],
            },
          },
        });
        await tx.runnerProfile.deleteMany({
          where: {
            userId: {
              in: runnerIds,
            },
          },
        });
        await tx.riskEvent.deleteMany({
          where: {
            actorId: {
              in: [...userIds, ...orderIds, ...deliveryOrderIds],
            },
          },
        });
        await tx.riskScoreSnapshot.deleteMany({
          where: {
            actorId: {
              in: [...userIds, ...orderIds, ...deliveryOrderIds],
            },
          },
        });
        await tx.user.deleteMany({
          where: {
            id: {
              in: userIds,
            },
          },
        });
      }

      await tx.paymentWebhookEvent.deleteMany({
        where: {
          id: {
            startsWith: 'demo_evt_',
          },
        },
      });

      await tx.runnerWebhookEvent.deleteMany({
        where: {
          id: {
            startsWith: 'demo_evt_',
          },
        },
      });
    });

    this.logger.log(`demo.reset actor=${adminActorId} users=${userIds.length}`);

    return {
      status: 'ok',
      usersDeleted: userIds.length,
      productsDeleted: productIds.length,
      ordersDeleted: orderIds.length,
    };
  }

  async seed(adminActorId: string) {
    this.assertDemoEnabled();
    await this.baseSeedService.ensureBaseData();
    if (await this.hasExistingDemoData()) {
      await this.cleanupDemoData(adminActorId);
    }

    return this.seedDemoData(adminActorId);
  }

  async reset(adminActorId: string) {
    this.assertDemoEnabled();
    await this.baseSeedService.ensureBaseData();
    await this.cleanupDemoData(adminActorId);
    await this.seedDemoData(adminActorId);

    return {
      status: 'reset_complete',
    };
  }
}
