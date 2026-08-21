-- DropIndex
DROP INDEX "Tenant_printboxMqttUsername_key";

-- AlterTable
ALTER TABLE "PrintboxDevice" ADD COLUMN     "deviceIp" TEXT,
ADD COLUMN     "tokenEncrypted" TEXT;

-- AlterTable
ALTER TABLE "Tenant" DROP COLUMN "printboxMqttPasswordEncrypted",
DROP COLUMN "printboxMqttUsername";
