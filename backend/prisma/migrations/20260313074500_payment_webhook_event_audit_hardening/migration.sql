ALTER TABLE "PaymentWebhookEvent"
ADD COLUMN "processedAt" TIMESTAMP(3),
ADD COLUMN "status" TEXT;

CREATE INDEX "PaymentWebhookEvent_provider_eventType_receivedAt_idx"
ON "PaymentWebhookEvent"("provider", "eventType", "receivedAt");

CREATE INDEX "PaymentWebhookEvent_status_receivedAt_idx"
ON "PaymentWebhookEvent"("status", "receivedAt");
