ALTER TABLE "ProviderPaymentSession"
ADD COLUMN "providerResponsePayload" JSONB;

CREATE TABLE "PaymentWebhookEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "WebhookEvent";
