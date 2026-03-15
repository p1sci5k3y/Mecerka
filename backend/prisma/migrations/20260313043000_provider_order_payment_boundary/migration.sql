-- CreateEnum
CREATE TYPE "ProviderPaymentStatus" AS ENUM ('PENDING', 'PAYMENT_READY', 'PAID', 'FAILED');

-- AddColumns
ALTER TABLE "ProviderOrder"
ADD COLUMN "paymentStatus" "ProviderPaymentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "paymentRef" TEXT,
ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "subtotalAmount" DECIMAL(10,2);

-- Backfill subtotalAmount from legacy subtotal values.
UPDATE "ProviderOrder"
SET "subtotalAmount" = "subtotal";

ALTER TABLE "ProviderOrder"
ALTER COLUMN "subtotalAmount" SET NOT NULL;

ALTER TABLE "ProviderOrder"
DROP COLUMN "subtotal";

CREATE INDEX "ProviderOrder_paymentStatus_idx"
ON "ProviderOrder"("paymentStatus");
