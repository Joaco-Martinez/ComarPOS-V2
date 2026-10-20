/**
 * Agrupado de reportes por variante o por producto (padre). Logica pura,
 * sin DB: los servicios de reportes traen el producto de cada item con
 * `parentId` + `parent` y usan estas funciones para decidir la clave de
 * agrupado y que producto mostrar.
 *
 * - "variant" (default, igual que antes de las variantes): una fila por
 *   producto vendido; el nombre de la variante ya incluye su label.
 * - "product": las variantes se suman en una fila con el nombre del padre
 *   (por parentId, o por el propio id si el producto no tiene padre).
 */

export type ReportGroupBy = "variant" | "product";

export type VariantAwareProduct = {
  id: string;
  name: string;
  sku?: string | null;
  parentId?: string | null;
  variantLabel?: string | null;
  parent?: { id: string; name: string; sku?: string | null } | null;
  [key: string]: unknown;
};

export function parseGroupBy(raw: unknown): ReportGroupBy {
  return raw === "product" ? "product" : "variant";
}

export function groupKeyFor(product: { id: string; parentId?: string | null }, mode: ReportGroupBy) {
  return mode === "product" ? product.parentId ?? product.id : product.id;
}

/**
 * Producto a mostrar en la fila: en modo "product" una variante se muestra
 * como su padre. Siempre agrega parentName/variantLabel para que el front
 * pueda mostrar las dos columnas.
 */
export function displayProductFor<T extends VariantAwareProduct>(product: T, mode: ReportGroupBy) {
  const parentName = product.parent?.name ?? null;

  if (mode === "product" && product.parentId && product.parent) {
    return {
      ...product,
      id: product.parent.id,
      name: product.parent.name,
      sku: product.parent.sku ?? null,
      parentId: null,
      variantLabel: null,
      parentName: null,
    };
  }

  return { ...product, parentName, variantLabel: product.variantLabel ?? null };
}

/**
 * Suma valores numericos por clave de agrupado. `valuesOf` devuelve los
 * campos a sumar de cada item; la primera aparicion de cada clave define
 * el producto mostrado.
 */
export function sumByGroup<I, V extends Record<string, number>>(
  items: I[],
  productOf: (item: I) => VariantAwareProduct,
  valuesOf: (item: I) => V,
  mode: ReportGroupBy
) {
  const groups = new Map<string, { product: ReturnType<typeof displayProductFor>; values: V }>();

  for (const item of items) {
    const product = productOf(item);
    const key = groupKeyFor(product, mode);
    const values = valuesOf(item);
    const current = groups.get(key);

    if (!current) {
      groups.set(key, { product: displayProductFor(product, mode), values: { ...values } });
      continue;
    }

    for (const field of Object.keys(values) as (keyof V)[]) {
      (current.values as Record<keyof V, number>)[field] =
        Number(current.values[field] ?? 0) + Number(values[field] ?? 0);
    }
  }

  return Array.from(groups.values());
}
