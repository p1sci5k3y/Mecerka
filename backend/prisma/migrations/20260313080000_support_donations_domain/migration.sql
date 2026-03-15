CREATE TYPE "DonationStatus" AS ENUM (
  'CREATED',
  'READY',
  'COMPLETED',
  'FAILED',
  'EXPIRED'
);

CREATE TABLE "PlatformDonation" (
  "id" UUID NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "donorUserId" UUID,
  "provider" "PaymentAccountProvider" NOT NULL,
  "status" "DonationStatus" NOT NULL DEFAULT 'CREATED',
  "externalRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlatformDonation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DonationSession" (
  "id" UUID NOT NULL,
  "donationId" UUID NOT NULL,
  "paymentProvider" "PaymentAccountProvider" NOT NULL,
  "externalSessionId" TEXT,
  "paymentUrl" TEXT,
  "status" "PaymentSessionStatus" NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DonationSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformDonation_donorUserId_idx"
ON "PlatformDonation"("donorUserId");

CREATE INDEX "PlatformDonation_status_createdAt_idx"
ON "PlatformDonation"("status", "createdAt");

CREATE UNIQUE INDEX "DonationSession_externalSessionId_key"
ON "DonationSession"("externalSessionId");

CREATE INDEX "DonationSession_donationId_idx"
ON "DonationSession"("donationId");

CREATE INDEX "DonationSession_status_expiresAt_idx"
ON "DonationSession"("status", "expiresAt");

ALTER TABLE "PlatformDonation"
ADD CONSTRAINT "PlatformDonation_donorUserId_fkey"
FOREIGN KEY ("donorUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DonationSession"
ADD CONSTRAINT "DonationSession_donationId_fkey"
FOREIGN KEY ("donationId") REFERENCES "PlatformDonation"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
