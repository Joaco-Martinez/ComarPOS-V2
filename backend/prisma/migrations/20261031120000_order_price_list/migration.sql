-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "priceListId" TEXT;

-- CreateIndex
CREATE INDEX "Order_priceListId_idx" ON "Order"("priceListId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
