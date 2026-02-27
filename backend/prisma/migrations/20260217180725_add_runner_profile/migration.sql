-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryDistanceKm" DECIMAL(10,2),
ADD COLUMN     "runnerBaseFee" DECIMAL(10,2),
ADD COLUMN     "runnerId" INTEGER,
ADD COLUMN     "runnerPerKmFee" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mfaFailedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mfaLockUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RunnerProfile" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "baseLat" DOUBLE PRECISION NOT NULL,
    "baseLng" DOUBLE PRECISION NOT NULL,
    "maxDistanceKm" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "priceBase" DECIMAL(10,2) NOT NULL DEFAULT 2.00,
    "pricePerKm" DECIMAL(10,2) NOT NULL DEFAULT 0.50,
    "minFee" DECIMAL(10,2) NOT NULL DEFAULT 3.00,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ratingAvg" DECIMAL(3,2) NOT NULL DEFAULT 5.0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunnerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RunnerProfile_userId_key" ON "RunnerProfile"("userId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_runnerId_fkey" FOREIGN KEY ("runnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunnerProfile" ADD CONSTRAINT "RunnerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
