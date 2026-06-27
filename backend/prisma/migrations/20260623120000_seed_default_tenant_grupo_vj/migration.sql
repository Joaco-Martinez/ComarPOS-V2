-- Backfill del tenant default de Grupo VJ (doc seccion 6 - multi-tenant).
-- Continua la migracion 20260620140000 (scaffolding): crea el tenant "grupo-vj"
-- y completa tenantId en todas las filas existentes que hoy tienen NULL.
-- Idempotente: el INSERT no duplica el tenant si ya existe (ON CONFLICT en slug)
-- y los UPDATE solo tocan filas con tenantId IS NULL, asi que correrla mas de
-- una vez no tiene efecto adicional ni pisa tenants asignados manualmente.

INSERT INTO "Tenant" (id, name, slug, "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Grupo VJ', 'grupo-vj', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  default_tenant_id TEXT;
  t TEXT;
BEGIN
  SELECT id INTO default_tenant_id FROM "Tenant" WHERE slug = 'grupo-vj';

  FOR t IN SELECT unnest(ARRAY[
    'User','Client','Product','Sale','Finance','StockMovement',
    'Purchase','InvoiceAfip','Remito','ArcaConfig','BusinessLocation','ArcaAuditLog'
  ])
  LOOP
    EXECUTE format('UPDATE %I SET "tenantId" = $1 WHERE "tenantId" IS NULL', t)
      USING default_tenant_id;
  END LOOP;
END $$;
