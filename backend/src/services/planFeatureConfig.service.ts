/**
 * Override editable desde /platform-admin de que modulos incluye cada plan
 * (ver PlanFeatureConfig en schema.prisma). PLANS (config/billing.ts) sigue
 * siendo el default hardcodeado -- esta tabla solo pisa "features" cuando
 * un super-admin lo cambia a mano. Se cachea en memoria (mismo patron que
 * tenantCache en middleware/tenant.ts) para no pegarle a la DB en cada
 * chequeo de plan feature en cada request; se invalida al escribir.
 */
import prisma from "../prisma";
import { PLANS, PlanFeatureKey, Plan, getPlan } from "../config/billing";

type FeatureMap = Record<PlanFeatureKey, boolean>;

const FEATURE_KEYS: PlanFeatureKey[] = ["fidelidad", "promociones", "cuentasCorrientes"];

let cache: Map<string, FeatureMap> | null = null;

async function loadCache(): Promise<Map<string, FeatureMap>> {
  if (cache) return cache;

  const rows = await prisma.planFeatureConfig.findMany();
  const map = new Map<string, FeatureMap>();

  for (const plan of PLANS) {
    const override = rows.find((r) => r.planId === plan.id);
    map.set(plan.id, { ...plan.features, ...((override?.features as Partial<FeatureMap>) ?? {}) });
  }

  cache = map;
  return map;
}

export const planFeatureConfigService = {
  async getEffectiveFeatures(planId: string): Promise<FeatureMap> {
    const map = await loadCache();
    return map.get(planId) ?? getPlan(planId).features;
  },

  /** PLANS con "features" pisado por el override vigente -- usado por GET /billing/plans. */
  async getAllEffectivePlans(): Promise<Plan[]> {
    const map = await loadCache();
    return PLANS.map((p) => ({ ...p, features: map.get(p.id) ?? p.features }));
  },

  async setFeature(planId: string, feature: PlanFeatureKey, enabled: boolean): Promise<FeatureMap> {
    if (!PLANS.some((p) => p.id === planId)) throw new Error("Plan inválido");
    if (!FEATURE_KEYS.includes(feature)) throw new Error("Módulo inválido");

    const map = await loadCache();
    const updated: FeatureMap = { ...(map.get(planId) ?? getPlan(planId).features), [feature]: enabled };

    await prisma.planFeatureConfig.upsert({
      where: { planId },
      create: { planId, features: updated },
      update: { features: updated },
    });

    cache = null;

    return updated;
  },
};
