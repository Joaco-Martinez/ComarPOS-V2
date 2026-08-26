-- CreateEnum
CREATE TYPE "VatSettlementStatus" AS ENUM ('BORRADOR', 'CERRADO');

-- CreateEnum
CREATE TYPE "VatSettlementResult" AS ENUM ('A_PAGAR', 'A_FAVOR');

-- CreateEnum
CREATE TYPE "SupplierAccountMovementType" AS ENUM ('COMPRA', 'PAGO', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO');

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "currentBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "VatSettlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "debitoFiscal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creditoFiscal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "saldoTecnicoAnterior" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "saldoTecnico" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "resultado" "VatSettlementResult" NOT NULL,
    "status" "VatSettlementStatus" NOT NULL DEFAULT 'BORRADOR',
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VatSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierAccountMovement" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "userId" TEXT,
    "type" "SupplierAccountMovementType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "previousBalance" DOUBLE PRECISION NOT NULL,
    "newBalance" DOUBLE PRECISION NOT NULL,
    "paymentMethod" "PaymentMethod",
    "reference" TEXT,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierAccountMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VatSettlement_tenantId_idx" ON "VatSettlement"("tenantId");

-- CreateIndex
CREATE INDEX "VatSettlement_status_idx" ON "VatSettlement"("status");

-- CreateIndex
CREATE UNIQUE INDEX "VatSettlement_tenantId_year_month_key" ON "VatSettlement"("tenantId", "year", "month");

-- CreateIndex
CREATE INDEX "SupplierAccountMovement_supplierId_idx" ON "SupplierAccountMovement"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierAccountMovement_purchaseId_idx" ON "SupplierAccountMovement"("purchaseId");

-- CreateIndex
CREATE INDEX "SupplierAccountMovement_type_idx" ON "SupplierAccountMovement"("type");

-- CreateIndex
CREATE INDEX "SupplierAccountMovement_date_idx" ON "SupplierAccountMovement"("date");

-- AddForeignKey
ALTER TABLE "VatSettlement" ADD CONSTRAINT "VatSettlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VatSettlement" ADD CONSTRAINT "VatSettlement_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAccountMovement" ADD CONSTRAINT "SupplierAccountMovement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAccountMovement" ADD CONSTRAINT "SupplierAccountMovement_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAccountMovement" ADD CONSTRAINT "SupplierAccountMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
