-- Backfill de tenantId (doc seccion 6 - multi-tenant). Continua la migracion
-- 20260620140000 (scaffolding): completa tenantId en filas existentes que
-- tengan NULL, asignandolas al tenant default configurado.
--
-- El INSERT original de esta migracion creaba a mano un tenant "Grupo VJ" --
-- se saco a pedido explicito (el sistema en produccion arranca vacio, sin
-- ningun tenant de fabrica; los tenants se dan de alta por /trial-signup o
-- desde /platform-admin). El backfill de abajo queda igual por si en algun
-- momento hay filas con tenantId NULL que asignar a mano -- en un deploy
-- fresco no hay filas todavia, asi que no hace nada.
-- Idempotente: los UPDATE solo tocan filas con tenantId IS NULL, asi que
-- correrla mas de una vez no tiene efecto adicional ni pisa tenants
-- asignados manualmente.

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
