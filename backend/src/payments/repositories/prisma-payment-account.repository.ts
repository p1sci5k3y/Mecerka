import { Injectable } from '@nestjs/common';
import {
  PaymentAccount,
  PaymentAccountOwnerType,
  PaymentAccountProvider,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IPaymentAccountRepository } from './payment-account.repository.interface';

@Injectable()
export class PrismaPaymentAccountRepository implements IPaymentAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActive(
    ownerType: PaymentAccountOwnerType,
    ownerId: string,
    provider: PaymentAccountProvider,
  ): Promise<PaymentAccount | null> {
    return this.prisma.paymentAccount.findFirst({
      where: { ownerType, ownerId, provider, isActive: true },
    });
  }

  upsert(
    ownerType: PaymentAccountOwnerType,
    ownerId: string,
    provider: PaymentAccountProvider,
    externalAccountId: string,
  ): Promise<PaymentAccount> {
    return this.prisma.paymentAccount.upsert({
      where: {
        ownerType_ownerId_provider: { ownerType, ownerId, provider },
      },
      update: { externalAccountId, isActive: true },
      create: {
        ownerType,
        ownerId,
        provider,
        externalAccountId,
        isActive: true,
      },
    });
  }
}
