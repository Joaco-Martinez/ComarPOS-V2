-- CreateEnum
CREATE TYPE "ReturnItemDirection" AS ENUM ('RETURNED', 'EXCHANGE_OUT');

-- AlterTable
ALTER TABLE "Return" ADD COLUMN     "chargeAmount" DOUBLE PRECISION,
ADD COLUMN     "chargeMethod" "PaymentMethod",
ADD COLUMN     "creditAmount" DOUBLE PRECISION,
ADD COLUMN     "refundAmount" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ReturnItem" ADD COLUMN     "direction" "ReturnItemDirection" NOT NULL DEFAULT 'RETURNED',
ADD COLUMN     "saleItemId" TEXT;

-- CreateIndex
CREATE INDEX "ReturnItem_saleItemId_idx" ON "ReturnItem"("saleItemId");

-- AddForeignKey
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
