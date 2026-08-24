-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PRINTER_NOT_CONFIGURED';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "legacyLocalPrinterEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: grupo-vj es el unico tenant que hoy imprime por el bridge
-- POS_LOCAL_URL viejo (sin PrintboxDevice pareado todavia) -- ver
-- ticket.service.ts. Cualquier tenant nuevo arranca en false a proposito.
UPDATE "Tenant" SET "legacyLocalPrinterEnabled" = true WHERE "slug" = 'grupo-vj';
