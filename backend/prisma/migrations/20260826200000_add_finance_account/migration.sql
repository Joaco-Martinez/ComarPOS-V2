-- Plan de cuentas configurable por tenant (aditivo).
--
-- Hoy los ingresos/egresos de caja (modelo Finance) usan un enum fijo
-- (CategoryFinance) pensado para un unico negocio. Esta migracion agrega un
-- modelo nuevo, FinanceAccount, para que cada tenant pueda armar su propio
-- plan de cuentas (crear/renombrar/desactivar cuentas de ingreso/egreso) sin
-- tocar el enum viejo: CategoryFinance y Finance.category NO se borran ni
-- cambian de tipo -- siguen existiendo tal cual para no romper nada que ya
-- lea/escriba con ellos. Finance.financeAccountId es una FK opcional nueva:
-- si no se manda, todo sigue funcionando solo con category como hasta ahora.
--
-- Ademas de crear las tablas, esta migracion siembra datos:
--   1) Por cada tenant existente en "Tenant", crea una FinanceAccount
--      (isSystem = true) por cada valor del enum CategoryFinance.
--   2) Igual, pero con tenantId NULL, por si quedara algun Finance
--      "huerfano" sin tenant (defensivo -- en un deploy nuevo no deberia
--      haber ninguno).
--   3) Backfillea Finance.financeAccountId segun Finance.category, matcheando
--      por tenantId (o por cuentas globales si el Finance no tiene tenant).
--
-- Criterio de mapeo categoria legacy -> tipo (INGRESO/EGRESO), tomado del
-- uso real que ya tienen esas categorias en el codigo (finance.service.ts,
-- purchase.service.ts, account.service.ts):
--   VENTA, COBRANZA                                  -> INGRESO (son cobros)
--   CompraMercaderia, AlquilerL1, AlquilerF1, Alarma,
--   Sueldos, MateriaPrima, Impuestos, VEP, Contadora,
--   Arca, Eenvios, Publicidad, Otro                  -> EGRESO (gastos/compras)
--
-- Idempotente en la parte de estructura (CREATE TABLE/COLUMN fallan si ya
-- existen, como el resto de las migraciones de este repo). La parte de datos
-- solo inserta si "Tenant" tiene filas y solo backfillea Finance con
-- financeAccountId todavia NULL, asi que no duplica si se llegara a re-aplicar
-- sobre una base que ya la tiene.

-- CreateTable
CREATE TABLE "FinanceAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "type" "FinanceType" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceAccount_tenantId_idx" ON "FinanceAccount"("tenantId");

-- CreateIndex
CREATE INDEX "FinanceAccount_type_idx" ON "FinanceAccount"("type");

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: FK opcional nueva en Finance, backward-compatible (nullable,
-- category se mantiene intacta al lado)
ALTER TABLE "Finance" ADD COLUMN "financeAccountId" TEXT;

-- CreateIndex
CREATE INDEX "Finance_financeAccountId_idx" ON "Finance"("financeAccountId");

-- AddForeignKey
ALTER TABLE "Finance" ADD CONSTRAINT "Finance_financeAccountId_fkey" FOREIGN KEY ("financeAccountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DataMigration (1): sembrar una FinanceAccount por cada categoria legacy,
-- por cada tenant existente.
WITH category_map(category, label, ftype) AS (
  VALUES
    ('VENTA', 'Venta', 'INGRESO'),
    ('COBRANZA', 'Cobranza', 'INGRESO'),
    ('CompraMercaderia', 'Compra mercadería', 'EGRESO'),
    ('AlquilerL1', 'Alquiler local 1', 'EGRESO'),
    ('AlquilerF1', 'Alquiler frío 1', 'EGRESO'),
    ('Alarma', 'Alarma', 'EGRESO'),
    ('Sueldos', 'Sueldos', 'EGRESO'),
    ('MateriaPrima', 'Materia prima', 'EGRESO'),
    ('Impuestos', 'Impuestos', 'EGRESO'),
    ('VEP', 'VEP', 'EGRESO'),
    ('Contadora', 'Contadora', 'EGRESO'),
    ('Arca', 'ARCA', 'EGRESO'),
    ('Eenvios', 'E-envíos', 'EGRESO'),
    ('Publicidad', 'Publicidad', 'EGRESO'),
    ('Otro', 'Otro', 'EGRESO')
)
INSERT INTO "FinanceAccount" ("id", "tenantId", "name", "type", "isSystem", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", m.label, m.ftype::"FinanceType", true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN category_map m;

-- DataMigration (2): igual pero para Finance sin tenant (defensivo, ver
-- comentario de arriba). Solo inserta si hace falta.
WITH category_map(category, label, ftype) AS (
  VALUES
    ('VENTA', 'Venta', 'INGRESO'),
    ('COBRANZA', 'Cobranza', 'INGRESO'),
    ('CompraMercaderia', 'Compra mercadería', 'EGRESO'),
    ('AlquilerL1', 'Alquiler local 1', 'EGRESO'),
    ('AlquilerF1', 'Alquiler frío 1', 'EGRESO'),
    ('Alarma', 'Alarma', 'EGRESO'),
    ('Sueldos', 'Sueldos', 'EGRESO'),
    ('MateriaPrima', 'Materia prima', 'EGRESO'),
    ('Impuestos', 'Impuestos', 'EGRESO'),
    ('VEP', 'VEP', 'EGRESO'),
    ('Contadora', 'Contadora', 'EGRESO'),
    ('Arca', 'ARCA', 'EGRESO'),
    ('Eenvios', 'E-envíos', 'EGRESO'),
    ('Publicidad', 'Publicidad', 'EGRESO'),
    ('Otro', 'Otro', 'EGRESO')
)
INSERT INTO "FinanceAccount" ("id", "tenantId", "name", "type", "isSystem", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, NULL, m.label, m.ftype::"FinanceType", true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM category_map m
WHERE EXISTS (SELECT 1 FROM "Finance" WHERE "tenantId" IS NULL AND "financeAccountId" IS NULL);

-- DataMigration (3): backfillear Finance.financeAccountId segun category,
-- matcheando la FinanceAccount "isSystem" del mismo tenant (o global si el
-- Finance no tiene tenant).
UPDATE "Finance" f
SET "financeAccountId" = fa."id"
FROM "FinanceAccount" fa
WHERE fa."isSystem" = true
  AND f."financeAccountId" IS NULL
  AND (
        (f."tenantId" IS NOT NULL AND fa."tenantId" = f."tenantId")
        OR (f."tenantId" IS NULL AND fa."tenantId" IS NULL)
      )
  AND fa."name" = CASE f."category"
        WHEN 'VENTA' THEN 'Venta'
        WHEN 'COBRANZA' THEN 'Cobranza'
        WHEN 'CompraMercaderia' THEN 'Compra mercadería'
        WHEN 'AlquilerL1' THEN 'Alquiler local 1'
        WHEN 'AlquilerF1' THEN 'Alquiler frío 1'
        WHEN 'Alarma' THEN 'Alarma'
        WHEN 'Sueldos' THEN 'Sueldos'
        WHEN 'MateriaPrima' THEN 'Materia prima'
        WHEN 'Impuestos' THEN 'Impuestos'
        WHEN 'VEP' THEN 'VEP'
        WHEN 'Contadora' THEN 'Contadora'
        WHEN 'Arca' THEN 'ARCA'
        WHEN 'Eenvios' THEN 'E-envíos'
        WHEN 'Publicidad' THEN 'Publicidad'
        WHEN 'Otro' THEN 'Otro'
      END;
