import {
  PosIcon, VentasIcon, ProductosIcon, CategoriasIcon, ClientesIcon, StockIcon, AlertasIcon,
  CajaIcon, ServiciosIcon, RemitosIcon, FacturacionIcon, DevolucionesIcon, DashboardIcon, ComprasIcon,
  OrdenesCompraIcon, ProveedoresIcon, ConteoStockIcon, FinanzasIcon, GastosRecurrentesIcon,
  TipoCambioIcon, CuentasCorrientesIcon, ReportesIcon, ObjetivosVentasIcon, PromocionesIcon,
  FidelidadIcon, UsuariosIcon, AuditoriaIcon, SucursalesIcon, ArcaIcon, EmpresaIcon, PrintboxIcon,
  GuiaIcon, AyudaIcon, HoteleriaIcon,
  type ComarIconProps,
} from '@/components/icons/ComarIcons';
import type { PlanFeatureKey } from '@/types';

export type NavIconComponent = (props: ComarIconProps) => React.JSX.Element;
// moduleKey ausente = pantalla de soporte/onboarding (guia, ayuda), nunca se
// gatea por plan. Todo lo demas matchea un PlanFeatureKey (ver
// store/planFeatures.ts, components/AppLayout.tsx y components/Sidebar.tsx).
// intro = texto corto que se muestra UNA sola vez (ver components/SectionIntro.tsx)
// la primera vez que alguien entra a esa pantalla, para que un tenant nuevo
// entienda que hace cada seccion sin tener que abrir el Centro de ayuda -
// ausente en paginas que ya se explican solas (guia, ayuda).
export type NavItem = { href: string; icon: NavIconComponent; label: string; color: string; moduleKey?: PlanFeatureKey; group: string; intro?: string };

export const NAV: NavItem[] = [
  { href: '/guia',         icon: GuiaIcon,        label: 'Guía de arranque',   color: '#18C15E', group: 'Ayuda' },
  { href: '/pos',          icon: PosIcon,         label: 'POS — Ventas',       color: '#0D59E7', moduleKey: 'pos', group: 'Ventas',
    intro: 'Acá hacés tus ventas del día a día: buscá o escaneá un producto, armá el carrito y cobrá. Si el cliente pide factura, se emite al momento con AFIP.' },
  { href: '/ventas',       icon: VentasIcon,      label: 'Historial Ventas',   color: '#0D59E7', moduleKey: 'ventas', group: 'Ventas',
    intro: 'El historial de todas tus ventas, con filtros por fecha, medio de pago y vendedor. Desde acá podés reimprimir un ticket o ver el detalle de cada una.' },
  { href: '/caja',         icon: CajaIcon,        label: 'Caja',               color: '#18C15E', moduleKey: 'caja', group: 'Ventas',
    intro: 'Abrí la caja al empezar el turno y cerrala al final para cuadrar el efectivo. El cierre te muestra cuánto entró por cada medio de pago.' },
  { href: '/cotizaciones', icon: RemitosIcon,     label: 'Cotizaciones',       color: '#0D59E7', group: 'Ventas',
    intro: 'Armá presupuestos para un cliente sin que afecten el stock ni la caja. Si lo acepta, lo convertís en venta con un clic.' },
  { href: '/remitos',      icon: RemitosIcon,     label: 'Remitos',            color: '#00B4DB', moduleKey: 'remitos', group: 'Ventas',
    intro: 'Generá remitos con CAI de AFIP para acompañar mercadería que sale sin factura, por ejemplo entre sucursales o a domicilio.' },
  { href: '/devoluciones', icon: DevolucionesIcon,label: 'Devoluciones',       color: '#F39C12', moduleKey: 'devoluciones', group: 'Ventas',
    intro: 'Registrá la devolución de una venta ya hecha: repone el stock y revierte el pago o la deuda del cliente, según corresponda.' },
  { href: '/productos',    icon: ProductosIcon,   label: 'Productos',          color: '#18C15E', moduleKey: 'productos', group: 'Catálogo y stock',
    intro: 'Tu catálogo: cargá cada producto con precio, stock inicial y si se vende por unidad o por peso. Es lo primero que necesitás para poder vender.' },
  { href: '/productos/listas-de-precios', icon: PromocionesIcon, label: 'Listas de precios', color: '#18C15E', group: 'Catálogo y stock',
    intro: 'Armá listas de precios distintas (mayorista, por sucursal, etc.) para aplicar a un mismo producto según el cliente o el canal de venta.' },
  { href: '/categorias',   icon: CategoriasIcon,  label: 'Categorías',         color: '#F39C12', moduleKey: 'categorias', group: 'Catálogo y stock',
    intro: 'Organizá tus productos en categorías antes de cargarlos — te sirve después para filtrar, reportar y armar promociones.' },
  { href: '/stock',        icon: StockIcon,       label: 'Stock',              color: '#6474BB', moduleKey: 'stock', group: 'Catálogo y stock',
    intro: 'El stock actual de cada producto, por sucursal. Desde acá también podés ajustarlo a mano o transferirlo entre sucursales.' },
  { href: '/alertas',      icon: AlertasIcon,     label: 'Alertas',            color: '#EF4444', moduleKey: 'alertas', group: 'Catálogo y stock',
    intro: 'Avisos automáticos de stock bajo, para que sepas qué reponer sin tener que revisar producto por producto.' },
  { href: '/clientes',     icon: ClientesIcon,    label: 'Clientes',           color: '#00B4DB', moduleKey: 'clientes', group: 'Clientes',
    intro: 'La ficha de cada cliente: datos de contacto, historial de compras y, si usás cuenta corriente, su saldo y límite de crédito.' },
  { href: '/servicios',    icon: ServiciosIcon,   label: 'Servicios',          color: '#F39C12', moduleKey: 'servicios', group: 'Servicios y hotelería',
    intro: 'Gestioná reparaciones o servicios técnicos: recibí el equipo, seguí el estado del arreglo y cobrá cuando esté listo.' },
  { href: '/hoteleria',    icon: HoteleriaIcon,   label: 'Hotelería',          color: '#8B5CF6', moduleKey: 'hoteleria', group: 'Servicios y hotelería',
    intro: 'Manejá tus habitaciones o cabañas: disponibilidad, reservas y check-in/check-out.' },
  { href: '/facturacion',  icon: FacturacionIcon, label: 'AFIP / Facturas',    color: '#00B4DB', moduleKey: 'facturacion', group: 'Facturación',
    intro: 'Todas las facturas emitidas con CAE de AFIP, para consultarlas o reimprimirlas cuando haga falta.' },
  { href: '/ayuda',        icon: AyudaIcon,       label: 'Ayuda y contacto',   color: '#6474BB', group: 'Ayuda' },
];

