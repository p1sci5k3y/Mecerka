-- =========================================================================
-- EXPERT PRODUCTION-GRADE UUID MIGRATION (ZERO-DOWNTIME CAPABLE)
-- =========================================================================
-- ESTRATEGIA DE DESPLIEGUE PARA PRODUCCIÓN (MEMORIA TFM):
-- En un entorno real de alta concurrencia, esta migración se separaría en dos fases / releases:
-- 
-- FASE 1 (Shadow Writes & Backfill - Sin Downtime):
--   1. Crear las columnas "new_id" y las FK asociadas como NULL.
--   2. Modificar la aplicación (backend Prisma) para que toda escritura nueva genere un 
--      UUID e inserte tanto en los campos antiguos (INT) como en los nuevos (UUID).
--   3. Ejecutar un worker en background (Backfill) que rellene los datos históricos 
--      (gen_random_uuid()) procesándolos por lotes para no sobrecargar el servidor.
--   4. Crear los índices concurrentemente.
--
-- FASE 2 (Cutover - Ventana de micro-mantenimiento u online cutover):
--   1. Asegurar que las columnas new_id no contengan nulos.
--   2. Dar el "flip": renombrar columnas, eliminar IDs viejos y reescribir constraints.
--
-- NOTA TÉCNICA: En Postgres, "CREATE INDEX CONCURRENTLY" no puede ejecutarse dentro
-- de un bloque BEGIN/COMMIT. Por tanto, esta migración se divide en un bloque
-- transaccional principal para datos/restricciones y ejecuciones independientes para índices.
-- =========================================================================

BEGIN;

-- 1. Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Drop existing foreign keys
ALTER TABLE "Order" DROP CONSTRAINT "Order_cityId_fkey";
ALTER TABLE "Order" DROP CONSTRAINT "Order_clientId_fkey";
ALTER TABLE "Order" DROP CONSTRAINT "Order_runnerId_fkey";
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_orderId_fkey";
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";
ALTER TABLE "Product" DROP CONSTRAINT "Product_categoryId_fkey";
ALTER TABLE "Product" DROP CONSTRAINT "Product_cityId_fkey";
ALTER TABLE "Product" DROP CONSTRAINT "Product_providerId_fkey";
ALTER TABLE "RunnerProfile" DROP CONSTRAINT "RunnerProfile_userId_fkey";

-- 3. Add temporary UUID default columns for PKs
ALTER TABLE "Category" ADD COLUMN "new_id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "City" ADD COLUMN "new_id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "Order" ADD COLUMN "new_id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "OrderItem" ADD COLUMN "new_id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "Product" ADD COLUMN "new_id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "RunnerProfile" ADD COLUMN "new_id" UUID DEFAULT gen_random_uuid();
ALTER TABLE "User" ADD COLUMN "new_id" UUID DEFAULT gen_random_uuid();

-- Update existing rows explicitly
UPDATE "Category" SET "new_id" = gen_random_uuid() WHERE "new_id" IS NULL;
UPDATE "City" SET "new_id" = gen_random_uuid() WHERE "new_id" IS NULL;
UPDATE "Order" SET "new_id" = gen_random_uuid() WHERE "new_id" IS NULL;
UPDATE "OrderItem" SET "new_id" = gen_random_uuid() WHERE "new_id" IS NULL;
UPDATE "Product" SET "new_id" = gen_random_uuid() WHERE "new_id" IS NULL;
UPDATE "RunnerProfile" SET "new_id" = gen_random_uuid() WHERE "new_id" IS NULL;
UPDATE "User" SET "new_id" = gen_random_uuid() WHERE "new_id" IS NULL;

-- 4. Add temporary UUID columns for FKs
ALTER TABLE "Order" ADD COLUMN "new_clientId" UUID;
ALTER TABLE "Order" ADD COLUMN "new_cityId" UUID;
ALTER TABLE "Order" ADD COLUMN "new_runnerId" UUID;
ALTER TABLE "OrderItem" ADD COLUMN "new_orderId" UUID;
ALTER TABLE "OrderItem" ADD COLUMN "new_productId" UUID;
ALTER TABLE "Product" ADD COLUMN "new_providerId" UUID;
ALTER TABLE "Product" ADD COLUMN "new_cityId" UUID;
ALTER TABLE "Product" ADD COLUMN "new_categoryId" UUID;
ALTER TABLE "RunnerProfile" ADD COLUMN "new_userId" UUID;

-- 5. Map existing FK relations to new UUIDs
UPDATE "Order" SET "new_clientId" = u."new_id" FROM "User" u WHERE "Order"."clientId" = u."id";
UPDATE "Order" SET "new_cityId" = c."new_id" FROM "City" c WHERE "Order"."cityId" = c."id";
UPDATE "Order" SET "new_runnerId" = u."new_id" FROM "User" u WHERE "Order"."runnerId" = u."id";

