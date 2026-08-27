import type { PlanFeatureKey } from '@/types';

// Debe cubrir TODOS los PlanFeatureKey (ver types/index.ts / config/billing.ts
// en el backend) -- agrupados igual que el menu para que la grilla de
// "Modulos por plan" / "Modulos para este tenant" sea legible con ~30 filas.
// Compartido entre app/platform-admin/page.tsx (por plan) y
// app/platform-admin/tenants/[id]/page.tsx (por tenant puntual, ver
// Tenant.featureOverrides).
export const FEATURE_LABELS: Record<PlanFeatureKey, string> = {
  dashboard: 'Dashboard', pos: 'POS — Ventas', ventas: 'Historial de Ventas', productos: 'Productos',
  categorias: 'Categorías', clientes: 'Clientes', stock: 'Stock', alertas: 'Alertas', caja: 'Caja',
  servicios: 'Servicios / Reparaciones',
  remitos: 'Remitos', facturacion: 'AFIP / Facturas', devoluciones: 'Devoluciones', compras: 'Compras',
  ordenesCompra: 'Órdenes de Compra', proveedores: 'Proveedores', conteoStock: 'Conteo de Stock',
  finanzas: 'Finanzas', gastosRecurrentes: 'Gastos Recurrentes', tipoCambio: 'Tipo de Cambio',
  cuentasCorrientes: 'Cuentas Corrientes', reportes: 'Reportes', objetivosVentas: 'Objetivos de Ventas',
  promociones: 'Promociones', fidelidad: 'Fidelidad', usuarios: 'Usuarios', auditoria: 'Auditoría',
  sucursales: 'Sucursales', arca: 'ARCA / AFIP (config.)', empresa: 'Empresa', printbox: 'PrintBox',
  hoteleria: 'Hotelería',
};

export const FEATURE_GROUPS: { label: string; keys: PlanFeatureKey[] }[] = [
  { label: 'Ventas y caja', keys: ['pos', 'ventas', 'caja', 'servicios', 'hoteleria', 'facturacion', 'devoluciones', 'remitos'] },
  { label: 'Catálogo y stock', keys: ['productos', 'categorias', 'stock', 'conteoStock', 'alertas'] },
  { label: 'Clientes', keys: ['clientes', 'cuentasCorrientes', 'fidelidad', 'promociones'] },
  { label: 'Compras', keys: ['compras', 'ordenesCompra', 'proveedores'] },
  { label: 'Finanzas', keys: ['finanzas', 'gastosRecurrentes', 'tipoCambio'] },
  { label: 'Analítica', keys: ['dashboard', 'reportes', 'objetivosVentas'] },
  { label: 'Administración', keys: ['usuarios', 'auditoria', 'sucursales', 'arca', 'empresa', 'printbox'] },
];
