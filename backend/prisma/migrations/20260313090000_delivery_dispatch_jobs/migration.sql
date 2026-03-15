CREATE TYPE "DeliveryJobStatus" AS ENUM (
  'OPEN',
  'ASSIGNED',
  'EXPIRED',
  'CANCELLED'
);

CREATE TABLE "DeliveryJob" (
  "id" UUID NOT NULL,
  "deliveryOrderId" UUID NOT NULL,
  "status" "DeliveryJobStatus" NOT NULL DEFAULT 'OPEN',
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DeliveryJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryJobClaim" (
  "id" UUID NOT NULL,
  "jobId" UUID NOT NULL,
  "runnerId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DeliveryJobClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliveryJob_deliveryOrderId_key" ON "DeliveryJob"("deliveryOrderId");
CREATE INDEX "DeliveryJob_status_idx" ON "DeliveryJob"("status");
CREATE INDEX "DeliveryJob_expiresAt_idx" ON "DeliveryJob"("expiresAt");

CREATE INDEX "DeliveryJobClaim_jobId_idx" ON "DeliveryJobClaim"("jobId");
CREATE INDEX "DeliveryJobClaim_runnerId_idx" ON "DeliveryJobClaim"("runnerId");
CREATE UNIQUE INDEX "DeliveryJobClaim_jobId_runnerId_key"
ON "DeliveryJobClaim"("jobId", "runnerId");

ALTER TABLE "DeliveryJob"
ADD CONSTRAINT "DeliveryJob_deliveryOrderId_fkey"
FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeliveryJobClaim"
ADD CONSTRAINT "DeliveryJobClaim_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "DeliveryJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeliveryJobClaim"
ADD CONSTRAINT "DeliveryJobClaim_runnerId_fkey"
FOREIGN KEY ("runnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
