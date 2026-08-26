import type { Client, Product, ProductCategory } from '@/types';
import { formatDateTimeAR } from '@/lib/dateAR';

// Mismos 5 valores que usa Configuración > ARCA para la condición IVA del
// negocio (ver app/[tenant]/configuracion/arca/page.tsx e ivaCondition.ts
// en el backend) -- acá es la condición IVA del cliente, no del tenant.
export const CLIENT_IVA_CONDITIONS = [
  { label: 'IVA Responsable Inscripto', value: 'IVA RESPONSABLE INSCRIPTO' },
  { label: 'Responsable Monotributo',   value: 'RESPONSABLE MONOTRIBUTO' },
  { label: 'Consumidor Final',          value: 'CONSUMIDOR FINAL' },
  { label: 'IVA Sujeto Exento',         value: 'IVA SUJETO EXENTO' },
  { label: 'IVA No Responsable',        value: 'IVA NO RESPONSABLE' },
] as const;

export const fmtMoney = (n: number | unknown) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
    .format(Number.isFinite(Number(n)) ? Number(n) : 0);

export const fmtDate = (v?: string | null) => formatDateTimeAR(v);

// Redondea para arriba: "vence en 1 hora" ya cuenta como "1 día" restante en
// vez de "0" (más útil para el panel de super-admin que un piso a cero).
export const daysRemaining = (v?: string | null): number | null => {
  if (!v) return null;
  const diff = new Date(v).getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
};

export const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// Detecta el 403 que devuelve requirePlanFeature (backend/src/middleware/planFeature.ts)
// cuando el modulo no esta incluido en el plan del tenant -- distinto de un
// error generico, asi las paginas de Fidelidad/Promociones/Cuentas
// Corrientes pueden mostrar "no incluido en tu plan" en vez de un estado
// vacio/roto sin explicacion.
export const getPlanLockMessage = (err: unknown): string | null => {
  const e = err as { response?: { status?: number; data?: { code?: string; message?: string } } };
  if (e?.response?.status === 403 && e.response.data?.code === 'PLAN_FEATURE_LOCKED') {
    return e.response.data.message ?? 'Esta función no está disponible en tu plan actual.';
  }
  return null;
};

export const normalizeArray = <T,>(response: unknown): T[] => {
  if (Array.isArray(response)) return response as T[];
  if (!response || typeof response !== 'object') return [];
  const rec = response as Record<string, unknown>;
  for (const key of ['content', 'data', 'items', 'results', 'rows', 'clients', 'products', 'movements', 'sales', 'locations', 'businessLocations', 'plans']) {
    const val = rec[key];
    if (Array.isArray(val)) return val as T[];
    const nested = normalizeArray<T>(val);
    if (nested.length) return nested;
  }
  return [];
};

export const clientName = (client?: Client | null) =>
  client ? `${client.nombre ?? ''} ${client.apellido ?? ''}`.trim() || 'Cliente sin nombre' : 'Consumidor final';

export const categoryName = (product: Product) => {
  const cat = product.category;
  if (typeof cat === 'string') return cat;
  if (cat && typeof cat === 'object') return (cat as ProductCategory).name ?? 'Sin categoría';
  return 'Sin categoría';
};

export const productPrice = (
  product: Product,
  priceType: 'price' | 'wholesalePrice' = 'price'
): number => {
  if (product.saleUnit === 'KG') {
    if (priceType === 'wholesalePrice') return num(product.wholesalePricePerKg, num(product.pricePerKg));
    return num(product.pricePerKg);
  }
  return num(product[priceType], num(product.price));
};

// Suma el stock de un producto a traves de todas sus ubicaciones (ver
// backend doc de migracion "ubicaciones de stock dinamicas" - reemplaza
// stockLocal/stockDeposito, que ya no existen como campos fijos).
export const productStock = (product: Product) => {
  const rows = product.stock ?? [];
  return rows.reduce((acc, row) => acc + num(product.saleUnit === 'KG' ? row.quantityKg : row.quantity), 0);
};

export const productMinStock = (product: Product) => {
  const rows = product.stock ?? [];
  return rows.reduce(
    (acc, row) => acc + num(product.saleUnit === 'KG' ? row.minQuantityKg : row.minQuantity),
    0
  );
};