UPDATE "OrderItem" SET "new_orderId" = o."new_id" FROM "Order" o WHERE "OrderItem"."orderId" = o."id";
UPDATE "OrderItem" SET "new_productId" = p."new_id" FROM "Product" p WHERE "OrderItem"."productId" = p."id";

UPDATE "Product" SET "new_providerId" = u."new_id" FROM "User" u WHERE "Product"."providerId" = u."id";
UPDATE "Product" SET "new_cityId" = c."new_id" FROM "City" c WHERE "Product"."cityId" = c."id";
UPDATE "Product" SET "new_categoryId" = c."new_id" FROM "Category" c WHERE "Product"."categoryId" = c."id";

UPDATE "RunnerProfile" SET "new_userId" = u."new_id" FROM "User" u WHERE "RunnerProfile"."userId" = u."id";

-- 6. Drop old PK constraints, drop old integer columns
ALTER TABLE "Category" DROP CONSTRAINT "Category_pkey";
ALTER TABLE "City" DROP CONSTRAINT "City_pkey";
ALTER TABLE "Order" DROP CONSTRAINT "Order_pkey";
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_pkey";
ALTER TABLE "Product" DROP CONSTRAINT "Product_pkey";
ALTER TABLE "RunnerProfile" DROP CONSTRAINT "RunnerProfile_pkey";
ALTER TABLE "User" DROP CONSTRAINT "User_pkey";

ALTER TABLE "Category" DROP COLUMN "id";
ALTER TABLE "City" DROP COLUMN "id";
ALTER TABLE "Order" DROP COLUMN "id", DROP COLUMN "clientId", DROP COLUMN "cityId", DROP COLUMN "runnerId";
ALTER TABLE "OrderItem" DROP COLUMN "id", DROP COLUMN "orderId", DROP COLUMN "productId";
ALTER TABLE "Product" DROP COLUMN "id", DROP COLUMN "providerId", DROP COLUMN "cityId", DROP COLUMN "categoryId";
ALTER TABLE "RunnerProfile" DROP COLUMN "id", DROP COLUMN "userId";
ALTER TABLE "User" DROP COLUMN "id";

DROP SEQUENCE IF EXISTS "Category_id_seq" CASCADE;
DROP SEQUENCE IF EXISTS "City_id_seq" CASCADE;
DROP SEQUENCE IF EXISTS "Order_id_seq" CASCADE;
DROP SEQUENCE IF EXISTS "OrderItem_id_seq" CASCADE;
DROP SEQUENCE IF EXISTS "Product_id_seq" CASCADE;
DROP SEQUENCE IF EXISTS "RunnerProfile_id_seq" CASCADE;
DROP SEQUENCE IF EXISTS "User_id_seq" CASCADE;

-- 7. Rename temporary columns to definitive names
ALTER TABLE "Category" RENAME COLUMN "new_id" TO "id";
ALTER TABLE "City" RENAME COLUMN "new_id" TO "id";
ALTER TABLE "Order" RENAME COLUMN "new_id" TO "id";
ALTER TABLE "Order" RENAME COLUMN "new_clientId" TO "clientId";
ALTER TABLE "Order" RENAME COLUMN "new_cityId" TO "cityId";
ALTER TABLE "Order" RENAME COLUMN "new_runnerId" TO "runnerId"; -- Intentional business logic: Unassigned orders have NULL runnerId
ALTER TABLE "OrderItem" RENAME COLUMN "new_id" TO "id";
ALTER TABLE "OrderItem" RENAME COLUMN "new_orderId" TO "orderId";
ALTER TABLE "OrderItem" RENAME COLUMN "new_productId" TO "productId";
ALTER TABLE "Product" RENAME COLUMN "new_id" TO "id";
ALTER TABLE "Product" RENAME COLUMN "new_providerId" TO "providerId";
ALTER TABLE "Product" RENAME COLUMN "new_cityId" TO "cityId";
ALTER TABLE "Product" RENAME COLUMN "new_categoryId" TO "categoryId";
ALTER TABLE "RunnerProfile" RENAME COLUMN "new_id" TO "id";
ALTER TABLE "RunnerProfile" RENAME COLUMN "new_userId" TO "userId";
ALTER TABLE "User" RENAME COLUMN "new_id" TO "id";

