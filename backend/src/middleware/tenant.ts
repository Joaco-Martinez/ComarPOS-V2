/**
 * Resolucion de tenant para requests sin autenticar (doc seccion 6 -
 * multi-tenant). Ya NO se resuelve por subdominio/Host header - eso se saco
 * a proposito (era fragil: dependia de DNS/hosting y no tiene sentido para
 * como se despliega esta app). El tenant "base" para rutas publicas/anonimas
 * (catalog.routes.ts, auth.routes.ts /register) es siempre DEFAULT_TENANT_SLUG,
 * salvo que se fuerce explicitamente con el header X-Tenant-Slug (solo fuera
 * de produccion, para poder probar un tenant distinto sin tocar DNS).
 *
 * En rutas autenticadas esto ni siquiera importa: authMiddleware pisa este
 * contexto con el tenantId que trae el JWT (ver runWithAuthenticatedTenant en
 * middleware/auth.ts) - ese es el que manda, siempre.
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
  trialEndsAt: Date | null;
  paidUntil: Date | null;
};

const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG || "grupo-vj";

// Cache en memoria: los tenants cambian con muy poca frecuencia y esto evita
// una query extra por request (el pedido explicito de "que los endpoints
// funcionen rapido"). Dos mapas porque hay dos formas de llegar a un tenant:
// por slug (tenant default para rutas publicas/anonimas) y por id
// (authMiddleware, a partir del tenantId embebido en el JWT).
const tenantCache = new Map<string, TenantRecord | null>();
const tenantByIdCache = new Map<string, TenantRecord | null>();

async function resolveTenantBySlug(slug: string): Promise<TenantRecord | null> {
  if (tenantCache.has(slug)) {
    return tenantCache.get(slug) ?? null;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, isActive: true, subscriptionStatus: true, trialEndsAt: true, paidUntil: true },
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
    select: { id: true, slug: true, name: true, isActive: true, subscriptionStatus: true, trialEndsAt: true, paidUntil: true },
  });

  tenantByIdCache.set(id, tenant);
  return tenant;
}

/**
 * Adjunta req.tenant / req.tenantId con el tenant "base" (DEFAULT_TENANT_SLUG),
 * salvo que se fuerce con el header X-Tenant-Slug (solo fuera de produccion).
 * Solo importa para requests sin autenticar - ver comentario arriba.
 */
// Rutas que deben seguir funcionando aunque el tenant este suspendido:
// healthcheck de infraestructura, el panel de super-admin (cross-tenant por
// diseno, no depende del estado de ningun tenant de negocio), el alta de
// prueba gratis (crea un tenant nuevo, no depende del tenant default
// resuelto por tenantMiddleware) y /billing (el propio mecanismo para que un
// tenant bloqueado se desbloquee pagando via Mercado Pago - status/checkout
// necesitan poder llamarse estando bloqueado, y el webhook lo llama MP
// directo sin sesion). /auth/login NO se exime a proposito: asi el 403 de
// suspension se ve ahi en vez de un generico "credenciales invalidas".
// /auth/logout si se exime para poder cerrar sesion limpio con un tenant
// recien suspendido.
export function isSuspensionExempt(path: string): boolean {
  return (
    path === "/" ||
    path.startsWith("/platform-admin") ||
    path === "/auth/logout" ||
    path.startsWith("/trial-signup") ||
    path.startsWith("/billing")
  );
}

export function isTenantSuspended(tenant: Pick<TenantRecord, "isActive" | "subscriptionStatus">): boolean {
  return tenant.subscriptionStatus === "SUSPENDED" || !tenant.isActive;
}

export function isTrialExpired(tenant: Pick<TenantRecord, "subscriptionStatus" | "trialEndsAt">): boolean {
  return (
    tenant.subscriptionStatus === "TRIAL" &&
    !!tenant.trialEndsAt &&
    tenant.trialEndsAt.getTime() < Date.now()
  );
}

// Tenant ACTIVE cuyo periodo pago (paidUntil) ya paso sin renovarse -- el
// caso principal es la baja self-service (ver POST /billing/cancel,
// billing.service.ts cancelSubscription): cancela el auto-cobro en Mercado
// Pago pero deja seguir usando el sistema hasta el vencimiento ya pagado,
// asi que hace falta este chequeo (antes no existia ningun corte automatico
// por fecha) para que el acceso se corte solo despues, sin intervencion
// manual del super-admin. paidUntil null (tenants gratis/manuales del
// super-admin, o que nunca pagaron via MP) NUNCA cuenta como vencido aca --
// null significa "sin fecha de corte", no "vencido".
export function isSubscriptionExpired(tenant: Pick<TenantRecord, "subscriptionStatus" | "paidUntil">): boolean {
  return (
    tenant.subscriptionStatus === "ACTIVE" &&
    !!tenant.paidUntil &&
    tenant.paidUntil.getTime() < Date.now()
  );
}

// Un solo lugar que decide si un tenant bloquea el request y con que
// codigo/mensaje - usado tanto por tenantMiddleware (tenant default, rutas
// sin autenticar) como por runWithAuthenticatedTenant en middleware/auth.ts
// (tenant real del JWT), asi los dos caminos responden igual.
export function getTenantBlock(
  tenant: Pick<TenantRecord, "isActive" | "subscriptionStatus" | "trialEndsAt" | "paidUntil">
): { code: string; message: string } | null {
  if (isTenantSuspended(tenant)) {
    return {
      code: "TENANT_SUSPENDED",
      message: "Esta cuenta está suspendida. Contactá a soporte para reactivarla.",
    };
  }

  if (isTrialExpired(tenant)) {
    return {
      code: "TRIAL_EXPIRED",
      message: "Tu prueba gratis terminó. Contactá a soporte para seguir usando ComarPOS.",
    };
  }

  if (isSubscriptionExpired(tenant)) {
    return {
      code: "SUBSCRIPTION_EXPIRED",
      message: "Tu período pago terminó. Renová tu suscripción desde Suscripción para seguir usando ComarPOS.",
    };
  }

  return null;
}

export async function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const overrideSlug =
      process.env.NODE_ENV !== "production"
        ? (req.headers["x-tenant-slug"] as string | undefined)
        : undefined;

    const slug = overrideSlug || DEFAULT_TENANT_SLUG;

    const tenant = await resolveTenantBySlug(slug);

    (req as any).tenant = tenant;
    (req as any).tenantId = tenant?.id;

    if (!tenant) {
      console.warn(`⚠️ No se pudo resolver el tenant default (slug "${slug}")`);
    }

    // tenantMiddleware se monta global (sin prefijo) asi que req.path ya es
    // la ruta completa hoy, pero se usa req.originalUrl igual que en
    // middleware/auth.ts para que el chequeo no dependa de eso.
    const fullPath = req.originalUrl.split("?")[0];

    if (tenant && !isSuspensionExempt(fullPath)) {
      const block = getTenantBlock(tenant);
      if (block) {
        return res.status(403).json(block);
      }
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
