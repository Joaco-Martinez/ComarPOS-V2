// Set de íconos custom para ComarPOS — un glifo propio por sección (POS, Productos,
// Clientes, etc), dibujados a mano en vez de usar la librería lucide-react. Mismo
// formato que un ícono de lucide (viewBox 24x24, stroke=currentColor, size/style/className
// como props) para poder usarse como reemplazo directo en Sidebar/BottomNav/"Más".
// Cada glifo suma un pequeño detalle relleno (punto, insignia) como firma visual
// consistente entre todos, sin copiar path data de ninguna librería existente.

export interface ComarIconProps {
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

const base = {
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Svg({ size = 24, className, style, children }: ComarIconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} {...base} className={className} style={style}>
      {children}
    </svg>
  );
}

export function PosIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10.5H21" />
      <rect x="9" y="3" width="6" height="3" rx="1" />
      <circle cx="17.3" cy="15" r="1.3" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function VentasIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3H18V17.3L16.5 19L15 17.3L13.5 19L12 17.3L10.5 19L9 17.3L7.5 19L6 17.3V3Z" />
      <path d="M9 8H15" />
      <path d="M9 11.7H15" />
    </Svg>
  );
}

export function ProductosIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3L20 7.2V16.3L12 21L4 16.3V7.2L12 3Z" />
      <path d="M4 7.2L12 12L20 7.2" />
      <path d="M12 12V21" />
    </Svg>
  );
}

export function CategoriasIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3L21 8L12 13L3 8L12 3Z" />
      <path d="M3 12L12 17L21 12" />
      <path d="M3 16L12 21L21 16" />
    </Svg>
  );
}

export function ClientesIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <circle cx="8.7" cy="8" r="3" />
      <path d="M3.5 20C3.5 16.7 5.9 14.2 8.7 14.2C11.5 14.2 13.9 16.7 13.9 20" />
      <circle cx="17" cy="8.3" r="2.2" />
      <path d="M15.3 20C15.3 17.1 17 14.8 18.9 14.8C20.6 14.8 21.9 16.6 22 19" />
    </Svg>
  );
}

export function StockIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <path d="M5 20V12" />
      <path d="M12 20V6" />
      <path d="M19 20V15" />
      <path d="M4 20H20" />
    </Svg>
  );
}

export function AlertasIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.3L21.5 20H2.5L12 3.3Z" />
      <path d="M12 10V14.3" />
      <circle cx="12" cy="17.3" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function CajaIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 7A2 2 0 016.5 5H16A2 2 0 0118 7V8H19A2 2 0 0121 10V18A2 2 0 0119 20H6.5A2 2 0 014.5 18V7Z" />
      <circle cx="17" cy="14" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function RemitosIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <rect x="9" y="2.2" width="6" height="3" rx="1" />
      <path d="M8.3 12.8L10.6 15.1L15.7 10" />
    </Svg>
  );
}

export function FacturacionIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3H14.5L18 6.5V21H6V3Z" />
      <path d="M14.5 3V6.5H18" />
      <path d="M9 12H15" />
      <path d="M9 15.5H13" />
    </Svg>
  );
}

export function DevolucionesIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <path d="M8.5 6.5L4 11L8.5 15.5" />
      <path d="M4 11H15A5.5 5.5 0 0120.5 16.5A5.5 5.5 0 0115 22H10.5" />
    </Svg>
  );
}

export function GuiaIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 8L9.2 9.2L11.5 6.9" />
      <path d="M13.5 8H17" />
      <path d="M8 14L9.2 15.2L11.5 12.9" />
      <path d="M13.5 14H17" />
      <circle cx="8.3" cy="18.2" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function DashboardIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="5" rx="2" />
      <rect x="13" y="10" width="8" height="11" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
    </Svg>
  );
}

export function ComprasIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <path d="M6.5 8H17.5L16.6 20H7.4L6.5 8Z" />
      <path d="M9 8V6.3A3 3 0 0115 6.3V8" />
      <path d="M12 11V15" />
      <path d="M10.2 13.2L12 15L13.8 13.2" />
    </Svg>
  );
}

export function OrdenesCompraIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <rect x="9" y="2.2" width="6" height="3" rx="1" />
      <path d="M8.3 11H15.7" />
      <path d="M8.3 14.3H15.7" />
      <path d="M8.3 17.6H12.5" />
    </Svg>
  );
}

