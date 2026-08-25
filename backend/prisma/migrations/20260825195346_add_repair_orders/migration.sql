-- CreateEnum
CREATE TYPE "RepairOrderStatus" AS ENUM ('RECEIVED', 'BUDGETED', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RepairOrderItemType" AS ENUM ('PART', 'LABOR');

-- CreateTable
CREATE TABLE "RepairOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "clientId" TEXT,
    "userId" TEXT,
    "businessLocationId" TEXT,
    "deviceType" TEXT NOT NULL,
    "deviceBrand" TEXT,
    "deviceModel" TEXT,
    "deviceSerial" TEXT,
    "deviceAccessories" TEXT,
    "deviceConditionNotes" TEXT,
    "reportedIssue" TEXT NOT NULL,
    "diagnosis" TEXT,
    "status" "RepairOrderStatus" NOT NULL DEFAULT 'RECEIVED',
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "approvalToken" TEXT,
    "approvalTokenExpiresAt" TIMESTAMP(3),
    "budgetedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "estimatedDeliveryDate" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "saleId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairOrderItem" (
    "id" TEXT NOT NULL,
    "repairOrderId" TEXT NOT NULL,
    "type" "RepairOrderItemType" NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RepairOrder_approvalToken_key" ON "RepairOrder"("approvalToken");

-- CreateIndex
CREATE UNIQUE INDEX "RepairOrder_saleId_key" ON "RepairOrder"("saleId");

-- CreateIndex
CREATE INDEX "RepairOrder_tenantId_idx" ON "RepairOrder"("tenantId");

-- CreateIndex
CREATE INDEX "RepairOrder_clientId_idx" ON "RepairOrder"("clientId");

-- CreateIndex
CREATE INDEX "RepairOrder_userId_idx" ON "RepairOrder"("userId");

-- CreateIndex
CREATE INDEX "RepairOrder_businessLocationId_idx" ON "RepairOrder"("businessLocationId");

-- CreateIndex
CREATE INDEX "RepairOrder_status_idx" ON "RepairOrder"("status");

-- CreateIndex
CREATE INDEX "RepairOrder_createdAt_idx" ON "RepairOrder"("createdAt");

-- CreateIndex
CREATE INDEX "RepairOrderItem_repairOrderId_idx" ON "RepairOrderItem"("repairOrderId");

-- CreateIndex
CREATE INDEX "RepairOrderItem_productId_idx" ON "RepairOrderItem"("productId");

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_businessLocationId_fkey" FOREIGN KEY ("businessLocationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrder" ADD CONSTRAINT "RepairOrder_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrderItem" ADD CONSTRAINT "RepairOrderItem_repairOrderId_fkey" FOREIGN KEY ("repairOrderId") REFERENCES "RepairOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairOrderItem" ADD CONSTRAINT "RepairOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
