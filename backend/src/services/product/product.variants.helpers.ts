/**
 * Logica pura de variantes de producto (sin DB, testeable unitariamente):
 * normalizacion de opciones, combinaciones, label/nombre/SKU de cada
 * variante, campos que hereda del padre y propagacion de precio/costo
 * respetando customPrice/customCost. La parte que toca la DB vive en
 * product.variants.ts.
 */

export type VariantOption = { name: string; values: string[] };
export type VariantAttributes = Record<string, string>;

// Tope de combinaciones por producto: evita que un typo (ej. 30 talles x 30
// colores) genere cientos de productos de golpe.
export const MAX_VARIANT_COMBINATIONS = 200;
export const MAX_VARIANT_OPTIONS = 3;

function cleanText(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function sameText(a: string, b: string) {
  return a.localeCompare(b, "es", { sensitivity: "base" }) === 0;
}

/**
 * Valida y normaliza las opciones de variantes que manda el front (o un
 * JSON string si vino por FormData). Tira con mensajes en español.
 */
export function normalizeVariantOptions(raw: unknown): VariantOption[] {
  let value = raw;

  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error("Las opciones de variantes no tienen un formato válido");
    }
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Cargá al menos una opción de variante (ej. Talle o Color)");
  }

  if (value.length > MAX_VARIANT_OPTIONS) {
    throw new Error(`Se permiten hasta ${MAX_VARIANT_OPTIONS} opciones de variante por producto`);
  }

  const options: VariantOption[] = [];

  for (const entry of value) {
    const name = cleanText((entry as any)?.name);

    if (!name) {
      throw new Error("Cada opción de variante necesita un nombre (ej. Talle)");
    }

    if (options.some((o) => sameText(o.name, name))) {
      throw new Error(`La opción "${name}" está repetida`);
    }

    const rawValues = Array.isArray((entry as any)?.values) ? (entry as any).values : [];
    const values: string[] = [];

    for (const rawValue of rawValues) {
      const v = cleanText(rawValue);
      if (!v) continue;
      if (values.some((existing) => sameText(existing, v))) continue;
      values.push(v);
    }

    if (values.length === 0) {
      throw new Error(`La opción "${name}" necesita al menos un valor`);
    }

    options.push({ name, values });
  }

  const total = options.reduce((acc, o) => acc * o.values.length, 1);

  if (total > MAX_VARIANT_COMBINATIONS) {
    throw new Error(
      `Esas opciones generan ${total} variantes; el máximo es ${MAX_VARIANT_COMBINATIONS}. Revisá los valores.`
    );
  }

  return options;
}

/** Todas las combinaciones (producto cartesiano), en el orden de las opciones. */
export function buildCombinations(options: VariantOption[]): VariantAttributes[] {
  return options.reduce<VariantAttributes[]>(
    (acc, option) =>
      acc.flatMap((partial) => option.values.map((value) => ({ ...partial, [option.name]: value }))),
    [{}]
  );
}

/** "M / Rojo", en el orden de las opciones del padre. */
export function buildVariantLabel(attributes: VariantAttributes, options: VariantOption[]) {
  return options
    .map((o) => attributes[o.name])
    .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
    .join(" / ");
}

/** "<nombre padre> - <label>": lo que se muestra en tickets, alertas, reportes. */
export function buildVariantName(parentName: string, label: string) {
  const base = cleanText(parentName);
  return label ? `${base} - ${label}` : base;
}

/**
 * Clave estable para comparar combinaciones sin importar mayusculas ni el
 * orden de las keys del JSON.
 */
export function attributesKey(attributes: VariantAttributes, options: VariantOption[]) {
  return options
    .map((o) => `${o.name.toLowerCase()}=${String(attributes[o.name] ?? "").toLowerCase()}`)
    .join("|");
}

/**
 * Ajusta los atributos de una variante a las opciones nuevas del padre:
 * - si una opcion se renombro (mismo indice, distinto nombre) mantiene el
 *   valor que tenia en esa posicion;
 * - matchea el valor sin importar mayusculas y adopta como se escribe ahora.
 * Devuelve null si a la variante le falta algun valor de las opciones nuevas
 * (ej. se agrego una opcion o se quito el valor) - esa variante ya no
 * corresponde a ninguna combinacion.
 */
export function remapAttributes(
  attributes: VariantAttributes | null | undefined,
  previousOptions: VariantOption[] | null | undefined,
  nextOptions: VariantOption[]
): VariantAttributes | null {
  if (!attributes) return null;

  const result: VariantAttributes = {};

  for (let i = 0; i < nextOptions.length; i += 1) {
    const option = nextOptions[i];
    const ownKey = Object.keys(attributes).find((k) => sameText(k, option.name));
    const renamedFrom = previousOptions?.[i]?.name;
    const raw = ownKey !== undefined ? attributes[ownKey] : renamedFrom ? attributes[renamedFrom] : undefined;

    if (raw === undefined || raw === null) return null;

    const match = option.values.find((v) => sameText(v, String(raw)));
    if (!match) return null;

    result[option.name] = match;
  }

  return result;
}

/** "Rojo" -> "ROJ", "XL" -> "XL", "Molido fino" -> "MOL". */
export function abbreviateValue(value: string) {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (!normalized) return "X";
  return normalized.length <= 4 ? normalized : normalized.slice(0, 3);
}

/** "<SKU padre>-<valores abreviados>", ej. REM-M-ROJ. null si el padre no tiene SKU. */
export function buildVariantSku(
  parentSku: string | null | undefined,
  attributes: VariantAttributes,
  options: VariantOption[]
) {
  const base = String(parentSku ?? "").trim();
  if (!base) return null;

  const suffix = options
    .map((o) => attributes[o.name])
    .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
    .map((v) => abbreviateValue(String(v)))
    .join("-");

  return suffix ? `${base}-${suffix}` : base;
}

