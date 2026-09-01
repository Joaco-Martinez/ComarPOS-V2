-- CreateEnum
CREATE TYPE "SalesLeadContactRole" AS ENUM ('DUENO', 'EMPLEADO');

-- AlterTable
ALTER TABLE "SalesLead" ADD COLUMN     "contactRole" "SalesLeadContactRole";
