import type { Product, VariantOption } from '@/types';
import { num } from '@/lib/helpers';

// Helpers de variantes de producto (ver backend product.variants.helpers.ts):
// el padre (hasVariants) agrupa y no se vende; cada variante es un Product
// con parentId, su SKU, precio, costo, foto y stock.

export type VariantAttributes = Record<string, string>;

export const VARIANT_OPTION_SUGGESTIONS = ['Talle', 'Color', 'Sabor', 'Tamaño', 'Molienda', 'Modelo', 'Material'];
export const MAX_VARIANT_OPTIONS = 3;
export const MAX_VARIANT_COMBINATIONS = 200;

export const isVariantParent = (p?: Product | null) => Boolean(p?.hasVariants);
export const isVariant = (p?: Product | null) => Boolean(p?.parentId);

/** Valores de una variante en el orden de las opciones (posicional). */
export const variantValues = (attrs: VariantAttributes | null | undefined, options: VariantOption[]) =>
  options.map((o) => String(attrs?.[o.name] ?? ''));

/** Clave posicional: sobrevive a renombrar una opción (igual que el backend). */
export const valuesKey = (values: string[]) => values.map((v) => v.trim().toLowerCase()).join('|');

export const buildCombinations = (options: VariantOption[]): string[][] =>
  options.reduce<string[][]>(
    (acc, option) => acc.flatMap((partial) => option.values.map((value) => [...partial, value])),
    [[]]
  );

export const combinationsCount = (options: VariantOption[]) =>
  options.length === 0 ? 0 : options.reduce((acc, o) => acc * o.values.length, 1);

export const labelOf = (values: string[]) => values.filter(Boolean).join(' / ');

export const attributesOf = (values: string[], options: VariantOption[]): VariantAttributes =>
  Object.fromEntries(options.map((o, i) => [o.name, values[i] ?? '']));

/** Foto de la variante, o la del padre si no tiene. */
export const productImage = (p?: Product | null) => p?.imageUrl || p?.parent?.imageUrl || null;

/** Nombre del padre de una variante (o el propio nombre si no tiene padre). */
export const baseName = (p: Product) => p.parent?.name ?? p.name;

export const stockRowAt = (p: Product, locationId?: string | null) =>
  locationId ? p.stock?.find((s) => s.businessLocationId === locationId) : undefined;

/** Stock propio en una sucursal (o el total si no se indica sucursal). */
export const stockAt = (p: Product, locationId?: string | null) => {
  const isKg = p.saleUnit === 'KG';
  if (locationId) {
    const row = stockRowAt(p, locationId);
    return row ? num(isKg ? row.quantityKg : row.quantity) : 0;
  }
  return (p.stock ?? []).reduce((acc, row) => acc + num(isKg ? row.quantityKg : row.quantity), 0);
};

/** Stock total de un padre: suma de sus variantes. */
export const parentStock = (p: Product, locationId?: string | null) =>
  (p.variants ?? []).reduce((acc, v) => acc + stockAt(v, locationId), 0);

export const listPrice = (p: Product) => (p.saleUnit === 'KG' ? num(p.pricePerKg) : num(p.price));

export const priceRange = (products: Product[], priceOf: (p: Product) => number = listPrice) => {
  const prices = products.map(priceOf).filter((v) => Number.isFinite(v));
  if (prices.length === 0) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
};

/**
 * Agrupa un listado de productos vendibles (?sellable=true: simples y
 * variantes sueltas) por padre: devuelve los simples tal cual y, por cada
 * padre, un Product "agrupador" armado con los datos de `parent` y sus
 * variantes en `variants`, en la posición de la primera variante.
 */
export const groupByParent = (products: Product[]): Product[] => {
  const result: Product[] = [];
  const groups = new Map<string, Product>();

  for (const p of products) {
    if (!p.parentId) {
      result.push(p);
      continue;
    }

    let group = groups.get(p.parentId);
    if (!group) {
      group = {
        ...p,
        id: p.parentId,
        name: p.parent?.name ?? p.name,
        sku: p.parent?.sku ?? null,
        imageUrl: p.parent?.imageUrl ?? p.imageUrl ?? null,
        parentId: null,
        parent: null,
        hasVariants: true,
        variantOptions: p.parent?.variantOptions ?? null,
        variantAttributes: null,
        variantLabel: null,
        stock: [],
        variants: [],
      };
      groups.set(p.parentId, group);
      result.push(group);
    }
    group.variants!.push(p);
  }

  return result;
};

/** Variantes de un padre agrupadas, ordenadas por sus opciones. */
export const sortedVariants = (parent: Product) => {
  const options = parent.variantOptions ?? [];
  const order = (v: Product) =>
    options.map((o, i) => {
      const idx = o.values.findIndex((val) => val.toLowerCase() === String(v.variantAttributes?.[o.name] ?? '').toLowerCase());
      return String(idx < 0 ? 999 : idx).padStart(3, '0') + i;
    }).join('');
  return [...(parent.variants ?? [])].sort((a, b) => order(a).localeCompare(order(b)));
};

/** Busca por nombre/SKU en un padre y sus variantes. */
export const matchesSearch = (p: Product, q: string) => {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  const hit = (x: Product) => x.name.toLowerCase().includes(query) || Boolean(x.sku?.toLowerCase().includes(query));
  return hit(p) || (p.variants ?? []).some(hit);
};
