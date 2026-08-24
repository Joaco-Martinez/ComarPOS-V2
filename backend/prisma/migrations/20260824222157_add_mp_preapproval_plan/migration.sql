-- CreateTable
CREATE TABLE "MpPreapprovalPlan" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "mpPlanId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MpPreapprovalPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MpPreapprovalPlan_planId_key" ON "MpPreapprovalPlan"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "MpPreapprovalPlan_mpPlanId_key" ON "MpPreapprovalPlan"("mpPlanId");
