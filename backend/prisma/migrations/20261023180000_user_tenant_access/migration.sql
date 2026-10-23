-- CreateTable
CREATE TABLE "UserTenantAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CONTADOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTenantAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserTenantAccess_tenantId_idx" ON "UserTenantAccess"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTenantAccess_userId_tenantId_key" ON "UserTenantAccess"("userId", "tenantId");

-- AddForeignKey
ALTER TABLE "UserTenantAccess" ADD CONSTRAINT "UserTenantAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTenantAccess" ADD CONSTRAINT "UserTenantAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTenantAccess" ADD CONSTRAINT "UserTenantAccess_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

