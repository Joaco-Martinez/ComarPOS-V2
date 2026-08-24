// Mantener en sync con backend/src/config/billing.ts (PLANS/LAUNCH_PRICE_ENDS_AT).
// No se trae por fetch a proposito en la landing/JSON-LD: es contenido
// publico que se sirve como HTML estatico para que el precio sea indexable
// por buscadores sin esperar un round-trip al backend (mismo criterio que
// ya tenia el plan unico anterior, PLAN_PRICE_ARS). /prueba-gratis y
// /suscripcion (paginas transaccionales, ya client-side) si consultan
// GET /billing/plans en vivo.
export type LandingPlan = {
  id: string;
  name: string;
  priceArs: number;
  regularPriceArs: number;
  tagline: string;
  highlighted?: boolean;
  perks: string[];
};

export const LAUNCH_PRICE_ENDS_AT = new Date('2026-09-24T00:00:00-03:00');
export const LAUNCH_PRICE_ENDS_LABEL = LAUNCH_PRICE_ENDS_AT.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });

// Misma cuenta que backend/src/config/billing.ts#isLaunchPriceActive -- acá
// también en vez de un flag hardcodeado, para que apenas pase la fecha la
// landing (que se sirve dinámica por request, ver headers() en
// app/page.tsx) deje de mostrar precio de lanzamiento sola, sin redeploy.
export function isLaunchPriceActive(now: Date = new Date()): boolean {
  return now.getTime() < LAUNCH_PRICE_ENDS_AT.getTime();
}

export const PLANS: LandingPlan[] = [
  {
    id: 'esencial',
    name: 'Esencial',
    priceArs: 24000,
    regularPriceArs: 32000,
    tagline: 'Para arrancar con lo justo y necesario.',
    perks: ['1 sucursal', 'Hasta 300 productos', 'Hasta 2 usuarios', 'Facturación AFIP incluida'],
  },
  {
    id: 'profesional',
    name: 'Profesional',
    priceArs: 35000,
    regularPriceArs: 47000,
    tagline: 'El más elegido: para un negocio en crecimiento.',
    highlighted: true,
    perks: ['Hasta 3 sucursales', 'Productos ilimitados', 'Usuarios ilimitados', 'Facturación AFIP incluida'],
  },
  {
    id: 'multisucursal',
    name: 'Multisucursal',
    priceArs: 52000,
    regularPriceArs: 70000,
    tagline: 'Para cadenas y negocios con varias sucursales.',
    perks: ['Sucursales ilimitadas', 'Productos ilimitados', 'Usuarios ilimitados', 'Soporte prioritario'],
  },
];
