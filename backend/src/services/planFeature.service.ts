import prisma from "../prisma";
import { getPlan, FEATURE_LABELS, PlanFeatureKey } from "../config/billing";
import { planFeatureConfigService } from "./planFeatureConfig.service";

export const planFeatureService = {
  /**
   * Feature-set efectivo de un tenant: el del plan (con el override de
   * /platform-admin > "Modulos por plan" ya aplicado, ver
   * planFeatureConfigService.getEffectiveFeatures) pisado por
   * Tenant.featureOverrides (override por TENANT puntual, no por plan --
   * pensado para modulos verticales como "hoteleria" que se activan
   * negocio por negocio). El de tenant gana si ambos definen la misma key.
   */
  async getEffectiveFeatures(tenantId: string): Promise<Record<PlanFeatureKey, boolean> | null> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { planId: true, featureOverrides: true },
    });
    if (!tenant) return null;

    const planFeatures = await planFeatureConfigService.getEffectiveFeatures(tenant.planId);
    return { ...planFeatures, ...((tenant.featureOverrides as Partial<Record<PlanFeatureKey, boolean>>) ?? {}) };
  },

  /**
   * Chequeo de si el tenant tiene un modulo habilitado (fidelidad,
   * promociones, cuentas corrientes, hoteleria... ver config/billing.ts).
   * Mismo patron que planLimits.service.ts: cada call site decide como
   * surfacear el resultado (middleware vs throw directo), este helper solo
   * informa.
   */
  async checkFeature(
    tenantId: string | null | undefined,
    feature: PlanFeatureKey
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!tenantId) return { ok: true };

    const features = await planFeatureService.getEffectiveFeatures(tenantId);
    if (!features) return { ok: true };
    if (features[feature]) return { ok: true };

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { planId: true } });
    return {
      ok: false,
      message: `${FEATURE_LABELS[feature]} no está disponible en tu plan (${getPlan(tenant?.planId).name}). Mejorá tu plan desde Suscripción para usarla, o pedile al administrador que lo active para tu cuenta.`,
    };
  },
};
