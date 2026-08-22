import {
  PosIcon, VentasIcon, ProductosIcon, CategoriasIcon, ClientesIcon, StockIcon, AlertasIcon,
  CajaIcon, RemitosIcon, FacturacionIcon, DevolucionesIcon, DashboardIcon, ComprasIcon,
  OrdenesCompraIcon, ProveedoresIcon, ConteoStockIcon, FinanzasIcon, GastosRecurrentesIcon,
  TipoCambioIcon, CuentasCorrientesIcon, ReportesIcon, ObjetivosVentasIcon, PromocionesIcon,
  FidelidadIcon, UsuariosIcon, AuditoriaIcon, SucursalesIcon, ArcaIcon, EmpresaIcon, PrintboxIcon,
  GuiaIcon,
  type ComarIconProps,
} from '@/components/icons/ComarIcons';

export type NavIconComponent = (props: ComarIconProps) => React.JSX.Element;
export type NavItem = { href: string; icon: NavIconComponent; label: string; color: string };

export const NAV: NavItem[] = [
  { href: '/guia',         icon: GuiaIcon,        label: 'Guía de arranque',   color: '#18C15E' },
  { href: '/pos',          icon: PosIcon,         label: 'POS — Ventas',       color: '#0D59E7' },
  { href: '/ventas',       icon: VentasIcon,      label: 'Historial Ventas',   color: '#0D59E7' },
  { href: '/productos',    icon: ProductosIcon,   label: 'Productos',          color: '#18C15E' },
  { href: '/categorias',   icon: CategoriasIcon,  label: 'Categorías',         color: '#F39C12' },
  { href: '/clientes',     icon: ClientesIcon,    label: 'Clientes',           color: '#00B4DB' },
  { href: '/stock',        icon: StockIcon,       label: 'Stock',              color: '#6474BB' },
  { href: '/alertas',      icon: AlertasIcon,     label: 'Alertas',            color: '#EF4444' },
  { href: '/caja',         icon: CajaIcon,        label: 'Caja',               color: '#18C15E' },
  { href: '/remitos',      icon: RemitosIcon,     label: 'Remitos',            color: '#00B4DB' },
  { href: '/facturacion',  icon: FacturacionIcon, label: 'AFIP / Facturas',    color: '#00B4DB' },
  { href: '/devoluciones', icon: DevolucionesIcon,label: 'Devoluciones',       color: '#F39C12' },
];

export const ADMIN_NAV: NavItem[] = [
  { href: '/dashboard',                        icon: DashboardIcon,          label: 'Dashboard',           color: '#18C15E' },
  { href: '/compras',                          icon: ComprasIcon,            label: 'Compras',             color: '#18C15E' },
  { href: '/ordenes-compra',                   icon: OrdenesCompraIcon,      label: 'Órdenes de Compra',   color: '#6474BB' },
  { href: '/proveedores',                      icon: ProveedoresIcon,        label: 'Proveedores',         color: '#00B4DB' },
  { href: '/conteo-stock',                     icon: ConteoStockIcon,        label: 'Conteo de Stock',     color: '#6474BB' },
  { href: '/finanzas',                         icon: FinanzasIcon,           label: 'Finanzas',            color: '#18C15E' },
  { href: '/gastos-recurrentes',               icon: GastosRecurrentesIcon,  label: 'Gastos Recurrentes',  color: '#F39C12' },
  { href: '/tipo-cambio',                      icon: TipoCambioIcon,         label: 'Tipo de Cambio',      color: '#18C15E' },
  { href: '/cuentas-corrientes',               icon: CuentasCorrientesIcon,  label: 'Cuentas Corrientes',  color: '#F39C12' },
  { href: '/reportes',                         icon: ReportesIcon,           label: 'Reportes',            color: '#6474BB' },
  { href: '/objetivos-ventas',                 icon: ObjetivosVentasIcon,    label: 'Objetivos de Ventas', color: '#18C15E' },
  { href: '/promociones',                      icon: PromocionesIcon,        label: 'Promociones',         color: '#00B4DB' },
  { href: '/fidelidad',                        icon: FidelidadIcon,          label: 'Fidelidad',           color: '#F39C12' },
  { href: '/usuarios',                         icon: UsuariosIcon,           label: 'Usuarios',            color: '#EF4444' },
  { href: '/auditoria',                        icon: AuditoriaIcon,          label: 'Auditoría',           color: '#EF4444' },
  { href: '/configuracion/business-locations', icon: SucursalesIcon,         label: 'Sucursales',          color: '#00B4DB' },
  { href: '/configuracion/arca',               icon: ArcaIcon,               label: 'ARCA / AFIP',         color: '#18C15E' },
  { href: '/configuracion/empresa',            icon: EmpresaIcon,            label: 'Empresa',             color: '#F39C12' },
  { href: '/configuracion/printbox',           icon: PrintboxIcon,           label: 'PrintBox',            color: '#6474BB' },
];

/** Items destacados en el bottom nav mobile (el resto vive en el sheet "Más"). */
export const BOTTOM_NAV_HREFS = ['/ventas', '/stock', '/pos', '/caja'] as const;
