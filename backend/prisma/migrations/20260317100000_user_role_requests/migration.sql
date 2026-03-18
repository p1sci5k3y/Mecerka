-- CreateEnum
CREATE TYPE "RoleRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "fiscalCountry" TEXT,
ADD COLUMN "fiscalId" TEXT,
ADD COLUMN "requestedAt" TIMESTAMP(3),
ADD COLUMN "requestedRole" "Role",
ADD COLUMN "roleStatus" "RoleRequestStatus";

-- CreateIndex
CREATE INDEX "User_requestedRole_idx" ON "User"("requestedRole");

-- CreateIndex
CREATE INDEX "User_roleStatus_idx" ON "User"("roleStatus");
