import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import {
  DeliveryOrderStatus,
  PaymentSessionStatus,
  ProviderPaymentStatus,
  Role,
  RunnerPaymentStatus,
} from '@prisma/client';
import { AdminService } from '../admin/admin.service';
import { AuthService } from '../auth/auth.service';
import { CartService } from '../cart/cart.service';
import { DeliveryService } from '../delivery/delivery.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { BaseSeedService } from '../seed/base-seed.service';
import {
  DemoOrderScenarioService,
  type DemoSeededProduct,
} from './demo-order-scenario.service';
import { DemoCleanupService } from './demo-cleanup.service';
import {
  DemoUserBootstrapService,
  type DemoUserSeed,
} from './demo-user-bootstrap.service';
import { DemoDatasetService } from './demo-dataset.service';
import { DemoCatalogService } from './demo-catalog.service';
import {
  DEMO_EMAIL_DOMAIN,
  DEMO_SHARED_PASSWORD,
  DEMO_USERS,
  type DemoDatasetStatus,
} from './demo.seed-data';

@Injectable()
export class DemoService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoService.name);
  private readonly demoOrderScenarioService: DemoOrderScenarioService;
  private readonly demoCleanupService: DemoCleanupService;
  private readonly demoUserBootstrapService: DemoUserBootstrapService;
  private readonly demoDatasetService: DemoDatasetService;
  private readonly demoCatalogService: DemoCatalogService;

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
  ) {
    this.demoUserBootstrapService = new DemoUserBootstrapService(
      this.configService,
      this.prisma,
      this.authService,
      this.adminService,
    );
    this.demoDatasetService = new DemoDatasetService(this.prisma);
    this.demoCatalogService = new DemoCatalogService(
      this.prisma,
      this.productsService,
      this.baseSeedService,
    );
    this.demoOrderScenarioService = new DemoOrderScenarioService(
      this.prisma,
      this.cartService,
      this.ordersService,
      this.deliveryService,
      this.paymentsService,
    );
    this.demoCleanupService = new DemoCleanupService(this.prisma);
  }

  async onApplicationBootstrap() {
    await this.baseSeedService.ensureBaseData();

    const demoMode = this.configService.get<string>('DEMO_MODE') === 'true';
    if (!demoMode) {
      return;
    }

    try {
      const status = await this.getDemoDatasetStatus();
      const admin = await this.ensureDemoAdmin();

      if (this.isDemoDatasetComplete(status)) {
        if (await this.areDemoCredentialsCurrent()) {
          return;
        }

        await this.cleanupDemoData(admin.id);
        await this.seedDemoData(admin.id);
        this.logger.log(`demo.autoseed.credentials_reset actor=${admin.id}`);
        return;
      }

      if (this.hasAnyDemoData(status)) {
        await this.cleanupDemoData(admin.id);
      }

      await this.seedDemoData(admin.id);

      this.logger.log(
        `demo.autoseed actor=${admin.id} users=${status.users} products=${status.products} orders=${status.orders} deliveries=${status.deliveries}`,
      );
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

  private assertDemoClientOrAdminAccess(
    ownerUserId: string,
    actorUserId: string,
    roles: Role[],
  ) {
    if (!roles.includes(Role.ADMIN) && ownerUserId !== actorUserId) {
      throw new ForbiddenException(
        'Demo payment actions are only available to the owning client or an admin',
      );
    }
  }

  private async ensureDemoAdmin() {
    const adminSeed = DEMO_USERS.find((user) => user.kind === 'ADMIN')!;
    const existingAdmin = await this.prisma.user.findUnique({
      where: { email: adminSeed.email },
      select: { id: true },
    });

    if (existingAdmin) {
      return existingAdmin;
    }

    return this.registerAndVerifyUser(adminSeed);
  }

  private async getDemoDatasetStatus(): Promise<DemoDatasetStatus> {
    return this.demoDatasetService.getDemoDatasetStatus();
  }

  private hasAnyDemoData(status: DemoDatasetStatus) {
    return this.demoDatasetService.hasAnyDemoData(status);
  }

  private isDemoDatasetComplete(status: DemoDatasetStatus) {
    return this.demoDatasetService.isDemoDatasetComplete(status, DEMO_USERS);
  }

  private async seedDemoData(adminActorId: string) {
    const adminSeed = DEMO_USERS.find((user) => user.kind === 'ADMIN')!;
    const existingAdmin = await this.prisma.user.findUnique({
      where: { email: adminSeed.email },
      select: { id: true },
    });

    if (!existingAdmin) {
      await this.registerAndVerifyUser(adminSeed);
    }

    for (const seed of DEMO_USERS.filter((user) => user.kind !== 'ADMIN')) {
      await this.registerAndVerifyUser(seed);
    }

    await this.applyRoleShape(adminActorId);
    await this.bootstrapDemoPaymentAccounts();

    const { products } = await this.createDemoCatalog();
    const orders = await this.createDemoOrders(products);

    this.logger.log(
      `demo.seed actor=${adminActorId} users=${DEMO_USERS.length} products=${products.length} orders=${orders.length}`,
    );

    return {
      status: 'ok',
      usersCreated: DEMO_USERS.length,
      productsCreated: products.length,
      ordersCreated: orders.length,
    };
  }

  private async findUserByEmail(email: string) {
    return this.demoUserBootstrapService.findUserByEmail(email);
  }

  private getDemoPassword() {
    return this.demoUserBootstrapService.getDemoPassword();
  }

  private async areDemoCredentialsCurrent() {
    const demoUsers = await this.prisma.user.findMany({
      where: {
        email: {
          in: DEMO_USERS.map((user) => user.email),
        },
      },
      select: {
        email: true,
        password: true,
        emailVerified: true,
      },
    });

    if (demoUsers.length !== DEMO_USERS.length) {
      return false;
    }

    for (const user of demoUsers) {
      if (!user.emailVerified) {
        return false;
      }

      const passwordMatches = await argon2.verify(
        user.password,
        DEMO_SHARED_PASSWORD,
      );
      if (!passwordMatches) {
        return false;
      }
    }

    return true;
  }

  private async registerAndVerifyUser(seed: DemoUserSeed) {
    return this.demoUserBootstrapService.registerAndVerifyUser(seed);
  }

  private async applyRoleShape(adminId: string) {
    return this.demoUserBootstrapService.applyRoleShape(adminId);
  }

  private async bootstrapDemoPaymentAccounts() {
    return this.demoUserBootstrapService.bootstrapDemoPaymentAccounts();
  }

  private async createDemoCatalog() {
    return this.demoCatalogService.createDemoCatalog(
      this.findUserByEmail.bind(this),
    );
  }

  private async createDemoOrders(products: DemoSeededProduct[]) {
    return this.demoOrderScenarioService.createDemoOrders(products);
  }

  private async cleanupDemoData(adminActorId: string) {
    return this.demoCleanupService.cleanupDemoData(
      adminActorId,
      DEMO_EMAIL_DOMAIN,
    );
  }

  async seed(adminActorId: string) {
    this.assertDemoEnabled();
    await this.baseSeedService.ensureBaseData();
    if (this.hasAnyDemoData(await this.getDemoDatasetStatus())) {
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

  async confirmDemoProviderOrderPayment(
    providerOrderId: string,
    actorUserId: string,
    roles: Role[],
  ) {
    this.assertDemoEnabled();

    const providerOrder = await this.prisma.providerOrder.findUnique({
      where: { id: providerOrderId },
      include: {
        order: {
          select: {
            id: true,
            clientId: true,
          },
        },
      },
    });

    if (!providerOrder) {
      throw new NotFoundException('ProviderOrder not found');
    }

    this.assertDemoClientOrAdminAccess(
      providerOrder.order.clientId,
      actorUserId,
      roles,
    );

    if (providerOrder.paymentStatus === ProviderPaymentStatus.PAID) {
      return {
        providerOrderId,
        orderId: providerOrder.order.id,
        paymentStatus: ProviderPaymentStatus.PAID,
        mode: 'demo_provider_already_paid',
      };
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

    const result = await this.paymentsService.confirmProviderOrderPayment(
      externalSessionId,
      `demo_evt_${providerOrder.id.replace(/-/g, '')}`,
      'payment_intent.succeeded',
      {
        amount: Math.round(Number(providerOrder.subtotalAmount) * 100),
        amountReceived: Math.round(Number(providerOrder.subtotalAmount) * 100),
        currency: 'eur',
        accountId: provider.stripeAccountId,
        metadata: {
          orderId: providerOrder.order.id,
          providerOrderId: providerOrder.id,
          providerPaymentSessionId: session.id,
        },
      },
    );

    return {
      providerOrderId,
      orderId: providerOrder.order.id,
      paymentStatus: ProviderPaymentStatus.PAID,
      mode: 'demo_provider_confirmed',
      result,
    };
  }

  async confirmDemoRunnerPayment(
    deliveryOrderId: string,
    actorUserId: string,
    roles: Role[],
  ) {
    this.assertDemoEnabled();

    const deliveryOrder = await this.prisma.deliveryOrder.findUnique({
      where: { id: deliveryOrderId },
      include: {
        order: {
          select: {
            id: true,
            clientId: true,
          },
        },
        paymentSessions: {
          where: {
            status: {
              in: [PaymentSessionStatus.CREATED, PaymentSessionStatus.READY],
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!deliveryOrder) {
      throw new NotFoundException('DeliveryOrder not found');
    }

    this.assertDemoClientOrAdminAccess(
      deliveryOrder.order.clientId,
      actorUserId,
      roles,
    );

    if (!deliveryOrder.runnerId) {
      throw new ConflictException(
        'DeliveryOrder does not have an assigned runner',
      );
    }

    const eligibleStatuses: DeliveryOrderStatus[] = [
      DeliveryOrderStatus.RUNNER_ASSIGNED,
      DeliveryOrderStatus.PICKUP_PENDING,
      DeliveryOrderStatus.PICKED_UP,
      DeliveryOrderStatus.IN_TRANSIT,
    ];
    if (!eligibleStatuses.includes(deliveryOrder.status)) {
      throw new ConflictException(
        'DeliveryOrder is not eligible for demo payment confirmation',
      );
    }

    if (deliveryOrder.paymentStatus === RunnerPaymentStatus.PAID) {
      return {
        deliveryOrderId,
        orderId: deliveryOrder.order.id,
        paymentStatus: RunnerPaymentStatus.PAID,
        mode: 'demo_runner_already_paid',
      };
    }

    const runner = await this.prisma.user.findUnique({
      where: { id: deliveryOrder.runnerId },
      select: {
        stripeAccountId: true,
      },
    });

    if (!runner?.stripeAccountId) {
      throw new ConflictException(
        'Demo runner is missing a connected account bootstrap value',
      );
    }

    const externalSessionId =
      deliveryOrder.paymentSessions[0]?.externalSessionId ||
      `demo_runner_pi_${deliveryOrder.id.replace(/-/g, '').slice(0, 24)}`;

    const session =
      deliveryOrder.paymentSessions[0] ||
      (await this.prisma.runnerPaymentSession.create({
        data: {
          deliveryOrderId: deliveryOrder.id,
          paymentProvider: 'STRIPE',
          externalSessionId,
          paymentUrl: null,
          status: PaymentSessionStatus.READY,
          expiresAt: null,
          providerMetadata: {
            stripeAccountId: runner.stripeAccountId,
            paymentIntentId: externalSessionId,
            livemode: false,
          },
        },
      }));

    if (!deliveryOrder.paymentSessions[0]) {
      await this.prisma.deliveryOrder.update({
        where: { id: deliveryOrder.id },
        data: {
          paymentStatus: RunnerPaymentStatus.PAYMENT_READY,
        },
      });
    } else if (!deliveryOrder.paymentSessions[0]?.externalSessionId) {
      await this.prisma.runnerPaymentSession.update({
        where: { id: session.id },
        data: {
          externalSessionId,
        },
      });
    }

    const result = await this.deliveryService.confirmRunnerPayment(
      externalSessionId,
      `demo_runner_evt_${deliveryOrder.id.replace(/-/g, '')}`,
    );

    return {
      deliveryOrderId,
      orderId: deliveryOrder.order.id,
      paymentStatus: RunnerPaymentStatus.PAID,
      mode: 'demo_runner_confirmed',
      result,
    };
  }
}
