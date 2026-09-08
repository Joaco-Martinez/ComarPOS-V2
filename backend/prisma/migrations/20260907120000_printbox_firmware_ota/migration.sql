-- CreateEnum
CREATE TYPE "PrintboxBoard" AS ENUM ('ESP32_S3', 'ESP32_CLASSIC');

-- AlterTable
ALTER TABLE "PrintboxDevice" ADD COLUMN     "board" "PrintboxBoard",
ADD COLUMN     "firmwareVersion" INTEGER;

-- CreateTable
CREATE TABLE "PrintboxFirmware" (
    "id" TEXT NOT NULL,
    "board" "PrintboxBoard" NOT NULL,
    "version" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintboxFirmware_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrintboxFirmware_board_idx" ON "PrintboxFirmware"("board");

-- CreateIndex
CREATE UNIQUE INDEX "PrintboxFirmware_board_version_key" ON "PrintboxFirmware"("board", "version");
