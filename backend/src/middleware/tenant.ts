/**
 * Resolucion de tenant por subdominio (doc seccion 6 - multi-tenant).
 * Los services ya filtran por tenantId (via tenantScope()/currentTenantId());
 * esta resolucion nunca bloquea la request si no encuentra tenant para no
 * romper accesos sin subdominio configurado (ver DEFAULT_TENANT_SLUG).
 *
 * Desde que el login dejo de depender del subdominio, esto solo es la base
 * del tenant context para rutas publicas/anonimas (catalog.routes.ts,
 * auth.routes.ts /register) que necesitan un tenant sin haber autenticado
 * todavia. En rutas autenticadas, authMiddleware pisa este contexto con el
 * tenantId del JWT (ver runWithAuthenticatedTenant en middleware/auth.ts) -
 * ese es el que manda, sin importar por que dominio entro la request.
 */
import { Request, Response, NextFunction } from "express";
import prisma from "../prisma";
import { runWithTenant } from "../context/tenantContext";

type TenantRecord = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  subscriptionStatus: string;
};

const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG || "grupo-vj";

// Cache en memoria: los tenants cambian con muy poca frecuencia y esto evita
// una query extra por request (el pedido explicito de "que los endpoints
// funcionen rapido"). Dos mapas porque hay dos formas de llegar a un tenant:
// por slug (resolucion por subdominio, rutas publicas/anonimas) y por id
// (authMiddleware, a partir del tenantId embebido en el JWT).
const tenantCache = new Map<string, TenantRecord | null>();
const tenantByIdCache = new Map<string, TenantRecord | null>();

function extractSubdomainSlug(hostname: string): string | null {
  const parts = hostname.split(".");

  // localhost, IPs y dominios sin subdominio (ej. "comarpos.com") no tienen
  // todavia un subdominio de tenant real -> se resuelve por DEFAULT_TENANT_SLUG.
  if (parts.length < 3) return null;

  const [first] = parts;

  if (!first || first === "www") return null;

  return first.toLowerCase();
}

async function resolveTenantBySlug(slug: string): Promise<TenantRecord | null> {
  if (tenantCache.has(slug)) {
    return tenantCache.get(slug) ?? null;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, isActive: true, subscriptionStatus: true },
  });

  tenantCache.set(slug, tenant);
  return tenant;
}

// Usado por authMiddleware: el tenant autoritativo de un request autenticado
// es el que viene en el JWT (tenantId), no el resuelto por subdominio.
export async function resolveTenantById(id: string): Promise<TenantRecord | null> {
  if (tenantByIdCache.has(id)) {
    return tenantByIdCache.get(id) ?? null;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: { id: true, slug: true, name: true, isActive: true, subscriptionStatus: true },
  });

  tenantByIdCache.set(id, tenant);
  return tenant;
}

/**
 * Adjunta req.tenant / req.tenantId resolviendo por subdominio.
 * En desarrollo (NODE_ENV !== "production") se puede forzar el tenant con el
 * header X-Tenant-Slug, util para probar sin DNS por subdominio configurado.
 */
// Rutas que deben seguir funcionando aunque el tenant este suspendido:
// healthcheck de infraestructura y el panel de super-admin (cross-tenant por
// diseno, no depende del estado de ningun tenant de negocio). /auth/login NO
// se exime a proposito: asi el 403 de suspension se ve ahi en vez de un
// generico "credenciales invalidas". /auth/logout si se exime para poder
// cerrar sesion limpio con un tenant recien suspendido.
export function isSuspensionExempt(path: string): boolean {
  return path === "/" || path.startsWith("/platform-admin") || path === "/auth/logout";
}

export function isTenantSuspended(tenant: Pick<TenantRecord, "isActive" | "subscriptionStatus">): boolean {
  return tenant.subscriptionStatus === "SUSPENDED" || !tenant.isActive;
}

export async function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const overrideSlug =
      process.env.NODE_ENV !== "production"
        ? (req.headers["x-tenant-slug"] as string | undefined)
        : undefined;

    const slug = overrideSlug || extractSubdomainSlug(req.hostname) || DEFAULT_TENANT_SLUG;

    const tenant = await resolveTenantBySlug(slug);

    (req as any).tenant = tenant;
    (req as any).tenantId = tenant?.id;

    if (!tenant) {
      console.warn(`⚠️ No se pudo resolver tenant para host "${req.hostname}" (slug "${slug}")`);
    }

    if (tenant && !isSuspensionExempt(req.path) && isTenantSuspended(tenant)) {
      return res.status(403).json({
        code: "TENANT_SUSPENDED",
        message: "Esta cuenta está suspendida. Contactá a soporte para reactivarla.",
      });
    }

    runWithTenant(tenant?.id, next);
  } catch (err) {
    console.error("❌ Error resolviendo tenant:", err);
    next();
  }
}

export function invalidateTenantCache(slug?: string, id?: string) {
  if (!slug && !id) {
    tenantCache.clear();
    tenantByIdCache.clear();
    return;
  }

  if (slug) tenantCache.delete(slug);
  if (id) tenantByIdCache.delete(id);
}
