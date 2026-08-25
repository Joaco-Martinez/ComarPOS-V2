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

// Todos los modulos del sistema que se pueden prender/apagar por plan (uno
// por item de navConfig.ts en el frontend, salvo "guia"/"ayuda" que son
// paginas de soporte, no funcionalidad de negocio). El toggle vive en
// /platform-admin ("Modulos por plan"), se guarda en PlanFeatureConfig
// (override sobre el default de abajo) y se aplica en dos niveles:
//   - Backend real (middleware/planFeature.ts, requirePlanFeature) para los
//     modulos con ruta propia y sin dependencias cruzadas de otras pantallas
//     (ver comentario en cada mount de app.ts/*.routes.ts).
//   - Frontend (components/AppLayout.tsx bloquea la pantalla entera si el
//     modulo de la ruta actual esta apagado, Sidebar.tsx la oculta del menu)
//     para TODOS los modulos, incluidos los que comparten endpoint con otra
//     pantalla (ej. pos/ventas/facturacion/devoluciones comparten /sales;
//     productos/stock/promociones comparten /products) -- ahi separar el
//     backend por modulo arriesgaba romper el flujo de venta/stock central,
//     asi que el bloqueo real para esos es a nivel pantalla, no a nivel API.
export type PlanFeatureKey =
  | "dashboard"
  | "pos"
  | "ventas"
  | "productos"
  | "categorias"
  | "clientes"
  | "stock"
  | "alertas"
  | "caja"
  | "servicios"
  | "remitos"
  | "facturacion"
  | "devoluciones"
  | "compras"
  | "ordenesCompra"
  | "proveedores"
  | "conteoStock"
  | "finanzas"
  | "gastosRecurrentes"
  | "tipoCambio"
  | "cuentasCorrientes"
  | "reportes"
  | "objetivosVentas"
  | "promociones"
  | "fidelidad"
  | "usuarios"
  | "auditoria"
  | "sucursales"
  | "arca"
  | "empresa"
  | "printbox";

export const FEATURE_LABELS: Record<PlanFeatureKey, string> = {
  dashboard: "Dashboard",
  pos: "POS — Ventas",
  ventas: "Historial de Ventas",
  productos: "Productos",
  categorias: "Categorías",
  clientes: "Clientes",
  stock: "Stock",
  alertas: "Alertas",
  caja: "Caja",
  servicios: "Servicios / Reparaciones",
  remitos: "Remitos",
  facturacion: "AFIP / Facturas",
  devoluciones: "Devoluciones",
  compras: "Compras",
  ordenesCompra: "Órdenes de Compra",
  proveedores: "Proveedores",
  conteoStock: "Conteo de Stock",
  finanzas: "Finanzas",
  gastosRecurrentes: "Gastos Recurrentes",
  tipoCambio: "Tipo de Cambio",
  cuentasCorrientes: "Cuentas Corrientes (venta a fiado)",
  reportes: "Reportes",
  objetivosVentas: "Objetivos de Ventas",
  promociones: "Promociones",
  fidelidad: "Fidelización de clientes",
  usuarios: "Usuarios",
  auditoria: "Auditoría",
  sucursales: "Sucursales",
  arca: "ARCA / AFIP (configuración)",
  empresa: "Empresa",
  printbox: "PrintBox",
};

const ALL_FEATURES_ON: Record<PlanFeatureKey, boolean> = Object.fromEntries(
  (Object.keys(FEATURE_LABELS) as PlanFeatureKey[]).map((k) => [k, true])
) as Record<PlanFeatureKey, boolean>;

export type Plan = {
  id: string;
  name: string;
  priceArs: number;
  regularPriceArs: number;
  currency: string;
  tagline: string;
  highlighted: boolean;
  limits: PlanLimits;
  features: Record<PlanFeatureKey, boolean>;
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
    features: { ...ALL_FEATURES_ON, fidelidad: false, promociones: false, cuentasCorrientes: false },
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
    features: ALL_FEATURES_ON,
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
    features: ALL_FEATURES_ON,
  },
];

export function getPlan(id?: string | null): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS.find((p) => p.id === DEFAULT_PLAN_ID)!;
}

export function hasPlanFeature(plan: Plan, feature: PlanFeatureKey): boolean {
  return !!plan.features[feature];
}

export function isLaunchPriceActive(): boolean {
  return Date.now() < LAUNCH_PRICE_ENDS_AT.getTime();
}

// Fuente de verdad de "cuanto se cobra AHORA": antes del vencimiento es el
// precio de lanzamiento, despues pasa solo al precio de lista -- sin este
// helper, createCheckout() seguia usando plan.priceArs a mano incluso
// pasada la fecha, y el precio de lanzamiento hubiera quedado vigente para
// siempre en vez de por tiempo limitado como dice la landing.
export function getEffectivePrice(plan: Plan): number {
  return isLaunchPriceActive() ? plan.priceArs : plan.regularPriceArs;
}