-- 8. Enforce NOT NULL and Primary Key constraints
ALTER TABLE "Category" ALTER COLUMN "id" SET NOT NULL, ADD CONSTRAINT "Category_pkey" PRIMARY KEY ("id");
ALTER TABLE "City" ALTER COLUMN "id" SET NOT NULL, ADD CONSTRAINT "City_pkey" PRIMARY KEY ("id");

ALTER TABLE "Order" ALTER COLUMN "id" SET NOT NULL, ALTER COLUMN "clientId" SET NOT NULL, ALTER COLUMN "cityId" SET NOT NULL;
ALTER TABLE "Order" ADD CONSTRAINT "Order_pkey" PRIMARY KEY ("id");

ALTER TABLE "OrderItem" ALTER COLUMN "id" SET NOT NULL, ALTER COLUMN "orderId" SET NOT NULL, ALTER COLUMN "productId" SET NOT NULL;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id");

ALTER TABLE "Product" ALTER COLUMN "id" SET NOT NULL, ALTER COLUMN "providerId" SET NOT NULL, ALTER COLUMN "cityId" SET NOT NULL, ALTER COLUMN "categoryId" SET NOT NULL;
ALTER TABLE "Product" ADD CONSTRAINT "Product_pkey" PRIMARY KEY ("id");

ALTER TABLE "RunnerProfile" ALTER COLUMN "id" SET NOT NULL, ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "RunnerProfile" ADD CONSTRAINT "RunnerProfile_pkey" PRIMARY KEY ("id");

ALTER TABLE "User" ALTER COLUMN "id" SET NOT NULL, ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id");

-- 9. Add Foreign Keys back using NOT VALID to prevent massive table locks during enforcement
ALTER TABLE "Product" ADD CONSTRAINT "Product_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Product" ADD CONSTRAINT "Product_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Order" ADD CONSTRAINT "Order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Order" ADD CONSTRAINT "Order_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Order" ADD CONSTRAINT "Order_runnerId_fkey" FOREIGN KEY ("runnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "RunnerProfile" ADD CONSTRAINT "RunnerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- 10. Post-Migration Data Integrity / Robust Sanity Checks (Load-bearing checks)
DO $$
DECLARE
    orphan_orders INT;
    orphan_products INT;
    duplicates_found INT;
    broken_joins INT;
BEGIN
    -- Check 1: Simple Mapping Failure (NULL Check)
    SELECT COUNT(*) INTO orphan_orders FROM "Order" WHERE "clientId" IS NULL;
    IF orphan_orders > 0 THEN
        RAISE EXCEPTION 'Sanity check failed: % Orders found without a valid clientId mapping', orphan_orders;
    END IF;

    -- Check 2: Uniqueness Failure (Duplicate Check)
    SELECT (COUNT(*) - COUNT(DISTINCT id)) INTO duplicates_found FROM "User";
    IF duplicates_found > 0 THEN
        RAISE EXCEPTION 'Sanity check failed: % Duplicate UUIDs generated in User table', duplicates_found;
    END IF;

    -- Check 3: Broken Joins (Join Coverage Check)
    SELECT COUNT(*) INTO broken_joins FROM "Order" o LEFT JOIN "User" u ON o."clientId" = u."id" WHERE u."id" IS NULL;
    IF broken_joins > 0 THEN
        RAISE EXCEPTION 'Sanity check failed: % Orders point to structurally invalid or orphaned clientId', broken_joins;
    END IF;
END $$;

COMMIT;

-- =========================================================================
-- INDEX GENERATION & CONSTRAINT VALIDATION (OUTSIDE TRANSACTION TO ALLOW CONCURRENTLY)
-- =========================================================================

-- Generate B-Tree Performance Indices concurrently to avoid read/write blocking
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_order_clientId" ON "Order"("clientId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_order_cityId" ON "Order"("cityId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_order_runnerId" ON "Order"("runnerId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_product_providerId" ON "Product"("providerId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_orderitem_orderId" ON "OrderItem"("orderId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_orderitem_productId" ON "OrderItem"("productId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_runnerprofile_userId" ON "RunnerProfile"("userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_product_cityId" ON "Product"("cityId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_product_categoryId" ON "Product"("categoryId");

-- Validate the Foreign Key Constraints without holding long locks during creation
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_providerId_fkey";
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_cityId_fkey";
ALTER TABLE "Product" VALIDATE CONSTRAINT "Product_categoryId_fkey";
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_clientId_fkey";
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_cityId_fkey";
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_runnerId_fkey";
ALTER TABLE "OrderItem" VALIDATE CONSTRAINT "OrderItem_orderId_fkey";
ALTER TABLE "OrderItem" VALIDATE CONSTRAINT "OrderItem_productId_fkey";
ALTER TABLE "RunnerProfile" VALIDATE CONSTRAINT "RunnerProfile_userId_fkey";