export const ADMIN_NAV: NavItem[] = [
  { href: '/dashboard',                        icon: DashboardIcon,          label: 'Dashboard',           color: '#18C15E', moduleKey: 'dashboard', group: 'Administración',
    intro: 'Un resumen de cómo viene tu negocio: ventas, productos más vendidos y alertas importantes, todo en una sola pantalla.' },
  { href: '/usuarios',                         icon: UsuariosIcon,           label: 'Usuarios',            color: '#EF4444', moduleKey: 'usuarios', group: 'Administración',
    intro: 'Creá un usuario para cada persona que trabaje con vos, con su propio rol y permisos. Evitá que todos compartan la misma cuenta.' },
  { href: '/auditoria',                        icon: AuditoriaIcon,          label: 'Auditoría',           color: '#EF4444', moduleKey: 'auditoria', group: 'Administración',
    intro: 'El registro de quién hizo qué y cuándo dentro del sistema — útil para investigar un cambio o un problema puntual.' },
  { href: '/configuracion/business-locations', icon: SucursalesIcon,         label: 'Sucursales',          color: '#00B4DB', moduleKey: 'sucursales', group: 'Administración',
    intro: 'Tus sucursales o depósitos. Si tenés más de un local, cargalos acá para manejar el stock de cada uno por separado.' },
  { href: '/configuracion/empresa',            icon: EmpresaIcon,            label: 'Empresa',             color: '#F39C12', moduleKey: 'empresa', group: 'Administración',
    intro: 'Los datos de tu negocio (razón social, CUIT, dirección) que se imprimen en tickets, facturas y remitos.' },
  { href: '/configuracion/printbox',           icon: PrintboxIcon,           label: 'PrintBox',            color: '#6474BB', moduleKey: 'printbox', group: 'Administración',
    intro: 'Configurá la impresora de tickets conectada a esta computadora.' },
  { href: '/compras',                          icon: ComprasIcon,            label: 'Compras',             color: '#18C15E', moduleKey: 'compras', group: 'Compras',
    intro: 'Registrá lo que le comprás a tus proveedores — suma stock automáticamente cuando cargás la compra.' },
  { href: '/ordenes-compra',                   icon: OrdenesCompraIcon,      label: 'Órdenes de Compra',   color: '#6474BB', moduleKey: 'ordenesCompra', group: 'Compras',
    intro: 'Armá una orden de compra para pedirle mercadería a un proveedor, antes de que llegue y se convierta en una compra.' },
  { href: '/proveedores',                      icon: ProveedoresIcon,        label: 'Proveedores',         color: '#00B4DB', moduleKey: 'proveedores', group: 'Compras',
    intro: 'La ficha de cada proveedor: datos de contacto y el historial de lo que le compraste.' },
  { href: '/conteo-stock',                     icon: ConteoStockIcon,        label: 'Conteo de Stock',     color: '#6474BB', moduleKey: 'conteoStock', group: 'Catálogo y stock',
    intro: 'Contá el stock físico de tu local y comparalo con lo que dice el sistema, para corregir diferencias.' },
  { href: '/finanzas',                         icon: FinanzasIcon,           label: 'Finanzas',            color: '#18C15E', moduleKey: 'finanzas', group: 'Finanzas',
    intro: 'Un resumen de ingresos y egresos de tu negocio, más allá de las ventas del POS.' },
  { href: '/configuracion/plan-de-cuentas',    icon: FinanzasIcon,           label: 'Plan de Cuentas',      color: '#6474BB', moduleKey: 'finanzas', group: 'Finanzas',
    intro: 'Las cuentas contables que usás para clasificar tus movimientos financieros.' },
  { href: '/gastos-recurrentes',               icon: GastosRecurrentesIcon,  label: 'Gastos Recurrentes',  color: '#F39C12', moduleKey: 'gastosRecurrentes', group: 'Finanzas',
    intro: 'Cargá gastos que se repiten todos los meses (alquiler, sueldos, servicios) para no tener que anotarlos a mano cada vez.' },
  { href: '/tipo-cambio',                      icon: TipoCambioIcon,         label: 'Tipo de Cambio',      color: '#18C15E', moduleKey: 'tipoCambio', group: 'Finanzas',
    intro: 'El tipo de cambio que usa el sistema para mostrar precios o reportes en otra moneda.' },
  { href: '/cuentas-corrientes',               icon: CuentasCorrientesIcon,  label: 'Cuentas Corrientes',  color: '#F39C12', moduleKey: 'cuentasCorrientes', group: 'Finanzas',
    intro: 'Clientes que compran a fiado: acá ves su deuda, los pagos que hicieron y el límite de crédito de cada uno.' },
  { href: '/reportes',                         icon: ReportesIcon,           label: 'Reportes',            color: '#6474BB', moduleKey: 'reportes', group: 'Finanzas',
    intro: 'Reportes de ventas, stock y más, para entender cómo viene tu negocio en el tiempo.' },
  { href: '/objetivos-ventas',                 icon: ObjetivosVentasIcon,    label: 'Objetivos de Ventas', color: '#18C15E', moduleKey: 'objetivosVentas', group: 'Marketing',
    intro: 'Definí una meta de ventas por período y seguí en tiempo real cuánto te falta para llegar.' },
  { href: '/promociones',                      icon: PromocionesIcon,        label: 'Promociones',         color: '#00B4DB', moduleKey: 'promociones', group: 'Marketing',
    intro: 'Armá descuentos que se aplican solos en el POS al cumplirse una condición (2x1, descuento por cantidad, etc.).' },
  { href: '/fidelidad',                        icon: FidelidadIcon,          label: 'Fidelidad',           color: '#F39C12', moduleKey: 'fidelidad', group: 'Clientes',
    intro: 'Sistema de puntos para tus clientes: acumulan con cada compra y los pueden canjear después.' },
  { href: '/tienda-online/pedidos',            icon: DevolucionesIcon,       label: 'Pedidos Online',      color: '#0D59E7', moduleKey: 'tiendaOnline', group: 'Tienda Online',
    intro: 'Los pedidos que te hacen tus clientes desde tu tienda online, para que los confirmes y prepares.' },
  { href: '/tienda-online/personalizacion',    icon: EmpresaIcon,            label: 'Tienda Online',       color: '#0D59E7', moduleKey: 'tiendaOnline', group: 'Tienda Online',
    intro: 'Personalizá tu tienda online: nombre, banner, horarios de atención y cómo entregás los pedidos (retiro o envío).' },
  { href: '/tienda-online/pagos',              icon: FinanzasIcon,           label: 'Pagos Online',        color: '#0D59E7', moduleKey: 'tiendaOnline', group: 'Tienda Online',
    intro: 'Configurá Mercado Pago para cobrar los pedidos que te hacen desde tu tienda online.' },
  { href: '/configuracion/arca',               icon: ArcaIcon,               label: 'ARCA / AFIP',         color: '#18C15E', moduleKey: 'arca', group: 'Facturación',
    intro: 'Cargá tus certificados y punto de venta de AFIP/ARCA — sin esto no podés emitir facturas con CAE real.' },
  { href: '/libro-iva-digital',                icon: FacturacionIcon,        label: 'Libro IVA Digital',   color: '#00B4DB', moduleKey: 'facturacion', group: 'Facturación',
    intro: 'El libro IVA digital con tus ventas y compras, listo para exportar y presentar.' },
];

