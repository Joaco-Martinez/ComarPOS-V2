-- Multi-tenant scaffolding (doc seccion 6). Aditivo y no destructivo:
-- crea la tabla Tenant y agrega tenantId NULLABLE a las tablas principales.
-- NO hace backfill de datos existentes de Grupo VJ: hasta que se decida y
-- corra ese backfill, todos los registros existentes quedan con tenantId = NULL
-- y el sistema sigue funcionando igual que antes (single-tenant).

CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'User','Client','Product','Sale','Finance','StockMovement',
    'Purchase','InvoiceAfip','Remito','ArcaConfig','BusinessLocation','ArcaAuditLog'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN "tenantId" TEXT', t);
    EXECUTE format('CREATE INDEX %I ON %I ("tenantId")', t || '_tenantId_idx', t);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE',
      t, t || '_tenantId_fkey'
    );
  END LOOP;
END $$;

-- Siguiente paso (manual, NO incluido aca):
-- 1) INSERT INTO "Tenant" (id, name, slug, "updatedAt") VALUES ('<uuid>', 'Grupo VJ', 'grupo-vj', now());
-- 2) UPDATE cada tabla SET "tenantId" = '<ese uuid>' WHERE "tenantId" IS NULL;
-- 3) Recien ahi evaluar si conviene volver tenantId NOT NULL.
