/**
 * Override editable desde /platform-admin de que modulos incluye cada plan
 * y de su precio (ver PlanFeatureConfig en schema.prisma). PLANS
 * (config/billing.ts) sigue siendo el default hardcodeado -- esta tabla solo
 * pisa lo que un super-admin cambio a mano. Se cachea en memoria (mismo
 * patron que tenantCache en middleware/tenant.ts) para no pegarle a la DB en
 * cada chequeo de plan feature en cada request; se invalida al escribir.
 */
import prisma from "../prisma";
import { PLANS, PlanFeatureKey, Plan, FEATURE_LABELS, getPlan } from "../config/billing";

type FeatureMap = Record<PlanFeatureKey, boolean>;

const FEATURE_KEYS = Object.keys(FEATURE_LABELS) as PlanFeatureKey[];

let cache: Map<string, Plan> | null = null;

async function loadCache(): Promise<Map<string, Plan>> {
  if (cache) return cache;

  const rows = await prisma.planFeatureConfig.findMany();
  const map = new Map<string, Plan>();

  for (const plan of PLANS) {
    const override = rows.find((r) => r.planId === plan.id);
    map.set(plan.id, {
      ...plan,
      features: { ...plan.features, ...((override?.features as Partial<FeatureMap>) ?? {}) },
      priceArs: override?.priceArs ?? plan.priceArs,
      regularPriceArs: override?.regularPriceArs ?? plan.regularPriceArs,
    });
  }

  cache = map;
  return map;
}

export const planFeatureConfigService = {
  async getEffectivePlan(planId: string): Promise<Plan> {
    const map = await loadCache();
    return map.get(planId) ?? getPlan(planId);
  },

  async getEffectiveFeatures(planId: string): Promise<FeatureMap> {
    return (await this.getEffectivePlan(planId)).features;
  },

  /** PLANS con "features"/precio pisado por el override vigente -- usado por GET /billing/plans. */
  async getAllEffectivePlans(): Promise<Plan[]> {
    const map = await loadCache();
    return PLANS.map((p) => map.get(p.id) ?? p);
  },

  async setFeature(planId: string, feature: PlanFeatureKey, enabled: boolean): Promise<FeatureMap> {
    if (!PLANS.some((p) => p.id === planId)) throw new Error("Plan inválido");
    if (!FEATURE_KEYS.includes(feature)) throw new Error("Módulo inválido");

    const current = await this.getEffectivePlan(planId);
    const updated: FeatureMap = { ...current.features, [feature]: enabled };

    await prisma.planFeatureConfig.upsert({
      where: { planId },
      create: { planId, features: updated },
      update: { features: updated },
    });

    cache = null;

    return updated;
  },

  async setPrice(planId: string, priceArs: number, regularPriceArs: number): Promise<Plan> {
    if (!PLANS.some((p) => p.id === planId)) throw new Error("Plan inválido");
    if (!Number.isFinite(priceArs) || priceArs <= 0) throw new Error("El precio de lanzamiento debe ser mayor a 0");
    if (!Number.isFinite(regularPriceArs) || regularPriceArs <= 0) throw new Error("El precio de lista debe ser mayor a 0");

    const current = await this.getEffectivePlan(planId);

    await prisma.planFeatureConfig.upsert({
      where: { planId },
      create: { planId, features: current.features, priceArs, regularPriceArs },
      update: { priceArs, regularPriceArs },
    });

    cache = null;

    return this.getEffectivePlan(planId);
  },
};
