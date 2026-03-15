ALTER TABLE "DeliveryOrder"
ADD COLUMN "lastRunnerLocationLat" DOUBLE PRECISION,
ADD COLUMN "lastRunnerLocationLng" DOUBLE PRECISION,
ADD COLUMN "lastLocationUpdateAt" TIMESTAMP(3);

CREATE TABLE "RunnerLocation" (
  "id" UUID NOT NULL,
  "runnerId" UUID NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RunnerLocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RunnerLocation_runnerId_idx" ON "RunnerLocation"("runnerId");
CREATE INDEX "RunnerLocation_recordedAt_idx" ON "RunnerLocation"("recordedAt");

ALTER TABLE "RunnerLocation"
ADD CONSTRAINT "RunnerLocation_runnerId_fkey"
FOREIGN KEY ("runnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
