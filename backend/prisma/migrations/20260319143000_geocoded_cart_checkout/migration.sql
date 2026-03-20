ALTER TABLE "User"
ADD COLUMN "providerServiceRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 10.0;

ALTER TABLE "City"
ADD COLUMN "maxDeliveryRadiusKm" DOUBLE PRECISION;

ALTER TABLE "Order"
ADD COLUMN "postalCode" TEXT,
ADD COLUMN "addressReference" TEXT,
ADD COLUMN "discoveryRadiusKm" DOUBLE PRECISION;

ALTER TABLE "ProviderOrder"
ADD COLUMN "deliveryDistanceKm" DECIMAL(10, 2),
ADD COLUMN "coverageLimitKm" DECIMAL(10, 2);
