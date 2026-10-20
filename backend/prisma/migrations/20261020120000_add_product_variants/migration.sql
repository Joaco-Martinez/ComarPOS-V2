-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "customCost" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "customPrice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasVariants" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "variantAttributes" JSONB,
ADD COLUMN     "variantLabel" TEXT,
ADD COLUMN     "variantOptions" JSONB;

-- CreateIndex
CREATE INDEX "Product_parentId_idx" ON "Product"("parentId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

