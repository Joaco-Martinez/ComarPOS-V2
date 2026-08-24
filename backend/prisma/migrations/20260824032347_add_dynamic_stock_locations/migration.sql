-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "businessLocationId" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "stockLocationId" TEXT;

-- AlterTable
ALTER TABLE "StockCount" ADD COLUMN     "businessLocationId" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "fromLocationId" TEXT,
ADD COLUMN     "toLocationId" TEXT;

-- CreateTable
CREATE TABLE "ProductStock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "productId" TEXT NOT NULL,
    "businessLocationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "quantityKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minQuantity" INTEGER,
    "minQuantityKg" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductStock_productId_idx" ON "ProductStock"("productId");

-- CreateIndex
CREATE INDEX "ProductStock_businessLocationId_idx" ON "ProductStock"("businessLocationId");

-- CreateIndex
CREATE INDEX "ProductStock_tenantId_idx" ON "ProductStock"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductStock_productId_businessLocationId_key" ON "ProductStock"("productId", "businessLocationId");

-- CreateIndex
CREATE INDEX "Sale_stockLocationId_idx" ON "Sale"("stockLocationId");

-- CreateIndex
CREATE INDEX "StockCount_businessLocationId_idx" ON "StockCount"("businessLocationId");

-- CreateIndex
CREATE INDEX "StockMovement_fromLocationId_idx" ON "StockMovement"("fromLocationId");

-- CreateIndex
CREATE INDEX "StockMovement_toLocationId_idx" ON "StockMovement"("toLocationId");

