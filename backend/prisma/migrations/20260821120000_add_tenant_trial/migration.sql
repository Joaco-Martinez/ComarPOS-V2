-- AlterEnum
ALTER TYPE "TenantSubscriptionStatus" ADD VALUE 'TRIAL';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
