-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('DNI', 'CUIT');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "documentType" "DocumentType" NOT NULL DEFAULT 'DNI',
ADD COLUMN     "ivaCondition" TEXT;
