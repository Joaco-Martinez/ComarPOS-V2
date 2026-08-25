-- CreateEnum
CREATE TYPE "PrintboxDeviceKind" AS ENUM ('ESP32', 'DESKTOP_AGENT');

-- AlterTable
ALTER TABLE "PrintboxDevice" ADD COLUMN     "kind" "PrintboxDeviceKind" NOT NULL DEFAULT 'ESP32';
