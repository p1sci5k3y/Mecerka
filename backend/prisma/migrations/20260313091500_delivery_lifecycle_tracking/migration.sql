ALTER TABLE "DeliveryOrder"
ADD COLUMN "pickupAt" TIMESTAMP(3),
ADD COLUMN "transitAt" TIMESTAMP(3),
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "deliveryProofUrl" TEXT,
ADD COLUMN "deliveryNotes" TEXT;
