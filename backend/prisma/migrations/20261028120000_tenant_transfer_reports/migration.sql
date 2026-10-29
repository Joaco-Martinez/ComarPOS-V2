-- CreateEnum
CREATE TYPE "BillingPaymentMethod" AS ENUM ('ANY', 'MERCADOPAGO', 'TRANSFER');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "billingPaymentMethod" "BillingPaymentMethod" NOT NULL DEFAULT 'ANY';

-- CreateEnum
CREATE TYPE "TransferReportStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "TenantTransferReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reference" TEXT NOT NULL,
    "payerName" TEXT,
    "note" TEXT,
    "status" "TransferReportStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "platformAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantTransferReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantTransferReport_tenantId_idx" ON "TenantTransferReport"("tenantId");

-- CreateIndex
CREATE INDEX "TenantTransferReport_status_idx" ON "TenantTransferReport"("status");

-- AddForeignKey
ALTER TABLE "TenantTransferReport" ADD CONSTRAINT "TenantTransferReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantTransferReport" ADD CONSTRAINT "TenantTransferReport_platformAdminId_fkey" FOREIGN KEY ("platformAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);
