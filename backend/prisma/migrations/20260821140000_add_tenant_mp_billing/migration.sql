-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "mpPreapprovalId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "mpSubscriptionAmount" DOUBLE PRECISION;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_mpPreapprovalId_key" ON "Tenant"("mpPreapprovalId");
