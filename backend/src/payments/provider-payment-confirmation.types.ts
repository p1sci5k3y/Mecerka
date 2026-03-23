import {
  DeliveryStatus,
  ProviderOrderStatus,
  ProviderPaymentStatus,
} from '@prisma/client';

export type PaymentConfirmationPayload = {
  amount?: number | null;
  amountReceived?: number | null;
  currency?: string | null;
  accountId?: string | null;
  metadata?: Record<string, string | undefined> | null;
};

export type ProviderPaymentCompletionEvents = {
  stateChanged: {
    orderId: string;
    status: DeliveryStatus;
    paymentRef: string;
  };
  partialCancelled: null;
};

export type IgnoredProviderPaymentConfirmation = {
  message: string;
  status: DeliveryStatus | ProviderOrderStatus;
};

export type CompletedProviderPaymentConfirmation = {
  success: true;
  orderId: string;
  providerOrderId: string;
  status: DeliveryStatus;
  paymentStatus: ProviderPaymentStatus;
  paymentRef: string;
  _events: ProviderPaymentCompletionEvents;
};

export type ProviderPaymentConfirmationResult =
  | IgnoredProviderPaymentConfirmation
  | CompletedProviderPaymentConfirmation;
