-- CreateTable
CREATE TABLE "CartProvider" (
    "id" UUID NOT NULL,
    "cartGroupId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CartProvider_cartGroupId_providerId_key"
ON "CartProvider"("cartGroupId", "providerId");

-- CreateIndex
CREATE INDEX "CartProvider_cartGroupId_idx" ON "CartProvider"("cartGroupId");

-- CreateIndex
CREATE INDEX "CartProvider_providerId_idx" ON "CartProvider"("providerId");

-- AddForeignKey
ALTER TABLE "CartProvider" ADD CONSTRAINT "CartProvider_cartGroupId_fkey"
FOREIGN KEY ("cartGroupId") REFERENCES "CartGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartProvider" ADD CONSTRAINT "CartProvider_providerId_fkey"
FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
