-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "addressCity" TEXT,
ADD COLUMN     "addressProvince" TEXT,
ADD COLUMN     "addressStreet" TEXT,
ADD COLUMN     "imageId" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "featureOverrides" JSONB;