-- AddForeignKey
ALTER TABLE "ProductStock" ADD CONSTRAINT "ProductStock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStock" ADD CONSTRAINT "ProductStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStock" ADD CONSTRAINT "ProductStock_businessLocationId_fkey" FOREIGN KEY ("businessLocationId") REFERENCES "BusinessLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_stockLocationId_fkey" FOREIGN KEY ("stockLocationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_businessLocationId_fkey" FOREIGN KEY ("businessLocationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_businessLocationId_fkey" FOREIGN KEY ("businessLocationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data backfill: migra el split fijo Product.stockLocal/stockDeposito (+Kg,
-- +min) y el enum Location de StockMovement/Purchase/Sale/StockCount a
-- BusinessLocation + ProductStock (doc de migracion "ubicaciones de stock
-- dinamicas"). Por cada tenant que tenga productos, ventas, compras,
-- movimientos o conteos, crea 2 BusinessLocation NUEVAS ("Local"/
-- "Depósito") -- no toca ninguna ubicacion default que ya exista (esa es
-- la sucursal/direccion de delivery, un concepto distinto). Las columnas
-- viejas (stockLocal/stockDeposito/etc, from/to/stockLocation/location)
-- se dejan intactas por ahora; se dropean en una migracion de cleanup
-- separada una vez que todo el codigo este migrado y probado.
-- Idempotente: reusa la ubicacion "Local"/"Depósito" si ya existe para
-- ese tenant, y ON CONFLICT/guards evitan duplicar filas si se re-corre.
DO $$
DECLARE
  r RECORD;
  local_id TEXT;
  deposito_id TEXT;
BEGIN
  FOR r IN
    SELECT DISTINCT "tenantId" FROM (
      SELECT "tenantId" FROM "Product"
      UNION SELECT "tenantId" FROM "Sale"
      UNION SELECT "tenantId" FROM "Purchase"
      UNION SELECT "tenantId" FROM "StockMovement"
      UNION SELECT "tenantId" FROM "StockCount"
    ) t
  LOOP
    SELECT id INTO local_id FROM "BusinessLocation"
      WHERE name = 'Local' AND "tenantId" IS NOT DISTINCT FROM r."tenantId"
      LIMIT 1;
    IF local_id IS NULL THEN
      local_id := gen_random_uuid()::text;
      INSERT INTO "BusinessLocation" (id, "tenantId", name, type, "isDefault", "isActive", "createdAt", "updatedAt")
      VALUES (local_id, r."tenantId", 'Local', 'STORE', false, true, NOW(), NOW());
    END IF;

    SELECT id INTO deposito_id FROM "BusinessLocation"
      WHERE name = 'Depósito' AND "tenantId" IS NOT DISTINCT FROM r."tenantId"
      LIMIT 1;
    IF deposito_id IS NULL THEN
      deposito_id := gen_random_uuid()::text;
      INSERT INTO "BusinessLocation" (id, "tenantId", name, type, "isDefault", "isActive", "createdAt", "updatedAt")
      VALUES (deposito_id, r."tenantId", 'Depósito', 'WAREHOUSE', false, true, NOW(), NOW());
    END IF;

    INSERT INTO "ProductStock" (id, "tenantId", "productId", "businessLocationId", quantity, "quantityKg", "minQuantity", "minQuantityKg", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, p."tenantId", p.id, local_id, p."stockLocal", p."stockLocalKg", p."minStock", p."minStockKg", NOW(), NOW()
    FROM "Product" p
    WHERE p."tenantId" IS NOT DISTINCT FROM r."tenantId"
    ON CONFLICT ("productId", "businessLocationId") DO NOTHING;

    INSERT INTO "ProductStock" (id, "tenantId", "productId", "businessLocationId", quantity, "quantityKg", "minQuantity", "minQuantityKg", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, p."tenantId", p.id, deposito_id, p."stockDeposito", p."stockDepositoKg", p."minStockDeposito", p."minStockDepositoKg", NOW(), NOW()
    FROM "Product" p
    WHERE p."tenantId" IS NOT DISTINCT FROM r."tenantId"
    ON CONFLICT ("productId", "businessLocationId") DO NOTHING;

    UPDATE "StockMovement" SET "fromLocationId" = local_id
      WHERE "from" = 'LOCAL' AND "tenantId" IS NOT DISTINCT FROM r."tenantId" AND "fromLocationId" IS NULL;
    UPDATE "StockMovement" SET "fromLocationId" = deposito_id
      WHERE "from" = 'DEPOSITO' AND "tenantId" IS NOT DISTINCT FROM r."tenantId" AND "fromLocationId" IS NULL;
    UPDATE "StockMovement" SET "toLocationId" = local_id
      WHERE "to" = 'LOCAL' AND "tenantId" IS NOT DISTINCT FROM r."tenantId" AND "toLocationId" IS NULL;
    UPDATE "StockMovement" SET "toLocationId" = deposito_id
      WHERE "to" = 'DEPOSITO' AND "tenantId" IS NOT DISTINCT FROM r."tenantId" AND "toLocationId" IS NULL;

    UPDATE "Purchase" SET "businessLocationId" = local_id
      WHERE "to" = 'LOCAL' AND "tenantId" IS NOT DISTINCT FROM r."tenantId" AND "businessLocationId" IS NULL;
    UPDATE "Purchase" SET "businessLocationId" = deposito_id
      WHERE "to" = 'DEPOSITO' AND "tenantId" IS NOT DISTINCT FROM r."tenantId" AND "businessLocationId" IS NULL;

    UPDATE "Sale" SET "stockLocationId" = local_id
      WHERE "stockLocation" = 'LOCAL' AND "tenantId" IS NOT DISTINCT FROM r."tenantId" AND "stockLocationId" IS NULL;
    UPDATE "Sale" SET "stockLocationId" = deposito_id
      WHERE "stockLocation" = 'DEPOSITO' AND "tenantId" IS NOT DISTINCT FROM r."tenantId" AND "stockLocationId" IS NULL;

    UPDATE "StockCount" SET "businessLocationId" = local_id
      WHERE "location" = 'LOCAL' AND "tenantId" IS NOT DISTINCT FROM r."tenantId" AND "businessLocationId" IS NULL;
    UPDATE "StockCount" SET "businessLocationId" = deposito_id
      WHERE "location" = 'DEPOSITO' AND "tenantId" IS NOT DISTINCT FROM r."tenantId" AND "businessLocationId" IS NULL;
  END LOOP;
END $$;
