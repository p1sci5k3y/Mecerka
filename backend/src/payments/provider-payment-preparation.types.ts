import { Prisma, ProviderPaymentStatus } from '@prisma/client';

export type PreparedProviderOrderPayment = {
  providerOrderId: string;
  paymentSessionId: string;
  orderId?: string;
  subtotalAmount?: Prisma.Decimal | number | string;
  stripeAccountId: string | null;
  expiresAt: Date | null;
  paymentStatus: ProviderPaymentStatus;
  externalSessionId?: string | null;
  clientSecret?: string | null;
};
