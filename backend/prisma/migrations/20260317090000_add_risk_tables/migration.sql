CREATE TYPE "RiskActorType" AS ENUM (
  'CLIENT',
  'PROVIDER',
  'RUNNER',
  'ORDER',
  'DELIVERY_ORDER'
);

CREATE TYPE "RiskCategory" AS ENUM (
  'EXCESSIVE_REFUNDS',
  'EXCESSIVE_INCIDENTS',
  'EXCESSIVE_CANCELLATIONS',
  'RUNNER_GPS_ANOMALY',
  'RUNNER_JOB_GRABBING',
  'PROVIDER_REJECTION_SPIKE',
  'CLIENT_REFUND_ABUSE',
  'CLIENT_INCIDENT_ABUSE',
  'DELIVERY_FAILURE_PATTERN',
  'PAYMENT_FAILURE_PATTERN',
  'OTHER'
);

CREATE TYPE "RiskLevel" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
);

CREATE TABLE "RiskEvent" (
  "id" UUID NOT NULL,
  "actorType" "RiskActorType" NOT NULL,
  "actorId" UUID NOT NULL,
  "category" "RiskCategory" NOT NULL,
  "score" INTEGER NOT NULL,
  "metadata" JSONB,
  "dedupKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RiskEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RiskScoreSnapshot" (
  "id" UUID NOT NULL,
  "actorType" "RiskActorType" NOT NULL,
  "actorId" UUID NOT NULL,
  "score" INTEGER NOT NULL,
  "level" "RiskLevel" NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RiskScoreSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RiskEvent_dedupKey_key" ON "RiskEvent"("dedupKey");
CREATE INDEX "RiskEvent_actorType_actorId_idx" ON "RiskEvent"("actorType", "actorId");
CREATE INDEX "RiskEvent_category_createdAt_idx" ON "RiskEvent"("category", "createdAt");
CREATE INDEX "RiskEvent_createdAt_idx" ON "RiskEvent"("createdAt");

CREATE UNIQUE INDEX "RiskScoreSnapshot_actorType_actorId_key"
ON "RiskScoreSnapshot"("actorType", "actorId");
CREATE INDEX "RiskScoreSnapshot_level_idx" ON "RiskScoreSnapshot"("level");
