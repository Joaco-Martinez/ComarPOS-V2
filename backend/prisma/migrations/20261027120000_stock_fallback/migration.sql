-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'STOCK_FALLBACK';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "stockFallbackEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stockFallbackLocationIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "isStockFallback" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "StockMovement_isStockFallback_idx" ON "StockMovement"("isStockFallback");
