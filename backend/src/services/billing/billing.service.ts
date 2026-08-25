/**
 * Orquesta la suscripcion self-service via Mercado Pago (ver
 * mercadoPago.service.ts para el cliente HTTP crudo). Dos caminos:
 *   - createCheckout(): lo llama el propio tenant (autenticado, rol ADMIN)
 *     desde /suscripcion para generar el link de pago de MP.
 *   - handlePayment()/handlePreapprovalStatus(): los llama el webhook
 *     (sin auth, cross-tenant por diseno igual que platformTenantService -
 *     ver CLAUDE.md seccion de platform admin) para reflejar en el Tenant
 *     lo que paso del lado de MP.
 * No reemplaza el billing manual existente (subscriptionStatus/paidUntil
 * seteados a mano desde /platform-admin): un tenant sin mpPreapprovalId
 * sigue gestionandose igual que hasta ahora.
 */
import prisma from "../../prisma";
import { invalidateTenantCache } from "../../middleware/tenant";
import { getEffectivePrice, isLaunchPriceActive, LAUNCH_PRICE_ENDS_AT, type Plan } from "../../config/billing";
import { mercadoPagoClient } from "./mercadoPago.service";
import { planFeatureConfigService } from "../planFeatureConfig.service";

const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/login$/, "").replace(/\/$/, "");

function addOneMonth(date: Date): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  return d;
}

// priceArs pisado por el efectivo (regularPriceArs una vez vencido el
// lanzamiento) -- asi /prueba-gratis y /suscripcion, que ya leen
// plan.priceArs tal cual viene de la API, muestran el precio correcto
// sin ningun cambio de su lado apenas pasa la fecha.
function withEffectivePrice(plan: Plan): Plan {
  return { ...plan, priceArs: getEffectivePrice(plan) };
}

