-- AlterTable
ALTER TABLE "User" ADD COLUMN     "defaultBusinessLocationId" TEXT,
ADD COLUMN     "restrictToDefaultLocation" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "User_defaultBusinessLocationId_idx" ON "User"("defaultBusinessLocationId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_defaultBusinessLocationId_fkey" FOREIGN KEY ("defaultBusinessLocationId") REFERENCES "BusinessLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
