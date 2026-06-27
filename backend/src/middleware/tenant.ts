/**
 * Resolucion de tenant por subdominio (doc seccion 6 - multi-tenant).
 * Los services ya filtran por tenantId (via tenantScope()/currentTenantId());
 * esta resolucion nunca bloquea la request si no encuentra tenant para no
 * romper accesos sin subdominio configurado (ver DEFAULT_TENANT_SLUG).
 */
import { Request, Response, NextFunction } from "express";
import prisma from "../prisma";
import { runWithTenant } from "../context/tenantContext";

type TenantRecord = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
};

const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG || "grupo-vj";

// Cache en memoria: los tenants cambian con muy poca frecuencia y esto evita
// una query extra por request (el pedido explicito de "que los endpoints
// funcionen rapido").
const tenantCache = new Map<string, TenantRecord | null>();

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
    select: { id: true, slug: true, name: true, isActive: true },
  });

  tenantCache.set(slug, tenant);
  return tenant;
}

/**
 * Adjunta req.tenant / req.tenantId resolviendo por subdominio.
 * En desarrollo (NODE_ENV !== "production") se puede forzar el tenant con el
 * header X-Tenant-Slug, util para probar sin DNS por subdominio configurado.
 */
export async function tenantMiddleware(req: Request, _res: Response, next: NextFunction) {
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

    runWithTenant(tenant?.id, next);
  } catch (err) {
    console.error("❌ Error resolviendo tenant:", err);
    next();
  }
}

export function invalidateTenantCache(slug?: string) {
  if (slug) {
    tenantCache.delete(slug);
    return;
  }

  tenantCache.clear();
}