export const billingService = {
  launchPriceEndsAt: LAUNCH_PRICE_ENDS_AT,
  launchPriceActive: () => isLaunchPriceActive(),

  // Async porque "features" puede estar pisado desde /platform-admin (ver
  // planFeatureConfig.service.ts) -- este es el unico endpoint publico que
  // expone los planes (landing, /prueba-gratis, /suscripcion y el panel de
  // super-admin), asi que un toggle de modulo se ve reflejado ahi apenas se
  // vuelve a pedir /billing/plans, sin redeploy.
  async getPlans() {
    const effectivePlans = await planFeatureConfigService.getAllEffectivePlans();
    return effectivePlans.map(withEffectivePrice);
  },

  async getStatus(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        subscriptionStatus: true,
        isActive: true,
        trialEndsAt: true,
        paidUntil: true,
        suspendedAt: true,
        mpPreapprovalId: true,
        mpSubscriptionAmount: true,
        planId: true,
      },
    });

    if (!tenant) throw new Error("Tenant no encontrado");

    const effectivePlan = await planFeatureConfigService.getEffectivePlan(tenant.planId);
    return { ...tenant, plan: withEffectivePrice(effectivePlan) };
  },

  /**
   * planId es opcional: si se pasa (ej. el visitante eligió un plan
   * distinto al que ya tenía guardado desde /trial-signup, o un tenant ya
   * suscripto quiere cambiarse de plan desde /suscripcion) pisa
   * Tenant.planId ANTES de armar el checkout, para que el monto cobrado
   * corresponda al plan que realmente eligió.
   *
   * Cambio de plan con suscripción MP ya activa: cancela la preapproval
   * vieja y arma una nueva para el plan nuevo, todo en esta misma llamada
   * (un solo botón en /suscripcion, sin pasos manuales). El precio
   * "congelado" (mpSubscriptionAmount) se resetea para que la preapproval
   * nueva cobre el precio efectivo del plan nuevo, no el viejo. El orden
   * importa: primero se deja Tenant.mpPreapprovalId apuntando a la
   * preapproval NUEVA, recien despues se cancela la vieja -- si no, el
   * webhook de la cancelación (topic "preapproval") podría llegar antes y,
   * sin el guard de handlePreapprovalStatus, suspender al tenant en medio
   * del cambio.
   */
  async createCheckout(tenantId: string, payerEmail: string, planId?: string) {
    let tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new Error("Tenant no encontrado");

    const isPlanChange = !!planId && planId !== tenant.planId;
    const oldPreapprovalId = tenant.mpPreapprovalId;

    if (isPlanChange) {
      tenant = await prisma.tenant.update({
        where: { id: tenantId },
        data: { planId, mpSubscriptionAmount: null },
      });
    }

    const plan = await planFeatureConfigService.getEffectivePlan(tenant.planId);

    const preapproval = await mercadoPagoClient.createPreapproval({
      tenantId,
      payerEmail,
      backUrl: `${FRONTEND_URL}/suscripcion?estado=procesando`,
      reason: `${plan.name} - suscripción mensual`,
      amount: tenant.mpSubscriptionAmount ?? getEffectivePrice(plan),
    });

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { mpPreapprovalId: preapproval.id },
    });

    if (isPlanChange && oldPreapprovalId && oldPreapprovalId !== preapproval.id) {
      try {
        await mercadoPagoClient.cancelPreapproval(oldPreapprovalId);
      } catch (err) {
        // No bloquea el cambio de plan -- puede ya estar cancelada/vencida
        // del lado de MP. Igual queda reemplazada en Tenant.mpPreapprovalId.
        console.warn(`⚠️ No se pudo cancelar la preapproval vieja ${oldPreapprovalId} al cambiar de plan:`, err);
      }
    }

    if (!preapproval.init_point) {
      throw new Error("Mercado Pago no devolvió un link de pago");
    }

    return { initPoint: preapproval.init_point };
  },

  /**
   * Baja self-service ("botón de arrepentimiento" en /suscripcion): cancela
   * el auto-cobro en Mercado Pago de verdad, pero el tenant sigue teniendo
   * acceso hasta paidUntil (el período que ya pagó) -- no lo suspende al
   * toque. El corte real despues del vencimiento lo hace
   * isSubscriptionExpired() en middleware/tenant.ts en el proximo request,
   * no esta funcion. Poner mpPreapprovalId en null (en vez de solo
   * cancelarla en MP) es lo que hace que el webhook tardío de esa
   * cancelación no dispare handlePreapprovalStatus (guard: preapprovalId ya
   * no coincide con ninguna del tenant).
   *
   * Devuelve tambien un "numero de constancia" (derivado del id del
   * TenantPaymentLog que queda como registro permanente) -- la Resolucion
   * 424/2020 espera que el consumidor se lleve algun comprobante de haber
   * ejercido el derecho de arrepentimiento, no solo un mensaje en pantalla.
   */
  async cancelSubscription(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new Error("Tenant no encontrado");

    if (!tenant.mpPreapprovalId) {
      throw new Error("No tenés una suscripción de Mercado Pago activa para dar de baja");
    }

    try {
      await mercadoPagoClient.cancelPreapproval(tenant.mpPreapprovalId);
    } catch (err) {
      console.warn(`⚠️ No se pudo cancelar la preapproval ${tenant.mpPreapprovalId} en Mercado Pago:`, err);
    }

    const [, log] = await prisma.$transaction([
      prisma.tenant.update({
        where: { id: tenantId },
        data: { mpPreapprovalId: null },
      }),
      prisma.tenantPaymentLog.create({
        data: {
          tenantId,
          previousStatus: tenant.subscriptionStatus,
          newStatus: tenant.subscriptionStatus,
          note: tenant.paidUntil
            ? `Baja solicitada por el propio tenant desde Suscripción (botón de arrepentimiento). Mantiene acceso hasta el ${tenant.paidUntil.toLocaleDateString("es-AR")} (período ya pagado); no se renueva automáticamente.`
            : "Baja solicitada por el propio tenant desde Suscripción (botón de arrepentimiento).",
        },
      }),
    ]);

    const claimCode = `ARR-${log.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const status = await this.getStatus(tenantId);

    return { ...status, claimCode };
  },

  /** Topic "payment" del webhook: un cobro puntual (alta o renovacion mensual) generado por una preapproval. */
  async handlePayment(paymentId: string | number) {
    const payment = await mercadoPagoClient.getPayment(paymentId);

    const tenantId = payment.external_reference;
    if (!tenantId) {
      console.warn(`⚠️ Webhook MP: pago ${paymentId} sin external_reference, no se puede asociar a un tenant`);
      return;
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      console.warn(`⚠️ Webhook MP: pago ${paymentId} referencia un tenant inexistente (${tenantId})`);
      return;
    }

    if (payment.status !== "approved") {
      // Rechazado/pendiente: no tocamos el estado del tenant - MP reintenta
      // solo unos dias y recien cancela la preapproval si se agotan los
      // reintentos (eso lo maneja handlePreapprovalStatus, topic "preapproval").
      await prisma.tenantPaymentLog.create({
        data: {
          tenantId,
          previousStatus: tenant.subscriptionStatus,
          newStatus: tenant.subscriptionStatus,
          note: `Mercado Pago: pago ${paymentId} con estado "${payment.status}"${payment.status_detail ? ` (${payment.status_detail})` : ""}.`,
        },
      });
      return;
    }

    const approvedAt = payment.date_approved ? new Date(payment.date_approved) : new Date();
    const paidUntil = addOneMonth(approvedAt);
    const effectivePlan = await planFeatureConfigService.getEffectivePlan(tenant.planId);

    await prisma.$transaction([
      prisma.tenant.update({
        where: { id: tenantId },
        data: {
          subscriptionStatus: "ACTIVE",
          paidUntil,
          suspendedAt: null,
          // Precio de lanzamiento fijo "de por vida": solo se graba en el
          // primer pago acreditado, un cambio futuro del precio de listado
          // no debe pisarlo en las renovaciones siguientes.
          mpSubscriptionAmount: tenant.mpSubscriptionAmount ?? payment.transaction_amount ?? getEffectivePrice(effectivePlan),
        },
      }),
      prisma.tenantPaymentLog.create({
        data: {
          tenantId,
          previousStatus: tenant.subscriptionStatus,
          newStatus: "ACTIVE",
          note: `Mercado Pago: pago ${paymentId} acreditado ($${payment.transaction_amount ?? "?"}).`,
          paidUntil,
        },
      }),
    ]);

    invalidateTenantCache(tenant.slug, tenant.id);
  },

  /** Topic "preapproval" del webhook: cambios de estado de la suscripcion (autorizada, pausada, cancelada). */
  async handlePreapprovalStatus(preapprovalId: string) {
    const preapproval = await mercadoPagoClient.getPreapproval(preapprovalId);

    const tenantId = preapproval.external_reference;
    if (!tenantId) {
      console.warn(`⚠️ Webhook MP: preapproval ${preapprovalId} sin external_reference`);
      return;
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      console.warn(`⚠️ Webhook MP: preapproval ${preapprovalId} referencia un tenant inexistente (${tenantId})`);
      return;
    }

    // Si esta preapproval ya no es la vigente del tenant, es un evento
    // tardío de una preapproval vieja reemplazada por un cambio de plan
    // (ver createCheckout) -- ignorar, si no un "cancelled" de la vieja
    // suspendería al tenant justo cuando está activo con la nueva.
    if (tenant.mpPreapprovalId !== preapprovalId) {
      return;
    }

    // "authorized" no dispara el desbloqueo por si solo: el estado ACTIVE
    // real se refleja recien cuando llega el pago aprobado correspondiente
    // (topic "payment", ver handlePayment) - asi el paidUntil siempre sale
    // de un cobro confirmado, no de una autorizacion que todavia no cobro.
    if (preapproval.status !== "cancelled" && preapproval.status !== "paused") {
      return;
    }

    await prisma.$transaction([
      prisma.tenant.update({
        where: { id: tenantId },
        data: { subscriptionStatus: "SUSPENDED", suspendedAt: new Date() },
      }),
      prisma.tenantPaymentLog.create({
        data: {
          tenantId,
          previousStatus: tenant.subscriptionStatus,
          newStatus: "SUSPENDED",
          note: `Mercado Pago: la suscripción quedó "${preapproval.status}".`,
        },
      }),
    ]);

    invalidateTenantCache(tenant.slug, tenant.id);
  },
};
