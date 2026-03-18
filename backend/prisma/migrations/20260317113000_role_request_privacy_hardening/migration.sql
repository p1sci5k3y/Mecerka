CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "User"
ADD COLUMN "fiscalIdHash" TEXT,
ADD COLUMN "fiscalIdLast4" VARCHAR(4);

UPDATE "User"
SET
  "fiscalIdHash" = encode(digest("fiscalId", 'sha256'), 'hex'),
  "fiscalIdLast4" = RIGHT("fiscalId", 4)
WHERE "fiscalId" IS NOT NULL;

ALTER TABLE "User"
DROP COLUMN "fiscalId";
