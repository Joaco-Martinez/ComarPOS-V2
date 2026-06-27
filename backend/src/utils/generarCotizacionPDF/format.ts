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
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(parsed)
    .replace(",", " -");
}

export function safe(value?: string | null) {
  return value?.trim() || "-";
}

export function getQuotationCategoryLabel(client?: CotizacionPDFSale["client"]) {
  const category = client?.category?.trim();

  if (!client || !category) return "Minorista";

  if (category === "Mayorista") return "Mayorista";
  if (category === "Cliente") return "Cliente";
  if (category === "Price") return "Minorista";

  const normalized = category.toLowerCase();

  if (normalized.includes("mayorista")) return "Mayorista";
  if (normalized.includes("cliente")) return "Cliente";

  if (
    normalized.includes("minorista") ||
    normalized.includes("consumidor") ||
    normalized.includes("final") ||
    normalized.includes("price")
  ) {
    return "Minorista";
  }

  return "Minorista";
}

export function getClientName(client?: CotizacionPDFSale["client"]) {
  if (!client) return "Consumidor final";

  const name = `${client.nombre ?? ""} ${client.apellido ?? ""}`.trim();

  return name || "Consumidor final";
}

export function getClientDetails(client?: CotizacionPDFSale["client"]) {
  if (!client) return "";

  const address = client.address?.trim() || client.direccion?.trim() || "";
  const phone = client.telefono ? `Tel: ${client.telefono}` : "";
  const dni = client.dni ? `DNI/CUIT: ${client.dni}` : "";

  return [address, phone, dni].filter(Boolean).join(" - ");
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
