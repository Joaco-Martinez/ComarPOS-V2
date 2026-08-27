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
export type NavItem = { href: string; icon: NavIconComponent; label: string; color: string; moduleKey?: PlanFeatureKey; group: string };

export const NAV: NavItem[] = [
  { href: '/guia',         icon: GuiaIcon,        label: 'Guía de arranque',   color: '#18C15E', group: 'Ayuda' },
  { href: '/pos',          icon: PosIcon,         label: 'POS — Ventas',       color: '#0D59E7', moduleKey: 'pos', group: 'Ventas' },
  { href: '/ventas',       icon: VentasIcon,      label: 'Historial Ventas',   color: '#0D59E7', moduleKey: 'ventas', group: 'Ventas' },
  { href: '/productos',    icon: ProductosIcon,   label: 'Productos',          color: '#18C15E', moduleKey: 'productos', group: 'Productos y stock' },
  { href: '/categorias',   icon: CategoriasIcon,  label: 'Categorías',         color: '#F39C12', moduleKey: 'categorias', group: 'Productos y stock' },
  { href: '/clientes',     icon: ClientesIcon,    label: 'Clientes',           color: '#00B4DB', moduleKey: 'clientes', group: 'Clientes' },
  { href: '/stock',        icon: StockIcon,       label: 'Stock',              color: '#6474BB', moduleKey: 'stock', group: 'Productos y stock' },
  { href: '/alertas',      icon: AlertasIcon,     label: 'Alertas',            color: '#EF4444', moduleKey: 'alertas', group: 'Productos y stock' },
  { href: '/caja',         icon: CajaIcon,        label: 'Caja',               color: '#18C15E', moduleKey: 'caja', group: 'Ventas' },
  { href: '/servicios',    icon: ServiciosIcon,   label: 'Servicios',          color: '#F39C12', moduleKey: 'servicios', group: 'Ventas' },
  { href: '/hoteleria',    icon: HoteleriaIcon,   label: 'Hotelería',          color: '#8B5CF6', moduleKey: 'hoteleria', group: 'Ventas' },
  { href: '/remitos',      icon: RemitosIcon,     label: 'Remitos',            color: '#00B4DB', moduleKey: 'remitos', group: 'Ventas' },
  { href: '/facturacion',  icon: FacturacionIcon, label: 'AFIP / Facturas',    color: '#00B4DB', moduleKey: 'facturacion', group: 'Facturación' },
  { href: '/devoluciones', icon: DevolucionesIcon,label: 'Devoluciones',       color: '#F39C12', moduleKey: 'devoluciones', group: 'Ventas' },
  { href: '/ayuda',        icon: AyudaIcon,       label: 'Ayuda y contacto',   color: '#6474BB', group: 'Ayuda' },
];

export const ADMIN_NAV: NavItem[] = [
  { href: '/dashboard',                        icon: DashboardIcon,          label: 'Dashboard',           color: '#18C15E', moduleKey: 'dashboard', group: 'Administración' },
  { href: '/compras',                          icon: ComprasIcon,            label: 'Compras',             color: '#18C15E', moduleKey: 'compras', group: 'Compras' },
  { href: '/ordenes-compra',                   icon: OrdenesCompraIcon,      label: 'Órdenes de Compra',   color: '#6474BB', moduleKey: 'ordenesCompra', group: 'Compras' },
  { href: '/proveedores',                      icon: ProveedoresIcon,        label: 'Proveedores',         color: '#00B4DB', moduleKey: 'proveedores', group: 'Compras' },
  { href: '/conteo-stock',                     icon: ConteoStockIcon,        label: 'Conteo de Stock',     color: '#6474BB', moduleKey: 'conteoStock', group: 'Productos y stock' },
  { href: '/finanzas',                         icon: FinanzasIcon,           label: 'Finanzas',            color: '#18C15E', moduleKey: 'finanzas', group: 'Finanzas' },
  { href: '/configuracion/plan-de-cuentas',    icon: FinanzasIcon,           label: 'Plan de Cuentas',      color: '#6474BB', moduleKey: 'finanzas', group: 'Finanzas' },
  { href: '/gastos-recurrentes',               icon: GastosRecurrentesIcon,  label: 'Gastos Recurrentes',  color: '#F39C12', moduleKey: 'gastosRecurrentes', group: 'Finanzas' },
  { href: '/tipo-cambio',                      icon: TipoCambioIcon,         label: 'Tipo de Cambio',      color: '#18C15E', moduleKey: 'tipoCambio', group: 'Finanzas' },
  { href: '/cuentas-corrientes',               icon: CuentasCorrientesIcon,  label: 'Cuentas Corrientes',  color: '#F39C12', moduleKey: 'cuentasCorrientes', group: 'Finanzas' },
  { href: '/reportes',                         icon: ReportesIcon,           label: 'Reportes',            color: '#6474BB', moduleKey: 'reportes', group: 'Finanzas' },
  { href: '/objetivos-ventas',                 icon: ObjetivosVentasIcon,    label: 'Objetivos de Ventas', color: '#18C15E', moduleKey: 'objetivosVentas', group: 'Ventas' },
  { href: '/promociones',                      icon: PromocionesIcon,        label: 'Promociones',         color: '#00B4DB', moduleKey: 'promociones', group: 'Ventas' },
  { href: '/fidelidad',                        icon: FidelidadIcon,          label: 'Fidelidad',           color: '#F39C12', moduleKey: 'fidelidad', group: 'Clientes' },
  { href: '/usuarios',                         icon: UsuariosIcon,           label: 'Usuarios',            color: '#EF4444', moduleKey: 'usuarios', group: 'Administración' },
  { href: '/auditoria',                        icon: AuditoriaIcon,          label: 'Auditoría',           color: '#EF4444', moduleKey: 'auditoria', group: 'Administración' },
  { href: '/configuracion/business-locations', icon: SucursalesIcon,         label: 'Sucursales',          color: '#00B4DB', moduleKey: 'sucursales', group: 'Administración' },
  { href: '/configuracion/arca',               icon: ArcaIcon,               label: 'ARCA / AFIP',         color: '#18C15E', moduleKey: 'arca', group: 'Facturación' },
  { href: '/libro-iva-digital',                icon: FacturacionIcon,        label: 'Libro IVA Digital',   color: '#00B4DB', moduleKey: 'facturacion', group: 'Facturación' },
  { href: '/configuracion/empresa',            icon: EmpresaIcon,            label: 'Empresa',             color: '#F39C12', moduleKey: 'empresa', group: 'Administración' },
  { href: '/configuracion/printbox',           icon: PrintboxIcon,           label: 'PrintBox',            color: '#6474BB', moduleKey: 'printbox', group: 'Administración' },
];

/** Items destacados en el bottom nav mobile (el resto vive en el sheet "Más"). */
export const BOTTOM_NAV_HREFS = ['/ventas', '/stock', '/pos', '/caja'] as const;

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
