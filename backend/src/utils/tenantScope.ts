/**
 * Convencion de scoping por tenant (doc seccion 6): se usa como spread en el
 * `where`/`data` de queries a los modelos con tenantId (User, Client,
 * Product, Sale, Finance, StockMovement, Purchase, InvoiceAfip, Remito,
 * ArcaConfig, BusinessLocation, ArcaAuditLog), ej. `where: { ...tenantScope(), status }`.
 * Lee el tenant actual del AsyncLocalStorage (src/context/tenantContext.ts),
 * seteado por tenantMiddleware/authMiddleware (src/middleware/tenant.ts,
 * src/middleware/auth.ts) - no hace falta pasarlo a mano por cada
 * funcion/controller.
 */
import { currentTenantId } from "../context/tenantContext";

export function tenantScope() {
  const tenantId = currentTenantId();
  return tenantId ? { tenantId } : {};
}
