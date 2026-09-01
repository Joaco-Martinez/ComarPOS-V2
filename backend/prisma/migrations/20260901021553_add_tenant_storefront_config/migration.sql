-- CreateTable
CREATE TABLE "TenantStorefrontConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "storeName" TEXT,
    "description" TEXT,
    "bannerUrl" TEXT,
    "bannerId" TEXT,
    "accentColor" TEXT,
    "businessHours" JSONB,
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "deliveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "businessLocationId" TEXT,
    "transferInstructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantStorefrontConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantStorefrontConfig_tenantId_key" ON "TenantStorefrontConfig"("tenantId");

-- CreateIndex
CREATE INDEX "TenantStorefrontConfig_tenantId_idx" ON "TenantStorefrontConfig"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantStorefrontConfig" ADD CONSTRAINT "TenantStorefrontConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantStorefrontConfig" ADD CONSTRAINT "TenantStorefrontConfig_businessLocationId_fkey" FOREIGN KEY ("businessLocationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
