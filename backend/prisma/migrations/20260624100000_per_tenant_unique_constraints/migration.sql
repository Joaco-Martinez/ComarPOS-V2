-- Pasa los uniques globales que quedaban como gap conocido (doc seccion 6) a
-- ser compuestos por tenant: User.email, Client.dni, Client.gmail, Product.sku
-- y CbteCounter(ptoVta,cbteTipo). Antes de este cambio dos tenants no podian
-- tener, por ejemplo, el mismo email de usuario o el mismo SKU de producto.
-- Asume que todas las filas existentes ya tienen tenantId seteado (backfill
-- de 20260623120000); si quedara alguna fila con tenantId NULL en estas
-- tablas, comparten "no tenant" entre si (NULL <> NULL en Postgres) y no
-- chocan con las de un tenant real.

DROP INDEX "User_email_key";
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

DROP INDEX "Client_dni_key";
CREATE UNIQUE INDEX "Client_tenantId_dni_key" ON "Client"("tenantId", "dni");

DROP INDEX "Client_gmail_key";
CREATE UNIQUE INDEX "Client_tenantId_gmail_key" ON "Client"("tenantId", "gmail");

DROP INDEX "Product_sku_key";
CREATE UNIQUE INDEX "Product_tenantId_sku_key" ON "Product"("tenantId", "sku");

-- CbteCounter no tenia tenantId todavia (quedo afuera del scaffolding
-- original junto con ProductCategory): se agrega columna + FK + backfill al
-- tenant default, igual que se hizo con ProductCategory en la migracion
-- anterior, y recien ahi se puede armar el unique compuesto.
ALTER TABLE "CbteCounter" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "CbteCounter_tenantId_idx" ON "CbteCounter"("tenantId");
ALTER TABLE "CbteCounter" ADD CONSTRAINT "CbteCounter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "CbteCounter"
SET "tenantId" = (SELECT id FROM "Tenant" WHERE slug = 'grupo-vj')
WHERE "tenantId" IS NULL;

DROP INDEX "CbteCounter_ptoVta_cbteTipo_key";
CREATE UNIQUE INDEX "CbteCounter_tenantId_ptoVta_cbteTipo_key" ON "CbteCounter"("tenantId", "ptoVta", "cbteTipo");