/**
 * Si el SKU candidato ya esta tomado, le agrega -2, -3... hasta encontrar
 * uno libre. `taken` se actualiza con el elegido (para generar varios en
 * la misma operacion sin chocar entre si).
 */
export function uniqueSku(candidate: string, taken: Set<string>) {
  let sku = candidate;
  let n = 2;

  while (taken.has(sku.toUpperCase())) {
    sku = `${candidate}-${n}`;
    n += 1;
  }

  taken.add(sku.toUpperCase());
  return sku;
}

type ParentLike = {
  name: string;
  description?: string | null;
  categoryId?: string | null;
  supplierId?: string | null;
  ivaRate?: number | null;
  saleUnit?: any;
  isService?: boolean | null;
  unlimitedStock?: boolean | null;
  price?: number | null;
  clientPrice?: number | null;
  wholesalePrice?: number | null;
  pricePerKg?: number | null;
  clientPricePerKg?: number | null;
  wholesalePricePerKg?: number | null;
  purchasePrice?: number | null;
};

type VariantLike = {
  variantLabel?: string | null;
  customPrice?: boolean | null;
  customCost?: boolean | null;
};

/** Campos que la variante hereda del padre y no se editan por separado. */
export const INHERITED_FIELDS = [
  "description",
  "categoryId",
  "supplierId",
  "ivaRate",
  "saleUnit",
  "isService",
  "unlimitedStock",
] as const;

export const PRICE_FIELDS = [
  "price",
  "clientPrice",
  "wholesalePrice",
  "pricePerKg",
  "clientPricePerKg",
  "wholesalePricePerKg",
] as const;

export function inheritedFieldsFromParent(parent: ParentLike) {
  return {
    description: parent.description ?? null,
    categoryId: parent.categoryId ?? null,
    supplierId: parent.supplierId ?? null,
    ivaRate: parent.ivaRate ?? 21,
    saleUnit: parent.saleUnit,
    isService: Boolean(parent.isService),
    unlimitedStock: Boolean(parent.unlimitedStock),
  };
}

export function priceFieldsFromParent(parent: ParentLike) {
  return {
    price: parent.price ?? 0,
    clientPrice: parent.clientPrice ?? parent.price ?? 0,
    wholesalePrice: parent.wholesalePrice ?? parent.price ?? 0,
    pricePerKg: parent.pricePerKg ?? null,
    clientPricePerKg: parent.clientPricePerKg ?? parent.pricePerKg ?? null,
    wholesalePricePerKg: parent.wholesalePricePerKg ?? parent.pricePerKg ?? null,
  };
}

/**
 * Lo que hay que escribir en una variante para dejarla alineada con su
 * padre: hereda los campos comunes y el nombre, y el precio/costo solo si
 * no fueron personalizados a mano (customPrice/customCost).
 */
export function variantSyncData(parent: ParentLike, variant: VariantLike) {
  return {
    ...inheritedFieldsFromParent(parent),
    name: buildVariantName(parent.name, variant.variantLabel ?? ""),
    ...(variant.customPrice ? {} : priceFieldsFromParent(parent)),
    ...(variant.customCost ? {} : { purchasePrice: parent.purchasePrice ?? 0 }),
  };
}

/**
 * true si algun precio de la variante difiere del padre (para decidir si
 * queda marcada como customPrice al editarla a mano).
 */
export function pricesDifferFromParent(
  parent: ParentLike,
  prices: Partial<Record<(typeof PRICE_FIELDS)[number], number | null | undefined>>
) {
  const base = priceFieldsFromParent(parent);
  const near = (a: unknown, b: unknown) => Math.abs(Number(a ?? 0) - Number(b ?? 0)) < 0.005;

  return (["price", "wholesalePrice", "pricePerKg", "wholesalePricePerKg"] as const).some(
    (field) => prices[field] !== undefined && !near(prices[field], base[field])
  );
}

export function costDiffersFromParent(parent: { purchasePrice?: number | null }, cost: number | null | undefined) {
  if (cost === undefined || cost === null) return false;
  return Math.abs(Number(cost) - Number(parent.purchasePrice ?? 0)) >= 0.005;
}

/**
 * Compara las combinaciones de las opciones nuevas contra las variantes que
 * ya existen: cuales se mantienen (con sus atributos re-mapeados), cuales
 * faltan crear y cuales sobran (se desactivan o borran segun historial).
 */
export function diffVariants<T extends { id: string; variantAttributes?: unknown }>(
  existing: T[],
  previousOptions: VariantOption[] | null | undefined,
  nextOptions: VariantOption[]
) {
  const combinations = buildCombinations(nextOptions);
  const keep: { variant: T; attributes: VariantAttributes }[] = [];
  const remove: T[] = [];
  const usedKeys = new Set<string>();

  for (const variant of existing) {
    const attributes = remapAttributes(
      (variant.variantAttributes as VariantAttributes | null) ?? null,
      previousOptions,
      nextOptions
    );
    const key = attributes ? attributesKey(attributes, nextOptions) : null;

    if (!attributes || !key || usedKeys.has(key)) {
      remove.push(variant);
      continue;
    }

    usedKeys.add(key);
    keep.push({ variant, attributes });
  }

  const create = combinations.filter((c) => !usedKeys.has(attributesKey(c, nextOptions)));

  return { keep, create, remove };
}

/** Rango de precios de las variantes ("desde $X" si difieren). */
export function priceRange(values: Array<number | null | undefined>) {
  const nums = values
    .filter((v) => v !== null && v !== undefined)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  if (nums.length === 0) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}