/** Items destacados en el bottom nav mobile (el resto vive en el sheet "Más"). */
export const BOTTOM_NAV_HREFS = ['/ventas', '/stock', '/pos', '/caja'] as const;

// Orden fijo de grupos tematicos (no alfabetico ni el de aparicion en los
// arrays de arriba) - lo usan tanto el Sidebar de escritorio como el "more
// sheet" mobile (BottomNav.tsx) para que la navegacion este agrupada por
// tema en vez de ser una lista plana de ~40 items, dificil de escanear.
export const GROUP_ORDER = [
  'Ventas',
  'Catálogo y stock',
  'Clientes',
  'Tienda Online',
  'Marketing',
  'Servicios y hotelería',
  'Compras',
  'Finanzas',
  'Facturación',
  'Administración',
  'Ayuda',
];

/** Agrupa items por su campo `group`, ordenados segun GROUP_ORDER. */
export function groupNavItems(items: NavItem[]): [string, NavItem[]][] {
  return items
    .reduce<[string, NavItem[]][]>((groups, item) => {
      const existing = groups.find(([name]) => name === item.group);
      if (existing) existing[1].push(item);
      else groups.push([item.group, [item]]);
      return groups;
    }, [])
    .sort(([a], [b]) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b));
}

const ALL_NAV_ITEMS = [...NAV, ...ADMIN_NAV];

