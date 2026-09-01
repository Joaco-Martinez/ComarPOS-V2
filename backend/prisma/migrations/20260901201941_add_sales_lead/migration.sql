-- CreateEnum
CREATE TYPE "SalesLeadStatus" AS ENUM ('PENDIENTE', 'VISITADO', 'INTERESADO', 'NO_INTERESADO', 'CLIENTE');

-- CreateTable
CREATE TABLE "SalesLead" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "address" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "status" "SalesLeadStatus" NOT NULL DEFAULT 'PENDIENTE',
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesLead_status_idx" ON "SalesLead"("status");

-- CreateIndex
CREATE INDEX "SalesLead_createdByAdminId_idx" ON "SalesLead"("createdByAdminId");

-- AddForeignKey
ALTER TABLE "SalesLead" ADD CONSTRAINT "SalesLead_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
