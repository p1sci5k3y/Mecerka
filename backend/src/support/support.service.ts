import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DonationStatus,
  PaymentAccountProvider,
  PaymentSessionStatus,
  Prisma,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);
  private stripe: Stripe | null = null;
  private static readonly WEBHOOK_STATUS_RECEIVED = 'RECEIVED';
  private static readonly WEBHOOK_STATUS_PROCESSED = 'PROCESSED';
  private static readonly WEBHOOK_STATUS_IGNORED = 'IGNORED';
  private static readonly WEBHOOK_STATUS_FAILED = 'FAILED';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private isDonationsEnabled() {
    return this.configService.get<string>('DONATIONS_ENABLED') === 'true';
  }

  private isDonationProviderEnabled(provider: PaymentAccountProvider) {
    if (provider !== PaymentAccountProvider.STRIPE) {
      return false;
    }

    return (
      this.configService.get<string>('DONATIONS_STRIPE_ENABLED') === 'true'
    );
  }

  private getSupportedCurrencies() {
    const configured =
      this.configService.get<string>('DONATIONS_SUPPORTED_CURRENCIES') ?? 'EUR';

    return new Set(
      configured
        .split(',')
        .map((currency) => currency.trim().toUpperCase())
        .filter(Boolean),
    );
  }

  private getMinimumDonationAmount() {
    const configured = Number(
      this.configService.get<string>('DONATIONS_MIN_AMOUNT') ?? '1',
    );

    return Number.isFinite(configured) && configured > 0 ? configured : 1;
  }

  private getMaximumDonationAmount() {
    const configured = Number(
      this.configService.get<string>('DONATIONS_MAX_AMOUNT') ?? '500',
    );

    return Number.isFinite(configured) && configured > 0 ? configured : 500;
  }

  private ensureDonationsEnabled(provider: PaymentAccountProvider) {
    if (!this.isDonationsEnabled()) {
      throw new ServiceUnavailableException('Donations are disabled');
    }

    if (!this.isDonationProviderEnabled(provider)) {
      throw new ServiceUnavailableException(
        `Donation provider ${provider} is disabled`,
      );
    }
  }

  private getStripeClient() {
    if (this.stripe) {
      return this.stripe;
    }

    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new ServiceUnavailableException(
        'Stripe donation support is not configured',
      );
    }

    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2026-02-25.clover',
    });

    return this.stripe;
  }

  private validateDonationInput(amount: string | number, currency: string) {
    const normalizedAmount = Number(amount);
    const normalizedCurrency = String(currency).toUpperCase();

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      throw new BadRequestException(
        'Donation amount must be greater than zero',
      );
    }

    if (normalizedAmount < this.getMinimumDonationAmount()) {
      throw new BadRequestException(
        `Donation amount must be at least ${this.getMinimumDonationAmount().toFixed(2)}`,
      );
    }

    if (normalizedAmount > this.getMaximumDonationAmount()) {
      throw new BadRequestException(
        `Donation amount must be at most ${this.getMaximumDonationAmount().toFixed(2)}`,
      );
    }

    if (!this.getSupportedCurrencies().has(normalizedCurrency)) {
      throw new BadRequestException('Unsupported donation currency');
    }

    return {
      normalizedAmount,
      normalizedCurrency,
    };
  }

  private async claimDonationWebhookEvent(eventId: string, eventType: string) {
    try {
      await (this.prisma as any).donationWebhookEvent.create({
        data: {
          id: eventId,
          provider: PaymentAccountProvider.STRIPE,
          eventType,
          status: SupportService.WEBHOOK_STATUS_RECEIVED,
        },
      });
      return true;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  private async markDonationWebhookEventStatus(
    eventId: string,
    status: string,
    processedAt?: Date,
  ) {
    await (this.prisma as any).donationWebhookEvent.update({
      where: { id: eventId },
      data: {
        status,
        ...(processedAt ? { processedAt } : {}),
      },
    });
  }

  async createDonation(
    amount: string | number,
    currency: string,
    donorUserId?: string,
  ) {
    this.ensureDonationsEnabled(PaymentAccountProvider.STRIPE);
    const { normalizedAmount, normalizedCurrency } = this.validateDonationInput(
      amount,
      currency,
    );

    return (this.prisma as any).platformDonation.create({
      data: {
        amount: normalizedAmount,
        currency: normalizedCurrency,
        donorUserId,
        provider: PaymentAccountProvider.STRIPE,
        status: DonationStatus.CREATED,
      },
    });
  }

  async getDonation(donationId: string, donorUserId?: string) {
    const donation = await (this.prisma as any).platformDonation.findUnique({
      where: { id: donationId },
      include: {
        sessions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!donation) {
      throw new NotFoundException('Donation not found');
    }

    if (!donation.donorUserId && !donorUserId) {
      throw new ForbiddenException(
        'Anonymous donations cannot be retrieved through this endpoint',
      );
    }

    if (
      donorUserId &&
      donation.donorUserId &&
      donation.donorUserId !== donorUserId
    ) {
      throw new ForbiddenException('You do not have access to this donation');
    }

    return donation;
  }

  async prepareDonationPayment(donationId: string, donorUserId?: string) {
    this.ensureDonationsEnabled(PaymentAccountProvider.STRIPE);
    const now = new Date();
    const stripe = this.getStripeClient();

    return this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT 1 FROM "PlatformDonation" WHERE "id" = ${donationId}::uuid FOR UPDATE`,
      );

      const donation = await tx.platformDonation.findUnique({
        where: { id: donationId },
        include: {
          sessions: {
            where: {
              status: {
                in: [PaymentSessionStatus.CREATED, PaymentSessionStatus.READY],
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!donation) {
        throw new NotFoundException('Donation not found');
      }

      if (
        donorUserId &&
        donation.donorUserId &&
        donation.donorUserId !== donorUserId
      ) {
        throw new ForbiddenException('You do not have access to this donation');
      }

      if (donation.status === DonationStatus.COMPLETED) {
        throw new ConflictException('Donation is already completed');
      }

      const expiredSessionIds = donation.sessions
        .filter(
          (session: { id: string; expiresAt?: Date | null }) =>
            session.expiresAt instanceof Date &&
            session.expiresAt.getTime() <= now.getTime(),
        )
        .map((session: { id: string }) => session.id);

      if (expiredSessionIds.length > 0) {
        await tx.donationSession.updateMany({
          where: {
            id: { in: expiredSessionIds },
            status: {
              in: [PaymentSessionStatus.CREATED, PaymentSessionStatus.READY],
            },
          },
          data: {
            status: PaymentSessionStatus.EXPIRED,
          },
        });
      }

      const activeSession = donation.sessions.find(
        (session: {
          id: string;
          externalSessionId?: string | null;
          status: PaymentSessionStatus;
          expiresAt?: Date | null;
        }) =>
          session.status === PaymentSessionStatus.READY &&
          session.externalSessionId &&
          (!session.expiresAt || session.expiresAt.getTime() > now.getTime()),
      );

      if (activeSession) {
        const existingIntent = await stripe.paymentIntents.retrieve(
          activeSession.externalSessionId!,
        );

        await tx.platformDonation.update({
          where: { id: donation.id },
          data: {
            status: DonationStatus.READY,
            externalRef: activeSession.externalSessionId,
          },
        });

        return {
          donationId: donation.id,
          donationSessionId: activeSession.id,
          externalSessionId: activeSession.externalSessionId,
          clientSecret: existingIntent.client_secret,
          expiresAt: activeSession.expiresAt,
          status: DonationStatus.READY,
        };
      }

      const intent = await stripe.paymentIntents.create({
        amount: Math.round(Number(donation.amount) * 100),
        currency: donation.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: {
          donationId: donation.id,
        },
      });

      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
      const session = await tx.donationSession.create({
        data: {
          donationId: donation.id,
          paymentProvider: donation.provider,
          externalSessionId: intent.id,
          paymentUrl: null,
          status: PaymentSessionStatus.READY,
          expiresAt,
          providerMetadata: {
            livemode: Boolean((intent as any).livemode ?? false),
            paymentIntentId: intent.id,
          },
        },
      });

      await tx.platformDonation.update({
        where: { id: donation.id },
        data: {
          status: DonationStatus.READY,
          externalRef: intent.id,
        },
      });

      return {
        donationId: donation.id,
        donationSessionId: session.id,
        externalSessionId: intent.id,
        clientSecret: intent.client_secret,
        expiresAt,
        status: DonationStatus.READY,
      };
    });
  }

  async confirmDonationPayment(externalSessionId: string, eventId?: string) {
    if (eventId) {
      const claimed = await this.claimDonationWebhookEvent(
        eventId,
        'payment_intent.succeeded',
      );
      if (!claimed) {
        return { message: 'Donation webhook already processed' };
      }
    }

    try {
      const result = await this.prisma.$transaction(async (tx: any) => {
        const session = await tx.donationSession.findUnique({
          where: { externalSessionId },
          include: {
            donation: true,
          },
        });

        if (!session) {
          throw new NotFoundException('Donation session not found');
        }

        if (
          session.status === PaymentSessionStatus.COMPLETED ||
          session.donation.status === DonationStatus.COMPLETED
        ) {
          return {
            donationId: session.donationId,
            status: DonationStatus.COMPLETED,
          };
        }

        await tx.donationSession.update({
          where: { id: session.id },
          data: {
            status: PaymentSessionStatus.COMPLETED,
          },
        });

        await tx.platformDonation.update({
          where: { id: session.donationId },
          data: {
            status: DonationStatus.COMPLETED,
            externalRef: externalSessionId,
          },
        });

        return {
          donationId: session.donationId,
          status: DonationStatus.COMPLETED,
        };
      });

      if (eventId) {
        await this.markDonationWebhookEventStatus(
          eventId,
          SupportService.WEBHOOK_STATUS_PROCESSED,
          new Date(),
        );
      }

      return result;
    } catch (error) {
      if (eventId) {
        await this.markDonationWebhookEventStatus(
          eventId,
          SupportService.WEBHOOK_STATUS_FAILED,
          new Date(),
        );
      }
      throw error;
    }
  }

  async failDonationPayment(externalSessionId: string, eventId?: string) {
    if (eventId) {
      const claimed = await this.claimDonationWebhookEvent(
        eventId,
        'payment_intent.payment_failed',
      );
      if (!claimed) {
        return { message: 'Donation webhook already processed' };
      }
    }

    try {
      const result = await this.prisma.$transaction(async (tx: any) => {
        const session = await tx.donationSession.findUnique({
          where: { externalSessionId },
          include: {
            donation: true,
          },
        });

        if (!session) {
          throw new NotFoundException('Donation session not found');
        }

        if (session.status === PaymentSessionStatus.COMPLETED) {
          return {
            donationId: session.donationId,
            status: DonationStatus.COMPLETED,
          };
        }

        await tx.donationSession.update({
          where: { id: session.id },
          data: {
            status: PaymentSessionStatus.FAILED,
          },
        });

        await tx.platformDonation.update({
          where: { id: session.donationId },
          data: {
            status: DonationStatus.FAILED,
            externalRef: externalSessionId,
          },
        });

        return {
          donationId: session.donationId,
          status: DonationStatus.FAILED,
        };
      });

      if (eventId) {
        await this.markDonationWebhookEventStatus(
          eventId,
          result.status === DonationStatus.COMPLETED
            ? SupportService.WEBHOOK_STATUS_IGNORED
            : SupportService.WEBHOOK_STATUS_PROCESSED,
          new Date(),
        );
      }

      return result;
    } catch (error) {
      if (eventId) {
        await this.markDonationWebhookEventStatus(
          eventId,
          SupportService.WEBHOOK_STATUS_FAILED,
          new Date(),
        );
      }
      throw error;
    }
  }
}
