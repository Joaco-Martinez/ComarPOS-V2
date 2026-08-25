import prisma from "../prisma";
import { getPlan, FEATURE_LABELS, PlanFeatureKey } from "../config/billing";

export const planFeatureService = {
  /**
   * Chequeo de si el plan actual del tenant incluye un modulo (fidelidad,
   * promociones, cuentas corrientes -- ver config/billing.ts). Mismo patron
   * que planLimits.service.ts: cada call site decide como surfacear el
   * resultado (middleware vs throw directo), este helper solo informa.
   */
  async checkFeature(
    tenantId: string | null | undefined,
    feature: PlanFeatureKey
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!tenantId) return { ok: true };

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { planId: true } });
    if (!tenant) return { ok: true };

    const plan = getPlan(tenant.planId);
    if (plan.features[feature]) return { ok: true };

    return {
      ok: false,
      message: `${FEATURE_LABELS[feature]} no está disponible en tu plan (${plan.name}). Mejorá tu plan desde Suscripción para usarla.`,
    };
  },
};
