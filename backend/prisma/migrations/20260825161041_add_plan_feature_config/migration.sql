-- CreateTable
CREATE TABLE "PlanFeatureConfig" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "features" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanFeatureConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanFeatureConfig_planId_key" ON "PlanFeatureConfig"("planId");
