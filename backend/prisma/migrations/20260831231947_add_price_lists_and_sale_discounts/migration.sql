-- AlterTable
ALTER TABLE "PriceListItem" ADD COLUMN     "pricePerKg" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "discountsAccumulate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priceListId" TEXT;

-- CreateTable
CREATE TABLE "SaleDiscount" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "label" TEXT,
    "type" "DiscountType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "applied" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaleDiscount_saleId_idx" ON "SaleDiscount"("saleId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleDiscount" ADD CONSTRAINT "SaleDiscount_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
