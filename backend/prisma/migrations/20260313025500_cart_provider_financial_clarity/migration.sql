-- Rename subtotal field for financial clarity.
ALTER TABLE "CartProvider"
RENAME COLUMN "subtotal" TO "subtotalAmount";

-- Add explicit composite lookup index for provider partition access patterns.
CREATE INDEX "CartProvider_cartGroupId_providerId_idx"
ON "CartProvider"("cartGroupId", "providerId");