/**
 * De una ruta relativa al tenant (ej. "/configuracion/arca") al modulo que
 * la gatea, si tiene uno -- usado por AppLayout para bloquear la pantalla
 * entera si el plan del tenant no incluye ese modulo. Matchea por prefijo
 * (startsWith) para cubrir subrutas del mismo item de menu.
 */
export function moduleKeyForPath(afterTenantPath: string): PlanFeatureKey | undefined {
  const item = ALL_NAV_ITEMS.find(
    (i) => afterTenantPath === i.href || afterTenantPath.startsWith(`${i.href}/`)
  );
  return item?.moduleKey;
}

/**
 * Item de navegacion que matchea una ruta, priorizando el href mas
 * especifico (ej. "/productos/listas-de-precios" por sobre "/productos")
 * -- a diferencia de moduleKeyForPath (que solo necesita EL modulo, y los
 * dos comparten el mismo), acá si importa: cada item tiene su propio
 * `intro`, asi que quedarse con el primer match por orden de array
 * mostraria el texto de "Productos" en la pantalla de listas de precios.
 * Usado por components/SectionIntro.tsx.
 */
export function navItemForPath(afterTenantPath: string): NavItem | undefined {
  const matches = ALL_NAV_ITEMS.filter(
    (i) => afterTenantPath === i.href || afterTenantPath.startsWith(`${i.href}/`)
  );
  if (matches.length === 0) return undefined;
  return matches.reduce((best, i) => (i.href.length > best.href.length ? i : best));
}
