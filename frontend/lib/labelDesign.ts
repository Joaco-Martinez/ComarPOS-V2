/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Diseno editable de las etiquetas de codigo de barra (Productos ->
 * Etiquetas). Cada tamano (chico / mediano / grande) tiene su propio diseno:
 * medidas en mm, y para cada elemento (nombre, barras, numero, precio,
 * precios de otras listas) si se muestra, tamano de letra en pt, negrita,
 * color y alineacion. El orden de los elementos tambien se elige.
 *
 * IMPORTANTE: backend/src/services/labelDesign.ts tiene la misma estructura y los
 * mismos defaults (el PDF se dibuja alla con esos valores y la vista previa
 * aca). Si se cambia uno, cambiar el otro.
 */

export type LabelSize = "chico" | "mediano" | "grande";
export const LABEL_SIZE_KEYS: LabelSize[] = ["chico", "mediano", "grande"];

export type LabelAlign = "left" | "center" | "right";
export type LabelElementKey = "name" | "barcode" | "sku" | "price" | "extras";

export type LabelTextStyle = {
  show: boolean;
  size: number; // pt
  bold: boolean;
  color: string; // #rrggbb
  align: LabelAlign;
};

export type LabelListStyle = { color: string; size: number; bold: boolean };

export type LabelDesign = {
  widthMm: number;
  heightMm: number;
  border: boolean;
  order: LabelElementKey[];
  name: LabelTextStyle & { maxLines: 1 | 2 };
  barcode: { show: boolean; heightMm: number; widthPct: number };
  sku: LabelTextStyle;
  price: LabelTextStyle & { decimals: boolean; showLabel: boolean };
  // Estilo base de las lineas de otras listas ("Efectivo: $900") + override
  // por lista (key = id de la lista), ej. Efectivo en rojo.
  extras: LabelTextStyle;
  listStyles: Record<string, LabelListStyle>;
};

export type LabelDesigns = Record<LabelSize, LabelDesign>;

export const DEFAULT_ORDER: LabelElementKey[] = ["name", "barcode", "sku", "price", "extras"];

function base(widthMm: number, heightMm: number, k: number): LabelDesign {
  const r = (n: number) => Math.round(n * k * 2) / 2;
  return {
    widthMm,
    heightMm,
    border: true,
    order: [...DEFAULT_ORDER],
    name: { show: true, size: r(13), bold: true, color: "#000000", align: "left", maxLines: 2 },
    barcode: { show: true, heightMm: Math.round(9 * k), widthPct: 85 },
    sku: { show: true, size: Math.max(5, r(7)), bold: false, color: "#000000", align: "center" },
    price: { show: true, size: r(11), bold: true, color: "#000000", align: "center", decimals: true, showLabel: false },
    extras: { show: true, size: r(10), bold: true, color: "#000000", align: "center" },
    listStyles: {},
  };
}

export const DEFAULT_DESIGNS: LabelDesigns = {
  chico: base(43, 27, 0.7),
  mediano: base(63, 38, 1),
  grande: base(82, 49, 1.3),
};

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};
const color = (v: unknown, fallback: string) =>
  typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const align = (v: unknown, fallback: LabelAlign): LabelAlign =>
  v === "left" || v === "center" || v === "right" ? v : fallback;

function textStyle(raw: any, def: LabelTextStyle): LabelTextStyle {
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    show: bool(s.show, def.show),
    size: clamp(s.size, 4, 48, def.size),
    bold: bool(s.bold, def.bold),
    color: color(s.color, def.color),
    align: align(s.align, def.align),
  };
}

export function normalizeDesign(raw: unknown, def: LabelDesign): LabelDesign {
  const d: any = raw && typeof raw === "object" ? raw : {};
  const order = Array.isArray(d.order)
    ? (d.order.filter((k: unknown) => DEFAULT_ORDER.includes(k as LabelElementKey)) as LabelElementKey[])
    : [];
  const uniqueOrder = Array.from(new Set(order));
  DEFAULT_ORDER.forEach((k) => { if (!uniqueOrder.includes(k)) uniqueOrder.push(k); });

  const listStyles: Record<string, LabelListStyle> = {};
  if (d.listStyles && typeof d.listStyles === "object") {
    for (const [id, v] of Object.entries(d.listStyles as Record<string, any>).slice(0, 50)) {
      if (!v || typeof v !== "object") continue;
      listStyles[id] = {
        color: color(v.color, def.extras.color),
        size: clamp(v.size, 4, 48, def.extras.size),
        bold: bool(v.bold, def.extras.bold),
      };
    }
  }

  const name = textStyle(d.name, def.name);
  const price = textStyle(d.price, def.price);
  return {
    widthMm: clamp(d.widthMm, 15, 200, def.widthMm),
    heightMm: clamp(d.heightMm, 10, 200, def.heightMm),
    border: bool(d.border, def.border),
    order: uniqueOrder,
    name: { ...name, maxLines: d.name?.maxLines === 1 ? 1 : d.name?.maxLines === 2 ? 2 : def.name.maxLines },
    barcode: {
      show: bool(d.barcode?.show, def.barcode.show),
      heightMm: clamp(d.barcode?.heightMm, 3, 100, def.barcode.heightMm),
      widthPct: clamp(d.barcode?.widthPct, 20, 100, def.barcode.widthPct),
    },
    sku: textStyle(d.sku, def.sku),
    price: {
      ...price,
      decimals: bool(d.price?.decimals, def.price.decimals),
      showLabel: bool(d.price?.showLabel, def.price.showLabel),
    },
    extras: textStyle(d.extras, def.extras),
    listStyles,
  };
}

export function normalizeDesigns(raw: unknown): LabelDesigns {
  const r: any = raw && typeof raw === "object" ? raw : {};
  return {
    chico: normalizeDesign(r.chico, DEFAULT_DESIGNS.chico),
    mediano: normalizeDesign(r.mediano, DEFAULT_DESIGNS.mediano),
    grande: normalizeDesign(r.grande, DEFAULT_DESIGNS.grande),
  };
}

export const MM_TO_PT = 72 / 25.4;
// Separacion entre etiquetas en la hoja (para cortar) y margen interno.
export const LABEL_GAP_MM = 3;
export const LABEL_PADDING_MM = 1.5;
export const ELEMENT_GAP_MM = 0.6;
export const LINE_HEIGHT = 1.15;

export function formatLabelPrice(n: number, decimals: boolean) {
  if (!decimals) return `$${Math.round(n).toLocaleString("es-AR")}`;
  return `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
