-- Improve dashboard and metrics reads over order history without altering behavior.
CREATE INDEX IF NOT EXISTS "Order_clientId_createdAt_idx"
ON "Order"("clientId", "createdAt");

CREATE INDEX IF NOT EXISTS "Order_createdAt_idx"
ON "Order"("createdAt");
