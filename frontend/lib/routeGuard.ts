// Clasifica un pathname como "puede llegar a resolver a una ruta real" o
// "estructuralmente imposible" (ningun archivo de app/ puede matchearlo),
// a partir del arbol de rutas estatico del proyecto. Usado por proxy.ts para
// devolver un 404 real en vez de redirigir a /login rutas que jamas van a
// resolver -- eso era lo que generaba el soft-404 (200 con el shell de
// /login) que reportaba la auditoria "Is Agentic": un agente pidiendo
// /some-path-that-does-not-exist terminaba viendo un 200 con contenido.
//
// /platform-admin no pasa por acá: tiene su propio bloque de auth en
// proxy.ts y muy pocas rutas propias, no vale la pena sumarlo a este mapa.

// Paginas de un solo nivel (app/<x>/page.tsx), sin sub-rutas propias.
const NO_SUBROUTE_PAGES = new Set([
  'app', 'login', 'instalar', 'prueba-gratis', 'suscripcion',
  'terminos', 'privacidad', 'arrepentimiento', 'about', 'contact', 'privacy',
]);

// Paginas con exactamente un segmento dinamico extra (app/<x>/[slug]/page.tsx).
const SINGLE_DYNAMIC_SEGMENT_PAGES = new Set(['para', 'presupuesto']);

// Sub-rutas reales bajo app/[tenant]/<sub>/... (nombres de carpeta en
// frontend/app/[tenant]/). Cualquier segmento fuera de esta lista como
// segundo tramo de un posible slug de tenant no puede resolver a nada.
const TENANT_SUBROUTES = new Set([
  'alertas', 'auditoria', 'ayuda', 'caja', 'categorias', 'clientes', 'compras',
  'configuracion', 'conteo-stock', 'cotizaciones', 'cuentas-corrientes', 'dashboard', 'devoluciones',
  'facturacion', 'fidelidad', 'finanzas', 'gastos-recurrentes', 'guia', 'hoteleria',
  'libro-iva-digital', 'objetivos-ventas', 'ordenes-compra', 'pos', 'productos',
  'promociones', 'proveedores', 'remitos', 'reportes', 'servicios', 'stock',
  'tienda-online', 'tipo-cambio', 'usuarios', 'ventas',
]);

export function isResolvableAppPath(pathname: string): boolean {
  if (pathname === '/') return true;
  const segments = pathname.split('/').filter(Boolean);
  const [first, second] = segments;

  if (NO_SUBROUTE_PAGES.has(first)) {
    return segments.length === 1;
  }
  if (SINGLE_DYNAMIC_SEGMENT_PAGES.has(first)) {
    return segments.length === 2;
  }
  // Tienda online publica: app/tienda/[tenantSlug]/... - el segundo tramo es
  // un slug de TENANT (dinamico, no una lista fija de nombres de carpeta como
  // TENANT_SUBROUTES), asi que no se valida contra un set - solo que haya
  // al menos /tienda/:slug. Los tramos siguientes (productos, carrito, etc.)
  // son sub-rutas propias de ese segmento dinamico.
  if (first === 'tienda') {
    return segments.length >= 2;
  }
  // Cualquier otro primer segmento solo puede ser un slug de tenant --
  // no hay app/[tenant]/page.tsx (sin sub-ruta no resuelve), y el segundo
  // tramo tiene que ser una sub-ruta real conocida.
  if (segments.length === 1) return false;
  return TENANT_SUBROUTES.has(second);
}
