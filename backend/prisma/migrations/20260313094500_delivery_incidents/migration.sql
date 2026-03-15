CREATE TYPE "IncidentReporterRole" AS ENUM (
  'CLIENT',
  'RUNNER',
  'PROVIDER',
  'ADMIN'
);

CREATE TYPE "DeliveryIncidentType" AS ENUM (
  'MISSING_ITEMS',
  'DAMAGED_ITEMS',
  'WRONG_DELIVERY',
  'FAILED_DELIVERY',
  'ADDRESS_PROBLEM',
  'SAFETY_CONCERN',
  'OTHER'
);

CREATE TYPE "DeliveryIncidentStatus" AS ENUM (
  'OPEN',
  'UNDER_REVIEW',
  'RESOLVED',
  'REJECTED'
);

CREATE TABLE "DeliveryIncident" (
  "id" UUID NOT NULL,
  "deliveryOrderId" UUID NOT NULL,
  "reporterId" UUID NOT NULL,
  "reporterRole" "IncidentReporterRole" NOT NULL,
  "type" "DeliveryIncidentType" NOT NULL,
  "status" "DeliveryIncidentStatus" NOT NULL DEFAULT 'OPEN',
  "description" TEXT NOT NULL,
  "evidenceUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),

  CONSTRAINT "DeliveryIncident_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliveryIncident_deliveryOrderId_idx" ON "DeliveryIncident"("deliveryOrderId");
CREATE INDEX "DeliveryIncident_status_idx" ON "DeliveryIncident"("status");
CREATE INDEX "DeliveryIncident_createdAt_idx" ON "DeliveryIncident"("createdAt");

ALTER TABLE "DeliveryIncident"
ADD CONSTRAINT "DeliveryIncident_deliveryOrderId_fkey"
FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeliveryIncident"
ADD CONSTRAINT "DeliveryIncident_reporterId_fkey"
FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
