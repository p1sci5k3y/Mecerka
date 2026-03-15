-- Normalize any legacy XLSX import rows before shrinking the enum.
UPDATE "ProductImportJob"
SET "format" = 'CSV'
WHERE "format" = 'XLSX';

-- Recreate ProductImportFormat without XLSX.
ALTER TYPE "ProductImportFormat" RENAME TO "ProductImportFormat_old";
CREATE TYPE "ProductImportFormat" AS ENUM ('CSV');

ALTER TABLE "ProductImportJob"
ALTER COLUMN "format" TYPE "ProductImportFormat"
USING ("format"::text::"ProductImportFormat");

DROP TYPE "ProductImportFormat_old";

-- Refund query indexes.
CREATE INDEX "RefundRequest_providerOrderId_status_idx"
ON "RefundRequest"("providerOrderId", "status");

CREATE INDEX "RefundRequest_deliveryOrderId_status_idx"
ON "RefundRequest"("deliveryOrderId", "status");
