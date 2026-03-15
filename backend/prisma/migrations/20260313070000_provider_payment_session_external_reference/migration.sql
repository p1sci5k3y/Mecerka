ALTER TABLE "ProviderPaymentSession"
ADD COLUMN "externalSessionId" TEXT;

CREATE UNIQUE INDEX "ProviderPaymentSession_externalSessionId_key"
ON "ProviderPaymentSession"("externalSessionId");
