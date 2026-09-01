/**
 * Resolucion de tenant para la tienda online publica (doc "tienda online por
 * tenant"). A diferencia de tenantMiddleware (que resuelve siempre al mismo
 * DEFAULT_TENANT_SLUG para requests sin login), acá el tenant sale del
 * segmento :tenantSlug de la URL (/tienda/:tenantSlug/...) - cada negocio
 * tiene su propia tienda en su propia URL.
 *
 * OJO con el patron que NO hay que copiar: repairOrder.service.ts resuelve
 * un recurso publico por token sin volver a llamar runWithTenant() explicito
 * - "funciona" hoy solo porque hay un unico tenant real y tenantMiddleware
 * global ya dejo algo seteado en el AsyncLocalStorage. Acá se llama
 * runWithTenant() de nuevo a proposito, con el tenant REAL de la URL, para
 * no depender de lo que haya dejado el middleware global.
 */
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { resolveTenantBySlug, getTenantBlock } from "./tenant";
import { readToken } from "./auth";
import { runWithTenant } from "../context/tenantContext";
import { getParamAsString } from "../utils/params";
import { planFeatureService } from "../services/planFeature.service";

export async function storefrontTenantMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const slug = getParamAsString(req.params.tenantSlug, "tenantSlug");
    const tenant = await resolveTenantBySlug(slug);

    if (!tenant) {
      return res.status(404).json({ message: "Tienda no encontrada" });
    }

    (req as any).tenant = tenant;
    (req as any).tenantId = tenant.id;

    const block = getTenantBlock(tenant);
    if (block) {
      // 200 con un flag en vez de 403: la tienda "existe" pero esta
      // deshabilitada/suspendida - el frontend publico muestra una pagina
      // amigable de "no disponible", no un error tecnico (doc fase 4, pero
      // el shape de la respuesta se define aca desde el arranque para no
      // tener que tocar todos los endpoints despues).
      return res.status(200).json({ ok: false, storeUnavailable: true, reason: block.code });
    }

    // Modulo "tiendaOnline" (config/billing.ts) apagado por plan o por
    // /platform-admin > "Modulos para este tenant" - mismo shape de
    // respuesta que getTenantBlock arriba, para que el frontend publico use
    // la misma pagina de "no disponible" sin distinguir el motivo. Esto es
    // lo que le permite al super-admin apagar la tienda online para todos
    // los tenants (o uno puntual) sin que cada negocio tenga que tocar su
    // propio TenantStorefrontConfig.isEnabled.
    const featureCheck = await planFeatureService.checkFeature(tenant.id, "tiendaOnline");
    if (!featureCheck.ok) {
      return res.status(200).json({ ok: false, storeUnavailable: true, reason: "FEATURE_DISABLED" });
    }

    runWithTenant(tenant.id, next);
  } catch (err) {
    next(err);
  }
}

/**
 * Identifica a un CLIENTE logueado (para autocompletar datos en el
 * checkout, decision "invitado + cuenta opcional") SIN pisar el tenant ya
 * resuelto por storefrontTenantMiddleware - a proposito NO usa
 * optionalAuthMiddleware (middleware/auth.ts), que via
 * runWithAuthenticatedTenant() pisaria el contexto con el tenant del JWT del
 * usuario logueado, que puede ser DISTINTO del tenant cuya tienda esta
 * navegando (ej. cliente de la Tienda A mirando el catalogo de la Tienda B).
 * Si el usuario logueado no pertenece a ESTE tenant, se ignora (queda como
 * invitado) - no tiene sentido autocompletar datos de un cliente de otro
 * negocio.
 */
export function optionalStorefrontAuth(req: Request, res: Response, next: NextFunction) {
  const token = readToken(req);

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      userId: string;
      role: string;
      tenantId?: string | null;
    };

    const storefrontTenantId = (req as any).tenantId;

    if (decoded.tenantId && decoded.tenantId === storefrontTenantId) {
      (req as any).user = { id: decoded.userId, role: decoded.role, tenantId: decoded.tenantId };
    }
  } catch {
    // Token vencido/invalido en una ruta publica: se sigue como invitado.
  }

  next();
}
