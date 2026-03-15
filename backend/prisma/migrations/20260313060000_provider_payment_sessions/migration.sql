CREATE TYPE "PaymentSessionStatus" AS ENUM (
  'CREATED',
  'READY',
  'EXPIRED',
  'COMPLETED',
  'FAILED'
);

CREATE TABLE "ProviderPaymentSession" (
  "id" UUID NOT NULL,
  "providerOrderId" UUID NOT NULL,
  "paymentProvider" TEXT NOT NULL,
  "paymentUrl" TEXT,
  "status" "PaymentSessionStatus" NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProviderPaymentSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProviderPaymentSession_providerOrderId_idx"
ON "ProviderPaymentSession"("providerOrderId");

ALTER TABLE "ProviderPaymentSession"
ADD CONSTRAINT "ProviderPaymentSession_providerOrderId_fkey"
FOREIGN KEY ("providerOrderId") REFERENCES "ProviderOrder"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
