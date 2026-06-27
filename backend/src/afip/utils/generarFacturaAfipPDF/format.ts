/**
 * Helpers de formato (moneda, fecha/hora AR, numeracion).
 * Extraidos de generarFacturaAfipPDF.ts (modularizacion, doc seccion 4).
 */
export function formatCurrency(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
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

export function formatDateTimeTicket(date: Date) {
  return `${formatDateAR(date)} ${formatTimeAR(date)}`;
}

export function formatCaeDate(date: Date) {
  return formatDateAR(date);
}

export function formatPointOfSale(value: number) {
  return String(value).padStart(4, "0");
}

export function formatCbteNumber(value: number) {
  return String(value).padStart(8, "0");
}

export function numberOrZero(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}
