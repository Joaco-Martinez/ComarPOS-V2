/**
 * 3 planes de ComarPOS (ver services/billing/*.ts). Cada uno tiene un
 * precio "de lanzamiento" (priceArs) vigente hasta LAUNCH_PRICE_ENDS_AT, y
 * un precio de lista (regularPriceArs, el que se muestra tachado al lado)
 * que rige despues. Igual que antes con el plan unico: quien se suscribe
 * ahora paga priceArs de por vida (el monto real cobrado se congela en
 * Tenant.mpSubscriptionAmount al primer pago acreditado, ver
 * billing.service.ts) -- cambiar estos numeros solo afecta a suscripciones
 * nuevas de ahi en adelante.
 */
export type PlanLimits = {
  /** null = ilimitado */
  maxBusinessLocations: number | null;
  maxProducts: number | null;
  maxUsers: number | null;
};

export type Plan = {
  id: string;
  name: string;
  priceArs: number;
  regularPriceArs: number;
  currency: string;
  tagline: string;
  highlighted: boolean;
  limits: PlanLimits;
};

export const LAUNCH_PRICE_ENDS_AT = new Date("2026-09-24T00:00:00-03:00");

export const DEFAULT_PLAN_ID = "profesional";

export const PLANS: Plan[] = [
  {
    id: "esencial",
    name: "Esencial",
    priceArs: 24000,
    regularPriceArs: 32000,
    currency: "ARS",
    tagline: "Para arrancar con lo justo y necesario.",
    highlighted: false,
    limits: { maxBusinessLocations: 1, maxProducts: 300, maxUsers: 2 },
  },
  {
    id: "profesional",
    name: "Profesional",
    priceArs: 35000,
    regularPriceArs: 47000,
    currency: "ARS",
    tagline: "El más elegido: todo lo que necesita un negocio en crecimiento.",
    highlighted: true,
    limits: { maxBusinessLocations: 3, maxProducts: null, maxUsers: null },
  },
  {
    id: "multisucursal",
    name: "Multisucursal",
    priceArs: 52000,
    regularPriceArs: 70000,
    currency: "ARS",
    tagline: "Para cadenas y negocios con varias sucursales.",
    highlighted: false,
    limits: { maxBusinessLocations: null, maxProducts: null, maxUsers: null },
  },
];

export function getPlan(id?: string | null): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS.find((p) => p.id === DEFAULT_PLAN_ID)!;
}
