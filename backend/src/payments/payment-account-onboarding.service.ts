import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentAccountOwnerType,
  PaymentAccountProvider,
  Role,
  User,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { IPaymentAccountRepository } from './repositories/payment-account.repository.interface';

type OnboardingUser = Pick<User, 'id' | 'email' | 'roles' | 'stripeAccountId'>;

export class PaymentAccountOnboardingService {
  private static readonly DEFAULT_FRONTEND_URL = 'http://localhost:3001';
  private static readonly DEFAULT_BACKEND_URL = 'http://localhost:3000';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly stripe: Stripe,
    private readonly paymentAccountRepository: IPaymentAccountRepository,
  ) {}

  async generateOnboardingLink(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const accountId = await this.ensureStripeAccountId(user);
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ??
      PaymentAccountOnboardingService.DEFAULT_FRONTEND_URL;
    const backendUrl =
      this.configService.get<string>('BACKEND_URL') ??
      PaymentAccountOnboardingService.DEFAULT_BACKEND_URL;

    const accountLink = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${frontendUrl}/dashboard?stripe_connected=refresh`,
      return_url: `${backendUrl}/payments/connect/callback?accountId=${accountId}`,
      type: 'account_onboarding',
    });

    return accountLink.url;
  }

  async verifyAndSaveConnectedAccount(
    userId: string,
    accountId: string,
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.stripeAccountId !== accountId) {
      throw new ConflictException('Account ID mismatch or user not found');
    }

    const account = await this.stripe.accounts.retrieve(accountId);
    if (!account.details_submitted) {
      throw new ConflictException(
        'Stripe Onboarding is incomplete. Please finish the registration.',
      );
    }

    await this.activatePaymentAccountForUser(user, accountId);
    return true;
  }

  private async ensureStripeAccountId(user: OnboardingUser): Promise<string> {
    if (user.stripeAccountId) {
      return user.stripeAccountId;
    }

    const account = await this.stripe.accounts.create({
      type: 'express',
      email: user.email,
      capabilities: {
        transfers: { requested: true },
      },
      business_type: 'individual',
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { stripeAccountId: account.id },
    });

    await this.activatePaymentAccountForUser(user, account.id);
    return account.id;
  }

  private async activatePaymentAccountForUser(
    user: OnboardingUser,
    accountId: string,
  ) {
    const ownerType = this.resolvePaymentAccountOwnerType(user.roles);
    if (!ownerType) {
      return null;
    }

    return this.paymentAccountRepository.upsert(
      ownerType,
      user.id,
      PaymentAccountProvider.STRIPE,
      accountId,
    );
  }

  private resolvePaymentAccountOwnerType(
    roles: Role[],
  ): PaymentAccountOwnerType | null {
    if (roles.includes(Role.PROVIDER)) {
      return PaymentAccountOwnerType.PROVIDER;
    }

    if (roles.includes(Role.RUNNER)) {
      return PaymentAccountOwnerType.RUNNER;
    }

    return null;
  }
}
