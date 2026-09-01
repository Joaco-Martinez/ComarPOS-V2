-- AlterTable
ALTER TABLE "SalesLead" ADD COLUMN "convertedTenantId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SalesLead_convertedTenantId_key" ON "SalesLead"("convertedTenantId");

-- AddForeignKey
ALTER TABLE "SalesLead" ADD CONSTRAINT "SalesLead_convertedTenantId_fkey" FOREIGN KEY ("convertedTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
