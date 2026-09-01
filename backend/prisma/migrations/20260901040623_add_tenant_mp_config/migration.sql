-- CreateEnum
CREATE TYPE "TenantMpConfigStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'ERROR');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "mpPaymentId" TEXT,
ADD COLUMN     "mpPreferenceId" TEXT;

-- CreateTable
CREATE TABLE "TenantMpConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "publicKey" TEXT,
    "accessTokenEncrypted" TEXT,
    "status" "TenantMpConfigStatus" NOT NULL DEFAULT 'INACTIVE',
    "lastError" TEXT,
    "lastCheckAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantMpConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantMpConfig_tenantId_key" ON "TenantMpConfig"("tenantId");

-- CreateIndex
CREATE INDEX "TenantMpConfig_tenantId_idx" ON "TenantMpConfig"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantMpConfig" ADD CONSTRAINT "TenantMpConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
