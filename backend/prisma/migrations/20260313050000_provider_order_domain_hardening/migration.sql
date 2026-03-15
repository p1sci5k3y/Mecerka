-- Safely extend the existing enum in place.
ALTER TYPE "ProviderOrderStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_PENDING';
ALTER TYPE "ProviderOrderStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_READY';
ALTER TYPE "ProviderOrderStatus" ADD VALUE IF NOT EXISTS 'PAID';
ALTER TYPE "ProviderOrderStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "ProviderOrderStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "ProviderOrderStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- Add payment lifecycle timestamps required for later session expiry/regeneration.
ALTER TABLE "ProviderOrder"
ADD COLUMN "paymentReadyAt" TIMESTAMP(3),
ADD COLUMN "paymentExpiresAt" TIMESTAMP(3);

-- Add access path for order/provider scoped queries.
CREATE INDEX "ProviderOrder_orderId_providerId_idx"
ON "ProviderOrder"("orderId", "providerId");

-- Protect provider-local payment references.
CREATE UNIQUE INDEX "ProviderOrder_providerId_paymentRef_key"
ON "ProviderOrder"("providerId", "paymentRef");
