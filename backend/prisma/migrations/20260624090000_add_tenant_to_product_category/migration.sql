-- Agrega tenantId a ProductCategory (doc seccion 6 - multi-tenant).
-- Esta tabla habia quedado afuera del scaffolding original (20260620140000) y
-- del backfill (20260623120000): las categorias eran globales y se filtraban
-- entre todos los tenants. Aditiva y no destructiva, mismo patron que las
-- migraciones anteriores: agrega la columna NULLABLE + FK + index, y de una
-- backfillea las filas existentes al tenant default "grupo-vj".

ALTER TABLE "ProductCategory" ADD COLUMN "tenantId" TEXT;

CREATE INDEX "ProductCategory_tenantId_idx" ON "ProductCategory"("tenantId");

ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "ProductCategory"
SET "tenantId" = (SELECT id FROM "Tenant" WHERE slug = 'grupo-vj')
WHERE "tenantId" IS NULL;
