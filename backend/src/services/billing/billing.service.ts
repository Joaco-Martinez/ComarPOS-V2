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
import { PLANS, getPlan, getEffectivePrice, isLaunchPriceActive, LAUNCH_PRICE_ENDS_AT, type Plan } from "../../config/billing";
import { mercadoPagoClient } from "./mercadoPago.service";

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

  getPlans() {
    return PLANS.map(withEffectivePrice);
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

    return { ...tenant, plan: withEffectivePrice(getPlan(tenant.planId)) };
  },

  /**
   * planId es opcional: si se pasa (ej. el visitante eligió un plan
   * distinto al que ya tenía guardado desde /trial-signup), pisa
   * Tenant.planId ANTES de armar el checkout, para que el monto cobrado
   * corresponda al plan que realmente eligió.
   */
  async createCheckout(tenantId: string, payerEmail: string, planId?: string) {
    let tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new Error("Tenant no encontrado");

    if (planId && planId !== tenant.planId) {
      tenant = await prisma.tenant.update({ where: { id: tenantId }, data: { planId } });
    }

    const plan = getPlan(tenant.planId);

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

    if (!preapproval.init_point) {
      throw new Error("Mercado Pago no devolvió un link de pago");
    }

    return { initPoint: preapproval.init_point };
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
          mpSubscriptionAmount: tenant.mpSubscriptionAmount ?? payment.transaction_amount ?? getEffectivePrice(getPlan(tenant.planId)),
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
