/**
 * Codigos AFIP de tipo de comprobante -- tabla unica de ARCA, vale tanto
 * para comprobantes emitidos (ventas) como recibidos (compras). Subconjunto
 * curado (ver www.arca.gob.ar/libro-iva-digital/documentos/Libro-IVA-Digital-Tablas-del-Sistema.pdf)
 * con los tipos que un comercio chico/mediano usa en la practica: los que
 * ComarPOS mismo emite (Factura/Nota de Credito A/B/C, ver
 * backend/src/afip/ivaCondition.ts) y los que suele recibir de proveedores
 * (agrega M, Notas de Debito).
 */
export const AFIP_INVOICE_TYPES: { code: number; label: string }[] = [
  { code: 1, label: "Factura A" },
  { code: 2, label: "Nota de Débito A" },
  { code: 3, label: "Nota de Crédito A" },
  { code: 6, label: "Factura B" },
  { code: 7, label: "Nota de Débito B" },
  { code: 8, label: "Nota de Crédito B" },
  { code: 11, label: "Factura C" },
  { code: 12, label: "Nota de Débito C" },
  { code: 13, label: "Nota de Crédito C" },
  { code: 51, label: "Factura M" },
  { code: 52, label: "Nota de Débito M" },
  { code: 53, label: "Nota de Crédito M" },
];

const LABEL_BY_CODE = new Map(AFIP_INVOICE_TYPES.map((t) => [t.code, t.label]));

export function invoiceTypeLabel(code?: number | null): string {
  if (code == null) return "—";
  return LABEL_BY_CODE.get(code) ?? `Cód. ${code}`;
}

/**
 * Letra del comprobante (A/B/C/M) a partir del codigo -- determina si
 * discrimina IVA (A y M si) o no (B y C, en ese caso todo va a alicuota 0
 * con codigo de operacion "no gravado" en el archivo de alicuotas).
 */
export function invoiceTypeLetter(code?: number | null): "A" | "B" | "C" | "M" | null {
  if (code == null) return null;
  if ([1, 2, 3].includes(code)) return "A";
  if ([6, 7, 8].includes(code)) return "B";
  if ([11, 12, 13].includes(code)) return "C";
  if ([51, 52, 53].includes(code)) return "M";
  return null;
}

export function invoiceDiscriminatesIva(code?: number | null): boolean {
  const letter = invoiceTypeLetter(code);
  return letter === "A" || letter === "M";
}
