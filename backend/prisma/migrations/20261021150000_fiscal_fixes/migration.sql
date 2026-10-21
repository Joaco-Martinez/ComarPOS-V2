-- Desglose de IVA por alicuota declarado a AFIP
ALTER TABLE "InvoiceAfip" ADD COLUMN "ivaDetalle" JSONB;

-- Lock de emision AFIP por venta
ALTER TABLE "Sale" ADD COLUMN "afipProcessingUntil" TIMESTAMP(3);

-- Liquidacion de IVA por dueno (CUIT) con multi-facturacion
ALTER TABLE "VatSettlement" ADD COLUMN "arcaConfigId" TEXT;
DROP INDEX "VatSettlement_tenantId_year_month_key";
CREATE UNIQUE INDEX "VatSettlement_tenantId_arcaConfigId_year_month_key" ON "VatSettlement"("tenantId", "arcaConfigId", "year", "month");

-- Las ventas "espejo" de las notas de credito no son ventas reales: quedan
-- CANCELLED para no sumar como ingreso en reportes/caja/dashboard.
UPDATE "Sale" s
SET "status" = 'CANCELLED', "isNoteCredit" = true
FROM "InvoiceAfip" i
WHERE i."saleId" = s."id" AND i."relatedInvoiceId" IS NOT NULL;
