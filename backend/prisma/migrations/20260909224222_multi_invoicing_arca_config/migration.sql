-- DropIndex
DROP INDEX "CbteCounter_tenantId_ptoVta_cbteTipo_key";

-- DropIndex
DROP INDEX "InvoiceAfip_puntoVenta_tipoComprobante_numero_key";

-- AlterTable
ALTER TABLE "CbteCounter" ADD COLUMN     "arcaConfigId" TEXT;

-- AlterTable
ALTER TABLE "InvoiceAfip" ADD COLUMN     "arcaConfigId" TEXT;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "arcaConfigId" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "requestedArcaConfigId" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "multiInvoicingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "CbteCounter_arcaConfigId_idx" ON "CbteCounter"("arcaConfigId");

-- CreateIndex
CREATE UNIQUE INDEX "CbteCounter_tenantId_arcaConfigId_ptoVta_cbteTipo_key" ON "CbteCounter"("tenantId", "arcaConfigId", "ptoVta", "cbteTipo");

-- CreateIndex
CREATE INDEX "InvoiceAfip_arcaConfigId_idx" ON "InvoiceAfip"("arcaConfigId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceAfip_cuit_puntoVenta_tipoComprobante_numero_key" ON "InvoiceAfip"("cuit", "puntoVenta", "tipoComprobante", "numero");

-- CreateIndex
CREATE INDEX "Purchase_arcaConfigId_idx" ON "Purchase"("arcaConfigId");

-- CreateIndex
CREATE INDEX "Sale_requestedArcaConfigId_idx" ON "Sale"("requestedArcaConfigId");

-- AddForeignKey
ALTER TABLE "CbteCounter" ADD CONSTRAINT "CbteCounter_arcaConfigId_fkey" FOREIGN KEY ("arcaConfigId") REFERENCES "ArcaConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAfip" ADD CONSTRAINT "InvoiceAfip_arcaConfigId_fkey" FOREIGN KEY ("arcaConfigId") REFERENCES "ArcaConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_requestedArcaConfigId_fkey" FOREIGN KEY ("requestedArcaConfigId") REFERENCES "ArcaConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_arcaConfigId_fkey" FOREIGN KEY ("arcaConfigId") REFERENCES "ArcaConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

