import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DonationStatus, PaymentAccountProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DonationPaymentService } from './donation-payment.service';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly donationPaymentService: DonationPaymentService,
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

    return this.prisma.platformDonation.create({
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
    const donation = await this.prisma.platformDonation.findUnique({
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
    return this.donationPaymentService.prepareDonationPayment(
      donationId,
      donorUserId,
    );
  }

  async confirmDonationPayment(externalSessionId: string, eventId?: string) {
    return this.donationPaymentService.confirmDonationPayment(
      externalSessionId,
      eventId,
    );
  }

  async failDonationPayment(externalSessionId: string, eventId?: string) {
    return this.donationPaymentService.failDonationPayment(
      externalSessionId,
      eventId,
    );
  }
}
