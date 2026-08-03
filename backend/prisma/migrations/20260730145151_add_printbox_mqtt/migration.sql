-- CreateEnum
CREATE TYPE "PrintboxDeviceStatus" AS ENUM ('PENDING_PAIRING', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('QUEUED', 'PUBLISHED', 'ACKED', 'FAILED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "printboxMqttPasswordEncrypted" TEXT,
ADD COLUMN     "printboxMqttUsername" TEXT,
ADD COLUMN     "ticketAddress" TEXT,
ADD COLUMN     "ticketBusinessName" TEXT,
ADD COLUMN     "ticketCuit" TEXT,
ADD COLUMN     "ticketPhone" TEXT;

-- CreateTable
CREATE TABLE "PrintboxDevice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PrintboxDeviceStatus" NOT NULL DEFAULT 'PENDING_PAIRING',
    "hardwareId" TEXT,
    "printerIp" TEXT,
    "pairingCode" TEXT,
    "pairingCodeExpiresAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintboxDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT,
    "saleId" TEXT,
    "payload" JSONB NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'QUEUED',
    "publishedAt" TIMESTAMP(3),
    "ackedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrintboxDevice_hardwareId_key" ON "PrintboxDevice"("hardwareId");

-- CreateIndex
CREATE UNIQUE INDEX "PrintboxDevice_pairingCode_key" ON "PrintboxDevice"("pairingCode");

-- CreateIndex
CREATE INDEX "PrintboxDevice_tenantId_idx" ON "PrintboxDevice"("tenantId");

-- CreateIndex
CREATE INDEX "PrintboxDevice_status_idx" ON "PrintboxDevice"("status");

-- CreateIndex
CREATE INDEX "PrintJob_tenantId_idx" ON "PrintJob"("tenantId");

-- CreateIndex
CREATE INDEX "PrintJob_deviceId_idx" ON "PrintJob"("deviceId");

-- CreateIndex
CREATE INDEX "PrintJob_status_idx" ON "PrintJob"("status");

-- CreateIndex
CREATE INDEX "PrintJob_createdAt_idx" ON "PrintJob"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_printboxMqttUsername_key" ON "Tenant"("printboxMqttUsername");

-- AddForeignKey
ALTER TABLE "PrintboxDevice" ADD CONSTRAINT "PrintboxDevice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "PrintboxDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

