import {
  Injectable,
  Inject,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IPaymentAccountRepository } from './repositories/payment-account.repository.interface';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DeliveryOrderStatus,
  DeliveryStatus,
  PaymentAccountOwnerType,
  PaymentAccountProvider,
  PaymentSessionStatus,
  ProviderOrderStatus,
  ProviderPaymentStatus,
  Prisma,
  Role,
  RunnerPaymentStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import * as argon2 from 'argon2';
import {
  StripeWebhookService,
  PaymentConfirmationPayload,
} from './stripe-webhook.service';
import { PaymentSummaryBuilder } from './payment-summary.builder';
import { ProviderPaymentPreparationService } from './provider-payment-preparation.service';
import { PaymentAccountOnboardingService } from './payment-account-onboarding.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { LegacyCashPaymentService } from './legacy-cash-payment.service';
import { ProviderPaymentAggregateService } from './provider-payment-aggregate.service';
import { ProviderPaymentIntentActivationService } from './provider-payment-intent-activation.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly summaryBuilder = new PaymentSummaryBuilder();

  private readonly stripe: Stripe;
  private readonly providerPaymentAggregateService: ProviderPaymentAggregateService;
  private readonly providerPaymentIntentActivationService: ProviderPaymentIntentActivationService;
  private readonly providerPaymentPreparationService: ProviderPaymentPreparationService;
  private readonly paymentAccountOnboardingService: PaymentAccountOnboardingService;
  private readonly paymentReconciliationService: PaymentReconciliationService;
  private readonly legacyCashPaymentService: LegacyCashPaymentService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    private readonly stripeWebhookService: StripeWebhookService,
    @Inject(IPaymentAccountRepository)
    private readonly paymentAccountRepository: IPaymentAccountRepository,
  ) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new Error(
        'STRIPE_SECRET_KEY is missing or empty in the environment configuration.',
      );
    }

    this.stripe = new Stripe(stripeSecretKey, {
      // TODO: Update when Stripe publishes a stable GA SDK — stripe@20.x only
      // supports '2026-02-25.clover'; changing this causes a TS compilation error.
      apiVersion: '2026-02-25.clover',
    });

    this.providerPaymentAggregateService = new ProviderPaymentAggregateService(
      this.prisma,
      this.configService,
      this.summaryBuilder,
      'Este entorno demo no puede preparar pagos Stripe reales por comercio. El pedido y sus subpedidos siguen siendo válidos, pero el cobro requiere credenciales Stripe operativas.',
    );
    this.providerPaymentIntentActivationService =
      new ProviderPaymentIntentActivationService(
        this.prisma,
        this.stripe,
        this.logger,
      );
    this.providerPaymentPreparationService =
      new ProviderPaymentPreparationService(
        this.prisma,
        this.configService,
        this.stripe,
        this.logger,
        this.summaryBuilder,
        this.resolveActiveStripePaymentAccountWithinClient.bind(this),
        this.providerPaymentAggregateService,
        this.providerPaymentIntentActivationService,
      );
    this.paymentAccountOnboardingService = new PaymentAccountOnboardingService(
      this.prisma,
      this.configService,
      this.stripe,
      this.paymentAccountRepository,
    );
    this.paymentReconciliationService = new PaymentReconciliationService(
      this.prisma,
    );
    this.legacyCashPaymentService = new LegacyCashPaymentService(
      this.prisma,
      this.configService,
      this.eventEmitter,
    );
  }

  async isProcessed(eventId: string): Promise<boolean> {
    return this.stripeWebhookService.isProcessed(eventId);
  }

  async upsertPaymentAccount(
    ownerType: PaymentAccountOwnerType,
    ownerId: string,
    provider: PaymentAccountProvider,
    externalAccountId: string,
  ) {
    return this.paymentAccountRepository.upsert(
      ownerType,
      ownerId,
      provider,
      externalAccountId,
    );
  }

  async getActivePaymentAccount(
    ownerType: PaymentAccountOwnerType,
    ownerId: string,
    provider: PaymentAccountProvider,
  ) {
    return this.paymentAccountRepository.findActive(
      ownerType,
      ownerId,
      provider,
    );
  }

  private async resolveActiveStripePaymentAccountWithinClient(
    client: Pick<Prisma.TransactionClient, 'paymentAccount' | 'user'>,
    ownerType: PaymentAccountOwnerType,
    ownerId: string,
  ) {
    const existing = await client.paymentAccount.findFirst({
      where: {
        ownerType,
        ownerId,
        provider: PaymentAccountProvider.STRIPE,
        isActive: true,
      },
    });

    if (existing) {
      return existing;
    }

    const user = await client.user.findUnique({
      where: { id: ownerId },
      select: {
        stripeAccountId: true,
      },
    });

    if (!user?.stripeAccountId) {
      return null;
    }

    return this.upsertPaymentAccount(
      ownerType,
      ownerId,
      PaymentAccountProvider.STRIPE,
      user.stripeAccountId,
    );
  }

  async prepareProviderOrderPayment(providerOrderId: string, clientId: string) {
    return this.providerPaymentPreparationService.prepareProviderOrderPayment(
      providerOrderId,
      clientId,
    );
  }

  async prepareOrderProviderPayments(orderId: string, clientId: string) {
    return this.providerPaymentAggregateService.prepareOrderProviderPayments(
      orderId,
      clientId,
      this.prepareProviderOrderPayment.bind(this),
    );
  }
  /**
   * Generates a Stripe Onboarding Link for Providers/Runners.
   * If the user doesn't have a stripeAccountId, it creates an Express account first.
   */
  async generateOnboardingLink(userId: string): Promise<string> {
    return this.paymentAccountOnboardingService.generateOnboardingLink(userId);
  }

  /**
   * Verifies if the Stripe Account is fully setup and active after OAuth callback.
   */
  async verifyAndSaveConnectedAccount(
    userId: string,
    accountId: string,
  ): Promise<boolean> {
    return this.paymentAccountOnboardingService.verifyAndSaveConnectedAccount(
      userId,
      accountId,
    );
  }

  /**
   * Prepares a provider-owned Stripe Payment Intent using a connected account.
   * The charge is created directly on the Provider's Stripe Account.
   * The platform does not split, hold, transfer, or settle funds internally.
   */
  async createTripartitePaymentIntent(orderId: string, clientId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, clientId },
      include: { providerOrders: true },
    });

    if (!order || order.status !== DeliveryStatus.PENDING) {
      throw new NotFoundException('Order not found or not in PENDING state');
    }

    if (order.providerOrders.length !== 1) {
      throw new ConflictException(
        'El flujo de pago actual solo admite pedidos de un único proveedor.',
      );
    }

    const po = order.providerOrders[0];
    if (!po) throw new ConflictException('Order has no provider items');

    return this.prepareProviderOrderPayment(po.id, clientId);
  }

  /**
   * Legacy offline cash flow.
   * This path is disabled by default because it does not follow the provider
   * payment-session boundary used by the marketplace payment model.
   */
  async processCashPayment(orderId: string, clientId: string, pin: string) {
    return this.legacyCashPaymentService.processCashPayment(
      orderId,
      clientId,
      pin,
    );
  }

  /**
   * Completes the payment process idempotently using a webhook event ID.
   * Handles partial fulfillment if stock runs out concurrently.
   */
  async confirmProviderOrderPayment(
    externalSessionId: string,
    eventId: string,
    eventType: string,
    confirmation?: PaymentConfirmationPayload,
  ) {
    return this.stripeWebhookService.confirmProviderOrderPayment(
      externalSessionId,
      eventId,
      eventType,
      confirmation,
    );
  }

  /**
   * @deprecated Legacy root-order payment wrapper.
   * Use confirmProviderOrderPayment(externalSessionId, eventId, eventType) instead.
   * This wrapper is restricted to single-provider orders only.
   */
  async confirmPayment(orderId: string, paymentRef: string, eventId: string) {
    return this.stripeWebhookService.confirmPayment(
      orderId,
      paymentRef,
      eventId,
    );
  }

  async findPaymentReconciliationIssues(now = new Date()) {
    return this.paymentReconciliationService.findPaymentReconciliationIssues(
      now,
    );
  }
}
