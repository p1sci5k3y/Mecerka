import {
  PaymentAccount,
  PaymentAccountOwnerType,
  PaymentAccountProvider,
} from '@prisma/client';

export abstract class IPaymentAccountRepository {
  abstract findActive(
    ownerType: PaymentAccountOwnerType,
    ownerId: string,
    provider: PaymentAccountProvider,
  ): Promise<PaymentAccount | null>;

  abstract upsert(
    ownerType: PaymentAccountOwnerType,
    ownerId: string,
    provider: PaymentAccountProvider,
    externalAccountId: string,
  ): Promise<PaymentAccount>;
}
