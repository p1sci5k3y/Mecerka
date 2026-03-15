CREATE TYPE "DeliveryOrderStatus" AS ENUM (
  'PENDING',
  'RUNNER_ASSIGNED',
  'PICKUP_PENDING',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED'
);

CREATE TYPE "RunnerPaymentStatus" AS ENUM (
  'PENDING',
  'PAYMENT_READY',
  'PAID',
  'FAILED'
);

CREATE TABLE "DeliveryOrder" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "runnerId" UUID,
  "status" "DeliveryOrderStatus" NOT NULL DEFAULT 'PENDING',
  "deliveryFee" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "paymentStatus" "RunnerPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DeliveryOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RunnerPaymentSession" (
  "id" UUID NOT NULL,
  "deliveryOrderId" UUID NOT NULL,
  "paymentProvider" "PaymentAccountProvider" NOT NULL,
  "externalSessionId" TEXT,
  "paymentUrl" TEXT,
  "status" "PaymentSessionStatus" NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "providerMetadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RunnerPaymentSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RunnerWebhookEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "status" TEXT,

  CONSTRAINT "RunnerWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliveryOrder_orderId_key" ON "DeliveryOrder"("orderId");
CREATE INDEX "DeliveryOrder_orderId_idx" ON "DeliveryOrder"("orderId");
CREATE INDEX "DeliveryOrder_runnerId_idx" ON "DeliveryOrder"("runnerId");
CREATE INDEX "DeliveryOrder_status_idx" ON "DeliveryOrder"("status");

CREATE UNIQUE INDEX "RunnerPaymentSession_externalSessionId_key"
ON "RunnerPaymentSession"("externalSessionId");
CREATE INDEX "RunnerPaymentSession_deliveryOrderId_idx"
ON "RunnerPaymentSession"("deliveryOrderId");
CREATE INDEX "RunnerPaymentSession_status_expiresAt_idx"
ON "RunnerPaymentSession"("status", "expiresAt");

CREATE INDEX "RunnerWebhookEvent_provider_eventType_receivedAt_idx"
ON "RunnerWebhookEvent"("provider", "eventType", "receivedAt");
CREATE INDEX "RunnerWebhookEvent_status_receivedAt_idx"
ON "RunnerWebhookEvent"("status", "receivedAt");

ALTER TABLE "DeliveryOrder"
ADD CONSTRAINT "DeliveryOrder_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeliveryOrder"
ADD CONSTRAINT "DeliveryOrder_runnerId_fkey"
FOREIGN KEY ("runnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RunnerPaymentSession"
ADD CONSTRAINT "RunnerPaymentSession_deliveryOrderId_fkey"
FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
