CREATE TYPE "PaymentAccountOwnerType" AS ENUM ('PROVIDER', 'RUNNER');

CREATE TYPE "PaymentAccountProvider" AS ENUM ('STRIPE', 'PAYPAL');

ALTER TABLE "ProviderOrder"
ADD COLUMN "externalInvoiceUrl" TEXT,
ADD COLUMN "externalInvoiceNumber" TEXT;

CREATE TABLE "PaymentAccount" (
  "id" UUID NOT NULL,
  "ownerType" "PaymentAccountOwnerType" NOT NULL,
  "ownerId" UUID NOT NULL,
  "provider" "PaymentAccountProvider" NOT NULL,
  "externalAccountId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaymentAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderSummaryDocument" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "displayNumber" TEXT NOT NULL,
  "totalAmount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OrderSummaryDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentAccount_ownerType_ownerId_provider_key"
ON "PaymentAccount"("ownerType", "ownerId", "provider");

CREATE UNIQUE INDEX "PaymentAccount_provider_externalAccountId_key"
ON "PaymentAccount"("provider", "externalAccountId");

CREATE INDEX "PaymentAccount_ownerType_ownerId_isActive_idx"
ON "PaymentAccount"("ownerType", "ownerId", "isActive");

CREATE UNIQUE INDEX "OrderSummaryDocument_orderId_key"
ON "OrderSummaryDocument"("orderId");

CREATE UNIQUE INDEX "OrderSummaryDocument_displayNumber_key"
ON "OrderSummaryDocument"("displayNumber");

ALTER TABLE "PaymentAccount"
ADD CONSTRAINT "PaymentAccount_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderSummaryDocument"
ADD CONSTRAINT "OrderSummaryDocument_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
