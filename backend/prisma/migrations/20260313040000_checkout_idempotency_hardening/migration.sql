-- Backfill legacy rows before enforcing NOT NULL.
UPDATE "Order"
SET "checkoutIdempotencyKey" = CONCAT('legacy-order-', "id")
WHERE "checkoutIdempotencyKey" IS NULL;

ALTER TABLE "Order"
ALTER COLUMN "checkoutIdempotencyKey" SET NOT NULL;
