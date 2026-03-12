-- AlterTable
ALTER TABLE "User" ADD COLUMN "mfaSetupToken" TEXT,
ADD COLUMN "mfaSetupExpiresAt" TIMESTAMP(3),
ADD COLUMN "mfaFailedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "mfaLockUntil" TIMESTAMP(3),
ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "stripeAccountId" TEXT,
ADD COLUMN "resetPasswordTokenHash" TEXT,
ADD COLUMN "resetPasswordExpiresAt" TIMESTAMP(3),
ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeAccountId_key" ON "User"("stripeAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "User_resetPasswordTokenHash_key" ON "User"("resetPasswordTokenHash");
