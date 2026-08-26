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
    // OJO: esto refleja el estado real de "Módulos por plan" en
    // /platform-admin (PlanFeatureConfig, override sobre el default
    // hardcodeado de billing.ts#ALL_FEATURES_ON) al 2026-08-26, no el
    // default del código -- ese panel se edita sin deploy, así que si
    // vuelve a cambiar qué modulo esta activo/inactivo por plan, hay que
    // volver a mirar esa pantalla y actualizar estos perks a mano.
    // Esencial hoy SOLO tiene: POS, Historial de Ventas, Caja, Servicios,
    // AFIP/Facturas, Devoluciones, Productos, Categorías, Stock, Alertas,
    // Clientes, Dashboard, Usuarios, Sucursales, ARCA config, Empresa y
    // PrintBox. Le faltan (respecto a los otros 2 planes): Remitos, Conteo
    // de Stock, Cuentas Corrientes, Fidelidad, Promociones, Compras,
    // Órdenes de Compra, Proveedores, Finanzas, Gastos Recurrentes, Tipo
    // de Cambio, Reportes, Objetivos de Ventas y Auditoría.
    perks: [
      '1 sucursal, hasta 300 productos y 2 usuarios',
      'POS, facturación AFIP, stock y caja',
      'Servicios técnicos y devoluciones',
      'Clientes y alertas de stock',
    ],
  },
  {
    id: 'profesional',
    name: 'Profesional',
    priceArs: 35000,
    regularPriceArs: 47000,
    tagline: 'El más elegido: para un negocio en crecimiento.',
    highlighted: true,
    // Todos los módulos activos (igual que "multisucursal") -- ver nota en
    // el plan "esencial" de arriba sobre de dónde sale esta lista.
    perks: [
      'Hasta 3 sucursales, productos y usuarios ilimitados',
      'Todo lo de Esencial, más remitos y conteo de stock',
      'Compras, proveedores y finanzas',
      'Cuenta corriente, promociones y fidelización',
      'Reportes gerenciales y objetivos de venta',
    ],
  },
  {
    id: 'multisucursal',
    name: 'Multisucursal',
    priceArs: 52000,
    regularPriceArs: 70000,
    tagline: 'Para cadenas y negocios con varias sucursales.',
    // Mismos módulos activos que "profesional" -- la diferencia real entre
    // estos dos planes son los límites (sucursales), no las funciones.
    perks: [
      'Sucursales, productos y usuarios ilimitados',
      'Todos los módulos, igual que el plan Profesional',
      'Pensado para cadenas con varios locales',
      'Soporte prioritario',
    ],
  },
];