export function ProveedoresIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="8.5" width="11" height="7.5" rx="1.3" />
      <path d="M13.5 11H17L20 14V16H13.5V11Z" />
      <circle cx="7" cy="17.7" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="16.7" cy="17.7" r="1.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function ConteoStockIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="M7 9V15" />
      <path d="M9.7 9V15" />
      <path d="M12.4 9V15" />
      <path d="M15.1 9V15" />
      <path d="M17.8 9V15" />
    </Svg>
  );
}

export function FinanzasIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <path d="M4 16.5L9.5 11L13.5 14L20 6.5" />
      <path d="M14.5 6.5H20V12" />
    </Svg>
  );
}

export function GastosRecurrentesIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 12A7.5 7.5 0 0117.6 6.9" />
      <path d="M17.6 3V6.9H13.7" />
      <path d="M19.5 12A7.5 7.5 0 016.4 17.1" />
      <path d="M6.4 21V17.1H10.3" />
    </Svg>
  );
}

export function TipoCambioIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8H18" />
      <path d="M18 8L14.5 4.5" />
      <path d="M20 16H6" />
      <path d="M6 16L9.5 19.5" />
    </Svg>
  );
}

export function CuentasCorrientesIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="3" width="13" height="18" rx="2" />
      <path d="M7.3 8H14" />
      <path d="M7.3 11.5H14" />
      <path d="M7.3 15H11" />
      <circle cx="17.5" cy="17.5" r="3" />
      <path d="M17.5 16.2V18.8" />
      <path d="M16.2 17.5H18.8" />
    </Svg>
  );
}

export function ReportesIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5V12H20.5" />
    </Svg>
  );
}

export function ObjetivosVentasIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.3" />
      <circle cx="12" cy="12" r="4.6" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function PromocionesIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <path d="M12.3 3.5H20V11.2L11 20.2L3.3 12.5L12.3 3.5Z" />
      <circle cx="16.3" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function FidelidadIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4L14.3 9.1L19.9 9.7L15.7 13.4L16.9 19L12 16.1L7.1 19L8.3 13.4L4.1 9.7L9.7 9.1L12 4Z" />
    </Svg>
  );
}

export function UsuariosIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <circle cx="10.2" cy="8" r="3.3" />
      <path d="M4 20C4 16.5 6.9 13.8 10.2 13.8C11.9 13.8 13.5 14.4 14.6 15.4" />
      <rect x="15.5" y="13.3" width="6" height="6" rx="1.5" />
      <path d="M18.5 15.1V17.5" />
      <path d="M17.3 16.3H19.7" />
    </Svg>
  );
}

export function AuditoriaIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3L19 6V11C19 15.5 16 19 12 21C8 19 5 15.5 5 11V6L12 3Z" />
      <path d="M9 11.8L11.2 14L15.3 9.5" />
    </Svg>
  );
}

export function SucursalesIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21C12 21 18.5 14.6 18.5 9.8A6.5 6.5 0 105.5 9.8C5.5 14.6 12 21 12 21Z" />
      <circle cx="12" cy="9.7" r="2.4" />
    </Svg>
  );
}

export function ArcaIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <rect x="6.5" y="3" width="11" height="10" rx="2" />
      <path d="M9 6.7H15" />
      <path d="M9 9.4H13" />
      <path d="M9 13V20L12 18L15 20V13" />
    </Svg>
  );
}

export function EmpresaIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="3" width="10" height="18" rx="1.3" />
      <path d="M14 9H19.5V21H14" />
      <path d="M7 7H8.3" />
      <path d="M10.7 7H12" />
      <path d="M7 10.6H8.3" />
      <path d="M10.7 10.6H12" />
      <path d="M7 14.2H8.3" />
      <path d="M10.7 14.2H12" />
    </Svg>
  );
}

export function PrintboxIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <rect x="4.5" y="8.5" width="15" height="7.5" rx="1.5" />
      <path d="M7 8.5V4.3H17V8.5" />
      <rect x="7.7" y="14" width="8.6" height="6.5" rx="1" />
    </Svg>
  );
}

export function AyudaIcon(props: ComarIconProps) {
  return (
    <Svg {...props}>
      <path d="M12 20.5C16.7 20.5 20.5 17.1 20.5 12.8C20.5 8.5 16.7 5 12 5C7.3 5 3.5 8.5 3.5 12.8C3.5 14.3 3.97 15.7 4.8 16.9L4 20.5L7.8 19.6C8.9 20.1 10.4 20.5 12 20.5Z" />
      <path d="M10.3 10.6C10.3 9.5 11.1 8.7 12.1 8.7C13.1 8.7 13.9 9.4 13.9 10.4C13.9 11.7 12.1 11.9 12.1 13.4" />
      <circle cx="12.1" cy="15.8" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}
