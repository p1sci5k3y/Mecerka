-- CreateEnum
CREATE TYPE "RefundType" AS ENUM (
  'PROVIDER_FULL',
  'PROVIDER_PARTIAL',
  'DELIVERY_FULL',
  'DELIVERY_PARTIAL'
);

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM (
  'REQUESTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'EXECUTING',
  'COMPLETED',
  'FAILED'
);

-- AlterTable
ALTER TABLE "DeliveryOrder"
ADD COLUMN "paymentRef" TEXT,
ADD COLUMN "paidAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RefundRequest" (
  "id" UUID NOT NULL,
  "incidentId" UUID,
  "providerOrderId" UUID,
  "deliveryOrderId" UUID,
  "type" "RefundType" NOT NULL,
  "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "requestedById" UUID NOT NULL,
  "reviewedById" UUID,
  "externalRefundId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_paymentRef_key" ON "DeliveryOrder"("paymentRef");

-- CreateIndex
CREATE INDEX "RefundRequest_incidentId_idx" ON "RefundRequest"("incidentId");
CREATE INDEX "RefundRequest_providerOrderId_idx" ON "RefundRequest"("providerOrderId");
CREATE INDEX "RefundRequest_deliveryOrderId_idx" ON "RefundRequest"("deliveryOrderId");
CREATE INDEX "RefundRequest_status_idx" ON "RefundRequest"("status");
CREATE INDEX "RefundRequest_requestedById_createdAt_idx" ON "RefundRequest"("requestedById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefundRequest_providerOrderId_externalRefundId_key"
ON "RefundRequest"("providerOrderId", "externalRefundId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundRequest_deliveryOrderId_externalRefundId_key"
ON "RefundRequest"("deliveryOrderId", "externalRefundId");

-- AddForeignKey
ALTER TABLE "RefundRequest"
ADD CONSTRAINT "RefundRequest_incidentId_fkey"
FOREIGN KEY ("incidentId") REFERENCES "DeliveryIncident"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RefundRequest"
ADD CONSTRAINT "RefundRequest_providerOrderId_fkey"
FOREIGN KEY ("providerOrderId") REFERENCES "ProviderOrder"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RefundRequest"
ADD CONSTRAINT "RefundRequest_deliveryOrderId_fkey"
FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RefundRequest"
ADD CONSTRAINT "RefundRequest_requestedById_fkey"
FOREIGN KEY ("requestedById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RefundRequest"
ADD CONSTRAINT "RefundRequest_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint
ALTER TABLE "RefundRequest"
ADD CONSTRAINT "RefundRequest_exactly_one_boundary_chk"
CHECK (
  (CASE WHEN "providerOrderId" IS NULL THEN 0 ELSE 1 END) +
  (CASE WHEN "deliveryOrderId" IS NULL THEN 0 ELSE 1 END) = 1
);
