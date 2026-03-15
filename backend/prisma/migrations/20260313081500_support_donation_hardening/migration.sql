ALTER TABLE "DonationSession"
ADD COLUMN "providerMetadata" JSONB;

CREATE TABLE "DonationWebhookEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "status" TEXT,

  CONSTRAINT "DonationWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DonationWebhookEvent_provider_eventType_receivedAt_idx"
ON "DonationWebhookEvent"("provider", "eventType", "receivedAt");

CREATE INDEX "DonationWebhookEvent_status_receivedAt_idx"
ON "DonationWebhookEvent"("status", "receivedAt");
