/**
 * Contexto de tenant por request (doc seccion 6 - multi-tenant), via
 * AsyncLocalStorage. Se setea una vez en src/middleware/tenant.ts y permite
 * que cualquier service lea el tenant actual sin tener que recibirlo como
 * parametro explicito en cada funcion ni en cada call site.
 */
import { AsyncLocalStorage } from "async_hooks";

type TenantContext = {
  tenantId?: string | null;
};

const storage = new AsyncLocalStorage<TenantContext>();

export function runWithTenant<T>(tenantId: string | null | undefined, fn: () => T): T {
  return storage.run({ tenantId }, fn);
}

export function currentTenantId(): string | undefined {
  return storage.getStore()?.tenantId ?? undefined;
}
