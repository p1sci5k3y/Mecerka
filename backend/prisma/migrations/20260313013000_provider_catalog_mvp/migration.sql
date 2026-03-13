-- CreateEnum
CREATE TYPE "ProductImportJobStatus" AS ENUM ('VALIDATING', 'VALIDATED', 'APPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProductImportFormat" AS ENUM ('CSV', 'XLSX');

-- CreateTable
CREATE TABLE "Provider" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "cityId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "workshopHistory" TEXT NOT NULL,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videoUrl" TEXT,
    "websiteUrl" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Product"
ADD COLUMN "reference" TEXT,
ADD COLUMN "discountPrice" DECIMAL(10,2);

-- Backfill existing products to keep the migration safe on populated environments
UPDATE "Product"
SET "reference" = CAST("id" AS TEXT)
WHERE "reference" IS NULL;

-- AlterTable
ALTER TABLE "Product"
ALTER COLUMN "reference" SET NOT NULL;

-- CreateTable
CREATE TABLE "ProductImportJob" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "status" "ProductImportJobStatus" NOT NULL DEFAULT 'VALIDATING',
    "format" "ProductImportFormat" NOT NULL,
    "filename" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "validationErrors" JSONB,
    "payload" JSONB,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Provider_userId_key" ON "Provider"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_slug_key" ON "Provider"("slug");

-- CreateIndex
CREATE INDEX "Provider_userId_idx" ON "Provider"("userId");

-- CreateIndex
CREATE INDEX "Provider_cityId_idx" ON "Provider"("cityId");

-- CreateIndex
CREATE INDEX "Provider_categoryId_idx" ON "Provider"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_providerId_reference_key" ON "Product"("providerId", "reference");

-- CreateIndex
CREATE INDEX "ProductImportJob_providerId_status_idx" ON "ProductImportJob"("providerId", "status");

-- CreateIndex
CREATE INDEX "ProductImportJob_createdAt_idx" ON "ProductImportJob"("createdAt");

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImportJob" ADD CONSTRAINT "ProductImportJob_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
