import {
  PaymentAccountOwnerType,
  PaymentAccountProvider,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaPaymentAccountRepository } from './prisma-payment-account.repository';

describe('PrismaPaymentAccountRepository', () => {
  it('delegates active lookups and upserts to Prisma', async () => {
    const prisma = {
      paymentAccount: {
        findFirst: jest.fn().mockResolvedValue({ id: 'account-1' }),
        upsert: jest.fn().mockResolvedValue({ id: 'account-1' }),
      },
    };
    const repository = new PrismaPaymentAccountRepository(
      prisma as unknown as PrismaService,
    );

    await expect(
      repository.findActive(
        PaymentAccountOwnerType.PROVIDER,
        'provider-1',
        PaymentAccountProvider.STRIPE,
      ),
    ).resolves.toEqual({ id: 'account-1' });
    await expect(
      repository.upsert(
        PaymentAccountOwnerType.PROVIDER,
        'provider-1',
        PaymentAccountProvider.STRIPE,
        'acct_123',
      ),
    ).resolves.toEqual({ id: 'account-1' });

    expect(prisma.paymentAccount.findFirst).toHaveBeenCalledWith({
      where: {
        ownerType: PaymentAccountOwnerType.PROVIDER,
        ownerId: 'provider-1',
        provider: PaymentAccountProvider.STRIPE,
        isActive: true,
      },
    });
    expect(prisma.paymentAccount.upsert).toHaveBeenCalledWith({
      where: {
        ownerType_ownerId_provider: {
          ownerType: PaymentAccountOwnerType.PROVIDER,
          ownerId: 'provider-1',
          provider: PaymentAccountProvider.STRIPE,
        },
      },
      update: { externalAccountId: 'acct_123', isActive: true },
      create: {
        ownerType: PaymentAccountOwnerType.PROVIDER,
        ownerId: 'provider-1',
        provider: PaymentAccountProvider.STRIPE,
        externalAccountId: 'acct_123',
        isActive: true,
      },
    });
  });
});
