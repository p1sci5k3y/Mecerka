import {
  ForbiddenException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
}
