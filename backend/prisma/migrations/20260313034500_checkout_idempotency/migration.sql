ALTER TABLE "Order"
ADD COLUMN "checkoutIdempotencyKey" TEXT;

CREATE UNIQUE INDEX "Order_checkoutIdempotencyKey_key"
ON "Order"("checkoutIdempotencyKey");
