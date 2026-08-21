import type { Client, Product, ProductCategory } from '@/types';
import { formatDateTimeAR } from '@/lib/dateAR';

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

export const normalizeArray = <T,>(response: unknown): T[] => {
  if (Array.isArray(response)) return response as T[];
  if (!response || typeof response !== 'object') return [];
  const rec = response as Record<string, unknown>;
  for (const key of ['content', 'data', 'items', 'results', 'rows', 'clients', 'products', 'movements', 'sales', 'locations', 'businessLocations']) {
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

export const productStock = (product: Product) =>
  product.saleUnit === 'KG' ? num(product.stockLocalKg) : num(product.stockLocal);

export const productMinStock = (product: Product) =>
  product.saleUnit === 'KG' ? num(product.minStockKg) : num(product.minStock);
