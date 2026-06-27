/**
 * Helpers de formato (moneda, fecha/hora AR, numero de comprobante).
 * Extraidos de facturaPdfGenerator.service.ts (modularizacion, doc seccion 4).
 */
export function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function formatDateAR(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

export function formatTimeAR(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function buildNumeroComprobante(pv: number, nro: number) {
  return `${String(pv).padStart(4, "0")}-${String(nro).padStart(8, "0")}`;
}

export function numberOrZero(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}
