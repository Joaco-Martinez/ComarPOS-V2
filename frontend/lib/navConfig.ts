import {
  PosIcon, VentasIcon, ProductosIcon, CategoriasIcon, ClientesIcon, StockIcon, AlertasIcon,
  CajaIcon, ServiciosIcon, RemitosIcon, FacturacionIcon, DevolucionesIcon, DashboardIcon, ComprasIcon,
  OrdenesCompraIcon, ProveedoresIcon, ConteoStockIcon, FinanzasIcon, GastosRecurrentesIcon,
  TipoCambioIcon, CuentasCorrientesIcon, ReportesIcon, ObjetivosVentasIcon, PromocionesIcon,
  FidelidadIcon, UsuariosIcon, AuditoriaIcon, SucursalesIcon, ArcaIcon, EmpresaIcon, PrintboxIcon,
  GuiaIcon, AyudaIcon,
  type ComarIconProps,
} from '@/components/icons/ComarIcons';
import type { PlanFeatureKey } from '@/types';

export type NavIconComponent = (props: ComarIconProps) => React.JSX.Element;
// moduleKey ausente = pantalla de soporte/onboarding (guia, ayuda), nunca se
// gatea por plan. Todo lo demas matchea un PlanFeatureKey (ver
// store/planFeatures.ts, components/AppLayout.tsx y components/Sidebar.tsx).
export type NavItem = { href: string; icon: NavIconComponent; label: string; color: string; moduleKey?: PlanFeatureKey };

export const NAV: NavItem[] = [
  { href: '/guia',         icon: GuiaIcon,        label: 'Guía de arranque',   color: '#18C15E' },
  { href: '/pos',          icon: PosIcon,         label: 'POS — Ventas',       color: '#0D59E7', moduleKey: 'pos' },
  { href: '/ventas',       icon: VentasIcon,      label: 'Historial Ventas',   color: '#0D59E7', moduleKey: 'ventas' },
  { href: '/productos',    icon: ProductosIcon,   label: 'Productos',          color: '#18C15E', moduleKey: 'productos' },
  { href: '/categorias',   icon: CategoriasIcon,  label: 'Categorías',         color: '#F39C12', moduleKey: 'categorias' },
  { href: '/clientes',     icon: ClientesIcon,    label: 'Clientes',           color: '#00B4DB', moduleKey: 'clientes' },
  { href: '/stock',        icon: StockIcon,       label: 'Stock',              color: '#6474BB', moduleKey: 'stock' },
  { href: '/alertas',      icon: AlertasIcon,     label: 'Alertas',            color: '#EF4444', moduleKey: 'alertas' },
  { href: '/caja',         icon: CajaIcon,        label: 'Caja',               color: '#18C15E', moduleKey: 'caja' },
  { href: '/servicios',    icon: ServiciosIcon,   label: 'Servicios',          color: '#F39C12', moduleKey: 'servicios' },
  { href: '/remitos',      icon: RemitosIcon,     label: 'Remitos',            color: '#00B4DB', moduleKey: 'remitos' },
  { href: '/facturacion',  icon: FacturacionIcon, label: 'AFIP / Facturas',    color: '#00B4DB', moduleKey: 'facturacion' },
  { href: '/devoluciones', icon: DevolucionesIcon,label: 'Devoluciones',       color: '#F39C12', moduleKey: 'devoluciones' },
  { href: '/ayuda',        icon: AyudaIcon,       label: 'Ayuda y contacto',   color: '#6474BB' },
];

export const ADMIN_NAV: NavItem[] = [
  { href: '/dashboard',                        icon: DashboardIcon,          label: 'Dashboard',           color: '#18C15E', moduleKey: 'dashboard' },
  { href: '/compras',                          icon: ComprasIcon,            label: 'Compras',             color: '#18C15E', moduleKey: 'compras' },
  { href: '/ordenes-compra',                   icon: OrdenesCompraIcon,      label: 'Órdenes de Compra',   color: '#6474BB', moduleKey: 'ordenesCompra' },
  { href: '/proveedores',                      icon: ProveedoresIcon,        label: 'Proveedores',         color: '#00B4DB', moduleKey: 'proveedores' },
  { href: '/conteo-stock',                     icon: ConteoStockIcon,        label: 'Conteo de Stock',     color: '#6474BB', moduleKey: 'conteoStock' },
  { href: '/finanzas',                         icon: FinanzasIcon,           label: 'Finanzas',            color: '#18C15E', moduleKey: 'finanzas' },
  { href: '/gastos-recurrentes',               icon: GastosRecurrentesIcon,  label: 'Gastos Recurrentes',  color: '#F39C12', moduleKey: 'gastosRecurrentes' },
  { href: '/tipo-cambio',                      icon: TipoCambioIcon,         label: 'Tipo de Cambio',      color: '#18C15E', moduleKey: 'tipoCambio' },
  { href: '/cuentas-corrientes',               icon: CuentasCorrientesIcon,  label: 'Cuentas Corrientes',  color: '#F39C12', moduleKey: 'cuentasCorrientes' },
  { href: '/reportes',                         icon: ReportesIcon,           label: 'Reportes',            color: '#6474BB', moduleKey: 'reportes' },
  { href: '/objetivos-ventas',                 icon: ObjetivosVentasIcon,    label: 'Objetivos de Ventas', color: '#18C15E', moduleKey: 'objetivosVentas' },
  { href: '/promociones',                      icon: PromocionesIcon,        label: 'Promociones',         color: '#00B4DB', moduleKey: 'promociones' },
  { href: '/fidelidad',                        icon: FidelidadIcon,          label: 'Fidelidad',           color: '#F39C12', moduleKey: 'fidelidad' },
  { href: '/usuarios',                         icon: UsuariosIcon,           label: 'Usuarios',            color: '#EF4444', moduleKey: 'usuarios' },
  { href: '/auditoria',                        icon: AuditoriaIcon,          label: 'Auditoría',           color: '#EF4444', moduleKey: 'auditoria' },
  { href: '/configuracion/business-locations', icon: SucursalesIcon,         label: 'Sucursales',          color: '#00B4DB', moduleKey: 'sucursales' },
  { href: '/configuracion/arca',               icon: ArcaIcon,               label: 'ARCA / AFIP',         color: '#18C15E', moduleKey: 'arca' },
  { href: '/libro-iva-digital',                icon: FacturacionIcon,        label: 'Libro IVA Digital',   color: '#00B4DB', moduleKey: 'facturacion' },
  { href: '/configuracion/empresa',            icon: EmpresaIcon,            label: 'Empresa',             color: '#F39C12', moduleKey: 'empresa' },
  { href: '/configuracion/printbox',           icon: PrintboxIcon,           label: 'PrintBox',            color: '#6474BB', moduleKey: 'printbox' },
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
