/**
 * Helpers de formato y resolucion de datos del cliente/producto.
 * Extraidos de generarCotizacionPDF.ts (modularizacion, doc seccion 4).
 */
import { CotizacionPDFSale } from "./types";

export function money(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  })
    .format(Number(value || 0))
    .replace(/\s/g, " ");
}

export function dateText(date?: Date | string | null) {
  if (!date) return "-";

  const parsed = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(parsed.getTime())) return "-";

  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(parsed)
    .replace(",", " -");
}

/** Version corta de dateText (sin hora) - para columnas angostas donde la
 * fecha+hora completa no entra en una linea (ver drawInfo en sections.ts). */
export function dateOnlyText(date?: Date | string | null) {
  if (!date) return "-";

  const parsed = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(parsed.getTime())) return "-";

  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export function safe(value?: string | null) {
  return value?.trim() || "-";
}

export function getBusinessName(sale: CotizacionPDFSale) {
  return sale.businessName?.trim() || "Mi Negocio";
}

/** Numero de cotizacion "legible" para el documento (no hay un contador
 * correlativo por tenant, se deriva del id de la venta - mismo criterio que
 * ya usa el nombre del archivo descargado, ver cotizaciones/page.tsx). */
export function getQuotationNumber(sale: Pick<CotizacionPDFSale, "id">) {
  return `COT-${sale.id.slice(-8).toUpperCase()}`;
}

// Descuento unico "viejo" (POS) para el titulo del header - corto a
// proposito (una etiqueta al lado del nombre del negocio). Los descuentos
// multiples de la pantalla de Cotizaciones NO pasan por acá: tienen su
// propia seccion con el detalle completo (ver drawDiscountOptions en
// sections.ts), porque el titulo no tiene lugar para texto libre largo.
export function getQuotationDiscountLabel(
  sale: Pick<CotizacionPDFSale, "discountType" | "discountValue">
) {
  const raw = Number(sale.discountValue || 0);

  if (!raw) return "";

  // Negativo = recargo (mismo campo que el descuento, ver flujo de POS).
  const isSurcharge = raw < 0;
  const value = Math.abs(raw);
  const suffix = isSurcharge ? "de recargo" : "de descuento";

  if (sale.discountType === "FIXED") return `${money(value)} ${suffix}`;

  return `${value}% ${suffix}`;
}

/** Texto completo de un descuento multiple: el label que escribio el
 * usuario tal cual (para que pueda poner algo como "Descuento del 10%
 * abonando en efectivo"), o un fallback sintetizado si no cargo ninguno. */
export function getDiscountRowLabel(discount: { label?: string | null; type: string; value: number }) {
  const trimmed = discount.label?.trim();
  if (trimmed) return trimmed;
  return discount.type === "FIXED" ? `${money(discount.value)} de descuento` : `${discount.value}% de descuento`;
}

/**
 * Desglose de IVA de una linea de producto (mismo criterio que
 * drawTotals: el precio cargado ya incluye IVA, se "destapa" el neto con
 * la alicuota propia del item).
 */
export function getItemIvaBreakdown(item: CotizacionPDFSale["items"][number]) {
  const rate = item.ivaRate ?? item.product?.ivaRate ?? 21;
  const gross = item.subtotal || 0;
  const neto = gross / (1 + rate / 100);
  const ivaAmount = gross - neto;

  return { rate, neto, ivaAmount };
}

/**
 * Reparte proporcionalmente el descuento/recargo total de la cotizacion
 * (sale.subtotal - sale.total) sobre una linea, segun su participacion en
 * el subtotal bruto - mismo criterio que
 * sale.pricing.ts#applyDiscountAndProfitToItems, pero calculado acá en
 * render-time porque el descuento no se persiste por item.
 */
export function getItemDiscountBreakdown(
  sale: Pick<CotizacionPDFSale, "subtotal" | "total">,
  item: CotizacionPDFSale["items"][number]
) {
  const totalAdjustment = Number(sale.subtotal || 0) - Number(sale.total || 0);
  const grossSubtotal = Number(sale.subtotal || 0);

  if (Math.abs(totalAdjustment) < 0.01 || grossSubtotal <= 0) {
    return { amount: 0, pct: 0, finalSubtotal: item.subtotal || 0, isSurcharge: false };
  }

  const share = (item.subtotal || 0) / grossSubtotal;
  const amount = totalAdjustment * share;
  const pct = totalAdjustment !== 0 ? (amount / (item.subtotal || 1)) * 100 : 0;

  return {
    amount,
    pct,
    finalSubtotal: (item.subtotal || 0) - amount,
    isSurcharge: totalAdjustment < 0,
  };
}

export function getClientName(client?: CotizacionPDFSale["client"]) {
  if (!client) return "Consumidor final";

  const name = `${client.nombre ?? ""} ${client.apellido ?? ""}`.trim();

  return name || "Consumidor final";
}

/** "IVA RESPONSABLE INSCRIPTO" -> "Iva Responsable Inscripto" (mismos
 * valores que CLIENT_IVA_CONDITIONS en el frontend / ArcaConfig.ivaCondition
 * en el backend, guardados siempre en mayusculas). */
export function titleCase(value?: string | null) {
  if (!value) return "";
  return value
    .toLowerCase()
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export function getClientDocLine(client?: CotizacionPDFSale["client"]) {
  if (!client?.dni) return "";
  return `${client.documentType || "DNI"}: ${client.dni}`;
}

export function getClientAddressLine(client?: CotizacionPDFSale["client"]) {
  if (!client) return "";

  const composed = [client.addressStreet, client.addressNumber].filter(Boolean).join(" ").trim();
  const withCity = [composed, client.addressCity].filter(Boolean).join(", ");

  return withCity || client.address?.trim() || client.direccion?.trim() || "";
}

export function getProductName(item: CotizacionPDFSale["items"][number]) {
  return item.productNameSnapshot || item.product?.name || "Producto";
}

export function getProductSku(item: CotizacionPDFSale["items"][number]) {
  return item.productSkuSnapshot || item.product?.sku || "-";
}

export function getProductQty(item: CotizacionPDFSale["items"][number]) {
  if (item.product?.saleUnit === "KG") {
    return Number(item.quantityKg ?? 0);
  }

  return Number(item.quantity ?? 0);
}
