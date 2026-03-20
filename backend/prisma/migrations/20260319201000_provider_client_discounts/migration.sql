-- CreateTable
CREATE TABLE "ProviderClientProductDiscount" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "discountPrice" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderClientProductDiscount_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "OrderItem"
ADD COLUMN "unitBasePriceSnapshot" DECIMAL(10,2),
ADD COLUMN "discountPriceSnapshot" DECIMAL(10,2);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderClientProductDiscount_providerId_clientId_productId_key" ON "ProviderClientProductDiscount"("providerId", "clientId", "productId");

-- CreateIndex
CREATE INDEX "ProviderClientProductDiscount_providerId_active_idx" ON "ProviderClientProductDiscount"("providerId", "active");

-- CreateIndex
CREATE INDEX "ProviderClientProductDiscount_clientId_active_idx" ON "ProviderClientProductDiscount"("clientId", "active");

-- CreateIndex
CREATE INDEX "ProviderClientProductDiscount_productId_active_idx" ON "ProviderClientProductDiscount"("productId", "active");

-- AddForeignKey
ALTER TABLE "ProviderClientProductDiscount" ADD CONSTRAINT "ProviderClientProductDiscount_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderClientProductDiscount" ADD CONSTRAINT "ProviderClientProductDiscount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderClientProductDiscount" ADD CONSTRAINT "ProviderClientProductDiscount_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
