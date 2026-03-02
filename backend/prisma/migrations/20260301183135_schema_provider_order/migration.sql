/*
  Warnings:

  - The `status` column on the `Order` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `orderId` on the `OrderItem` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[providerOrderId,productId]` on the table `OrderItem` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId]` on the table `RunnerProfile` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `providerOrderId` to the `OrderItem` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'CONFIRMED', 'READY_FOR_ASSIGNMENT', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProviderOrderStatus" AS ENUM ('PENDING', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'PICKED_UP', 'REJECTED_BY_STORE', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_orderId_fkey";

-- DropIndex
DROP INDEX "idx_orderitem_orderId";

-- DropIndex
DROP INDEX "idx_runnerprofile_userId";

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "City" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable Order status gracefully
ALTER TABLE "Order" ADD COLUMN "new_status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING';

-- Map statuses before dropping the old column
UPDATE "Order" SET "new_status" = "status"::text::"DeliveryStatus" WHERE "status" IS NOT NULL;

ALTER TABLE "Order" DROP COLUMN "status";
ALTER TABLE "Order" RENAME COLUMN "new_status" TO "status";
ALTER TABLE "Order" ALTER COLUMN "id" DROP DEFAULT;

-- (OrderItem alterations moved below ProviderOrder creation to allow safe backfilling)

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RunnerProfile" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "id" DROP DEFAULT;

-- DropEnum
DROP TYPE "OrderStatus";

-- CreateTable
CREATE TABLE "ProviderOrder" (
    "id" UUID NOT NULL,
    "status" "ProviderOrderStatus" NOT NULL DEFAULT 'PENDING',
    "subtotal" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orderId" UUID NOT NULL,
    "providerId" UUID NOT NULL,

    CONSTRAINT "ProviderOrder_pkey" PRIMARY KEY ("id")
);

-- Safely Migrate Data from OrderItem to ProviderOrder
ALTER TABLE "OrderItem" ADD COLUMN "providerOrderId" UUID;
ALTER TABLE "OrderItem" ALTER COLUMN "id" DROP DEFAULT;

-- Insert ProviderOrder mapping records
INSERT INTO "ProviderOrder" ("id", "orderId", "providerId", "subtotal", "updatedAt")
SELECT gen_random_uuid(), oi."orderId", p."providerId", SUM(oi.quantity * oi."priceAtPurchase"), CURRENT_TIMESTAMP
FROM "OrderItem" oi
JOIN "Product" p ON p."id" = oi."productId"
GROUP BY oi."orderId", p."providerId";

-- Link OrderItems to newly created ProviderOrders
UPDATE "OrderItem" oi
SET "providerOrderId" = po."id"
FROM "ProviderOrder" po, "Product" p
WHERE p."id" = oi."productId"
  AND po."orderId" = oi."orderId"
  AND po."providerId" = p."providerId";

-- Drop unlinked orphans from OrderItem (should be 0 if db is normalized)
DELETE FROM "OrderItem" WHERE "providerOrderId" IS NULL;

-- Enforce constraints
ALTER TABLE "OrderItem" ALTER COLUMN "providerOrderId" SET NOT NULL;
ALTER TABLE "OrderItem" DROP COLUMN "orderId";

-- CreateIndex
CREATE INDEX "ProviderOrder_orderId_idx" ON "ProviderOrder"("orderId");

-- CreateIndex
CREATE INDEX "ProviderOrder_providerId_idx" ON "ProviderOrder"("providerId");

-- CreateIndex
CREATE INDEX "ProviderOrder_status_idx" ON "ProviderOrder"("status");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "OrderItem_providerOrderId_idx" ON "OrderItem"("providerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_providerOrderId_productId_key" ON "OrderItem"("providerOrderId", "productId");

-- CreateIndex
CREATE INDEX "Product_cityId_idx" ON "Product"("cityId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "RunnerProfile_userId_key" ON "RunnerProfile"("userId");

-- AddForeignKey
ALTER TABLE "ProviderOrder" ADD CONSTRAINT "ProviderOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderOrder" ADD CONSTRAINT "ProviderOrder_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_providerOrderId_fkey" FOREIGN KEY ("providerOrderId") REFERENCES "ProviderOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_order_cityId" RENAME TO "Order_cityId_idx";

-- RenameIndex
ALTER INDEX "idx_order_clientId" RENAME TO "Order_clientId_idx";

-- RenameIndex
ALTER INDEX "idx_order_runnerId" RENAME TO "Order_runnerId_idx";

-- RenameIndex
ALTER INDEX "idx_orderitem_productId" RENAME TO "OrderItem_productId_idx";

-- RenameIndex
ALTER INDEX "idx_product_providerId" RENAME TO "Product_providerId_idx";
