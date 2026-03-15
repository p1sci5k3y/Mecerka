-- CreateEnum
CREATE TYPE "CartGroupStatus" AS ENUM ('ACTIVE', 'CHECKED_OUT', 'ABANDONED', 'EXPIRED');

-- CreateTable
CREATE TABLE "CartGroup" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "cityId" UUID,
    "status" "CartGroupStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CartGroup_clientId_status_idx" ON "CartGroup"("clientId", "status");

-- CreateIndex
CREATE INDEX "CartGroup_status_expiresAt_idx" ON "CartGroup"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "CartGroup_cityId_idx" ON "CartGroup"("cityId");

-- Enforce at most one active cart per client without blocking historical carts.
CREATE UNIQUE INDEX "CartGroup_one_active_per_client_idx"
ON "CartGroup"("clientId")
WHERE "status" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "CartGroup" ADD CONSTRAINT "CartGroup_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartGroup" ADD CONSTRAINT "CartGroup_cityId_fkey"
FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
