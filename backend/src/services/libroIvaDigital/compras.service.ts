/**
 * Genera los datos de Compras para el Libro IVA Digital (RG 4597) a partir
 * de lo cargado en el modulo Compras (Purchase/PurchaseItem).
 *
 * IMPORTANTE sobre el alcance de esto: el archivo que exige AFIP en el
 * Portal IVA es un texto de ANCHO FIJO (ver
 * www.afip.gob.ar/iva/documentos/Libro-IVA-Digital-Especificaciones.pdf).
 * Confirmamos contra esa especificacion el SIGNIFICADO y el orden de los
 * primeros 16 campos de LIBRO_IVA_DIGITAL_COMPRAS_CBTE (fecha, tipo/punto
 * de venta/numero de comprobante, datos del vendedor, importe total,
 * conceptos no gravados, exento, percepciones IVA/nacionales/IIBB/
 * municipales, impuestos internos) y el formato general de los importes
 * (15 digitos = 13 enteros + 2 decimales, sin coma/punto). NO llegamos a
 * confirmar el ancho exacto en caracteres de cada campo para ese archivo
 * puntual (la especificacion es un PDF largo y esa tabla de anchos no se
 * pudo extraer completa en esta pasada) -- por eso, en vez de arriesgar un
 * .txt de ancho fijo que "parezca" correcto pero AFIP rechace, esto genera
 * un CSV con las mismas columnas/valores, para que el contador lo revise o
 * lo pase a su software (Tango, etc.) antes de la primera presentacion
 * real. Si en algun momento se consigue la tabla de anchos exacta, esto es
 * el lugar para agregar el export de ancho fijo real.
 */
import prisma from "../../prisma";
import { PurchaseStatus } from "@prisma/client";
import { tenantScope } from "../../utils/tenantScope";
import { purchaseInvoiceTypeLabel } from "./purchaseInvoiceTypes";

function round2(n: number) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export type ComprasCbteRow = {
  purchaseId: string;
  fecha: Date;
  tipoComprobante: number | null;
  tipoComprobanteLabel: string;
  puntoVenta: number | null;
  numeroComprobante: string | null;
  cuitVendedor: string | null;
  denominacionVendedor: string | null;
  importeTotal: number;
  importeNoGravado: number;
  importeExento: number;
  percepcionIva: number;
  otrasPercepcionesNacionales: number;
  percepcionIibb: number;
  percepcionMunicipal: number;
  impuestosInternos: number;
  importeIvaLiquidado: number;
  missingFields: string[];
};

export type ComprasAlicuotaRow = {
  purchaseId: string;
  tipoComprobante: number | null;
  puntoVenta: number | null;
  numeroComprobante: string | null;
  alicuotaIva: number;
  baseImponible: number;
  importeIva: number;
};

function requiredFieldsMissing(p: {
  invoiceType: number | null;
  invoicePointOfSale: number | null;
  invoiceNumber: string | null;
  providerCuit: string | null;
  supplier: { cuit: string | null } | null;
}): string[] {
  const missing: string[] = [];
  if (!p.invoiceType) missing.push("Tipo de comprobante");
  if (!p.invoicePointOfSale) missing.push("Punto de venta");
  if (!p.invoiceNumber) missing.push("Número de comprobante");
  if (!p.providerCuit && !p.supplier?.cuit) missing.push("CUIT del proveedor");
  return missing;
}

export async function getComprasLibroIvaDigital(params: { from: Date; to: Date }) {
  const purchases = await prisma.purchase.findMany({
    where: {
      ...tenantScope(),
      status: PurchaseStatus.COMPLETED,
      date: { gte: params.from, lte: params.to },
    },
    include: {
      items: true,
      supplier: { select: { name: true, cuit: true } },
    },
    orderBy: { date: "asc" },
  });

  const cbte: ComprasCbteRow[] = [];
  const alicuotas: ComprasAlicuotaRow[] = [];

  for (const p of purchases) {
    const ivaByRate = new Map<number, { neto: number; iva: number }>();

    for (const item of p.items) {
      const rate = item.ivaRate ?? 21;
      const gross = round2(item.subtotal);
      const neto = rate > 0 ? round2(gross / (1 + rate / 100)) : gross;
      const iva = round2(gross - neto);
      const cur = ivaByRate.get(rate) ?? { neto: 0, iva: 0 };
      cur.neto = round2(cur.neto + neto);
      cur.iva = round2(cur.iva + iva);
      ivaByRate.set(rate, cur);
    }

    const importeIvaLiquidado = round2(
      [...ivaByRate.values()].reduce((sum, v) => sum + v.iva, 0)
    );

    cbte.push({
      purchaseId: p.id,
      fecha: p.date,
      tipoComprobante: p.invoiceType,
      tipoComprobanteLabel: purchaseInvoiceTypeLabel(p.invoiceType),
      puntoVenta: p.invoicePointOfSale,
      numeroComprobante: p.invoiceNumber,
      cuitVendedor: p.providerCuit ?? p.supplier?.cuit ?? null,
      denominacionVendedor: p.supplier?.name ?? p.providerName ?? null,
      importeTotal: round2(p.totalAmount),
      importeNoGravado: round2(p.nonTaxedAmount),
      importeExento: round2(p.exemptAmount),
      percepcionIva: round2(p.ivaPerceptionAmount),
      otrasPercepcionesNacionales: round2(p.nationalTaxPerceptionAmount),
      percepcionIibb: round2(p.iibbPerceptionAmount),
      percepcionMunicipal: round2(p.municipalPerceptionAmount),
      impuestosInternos: round2(p.internalTaxAmount),
      importeIvaLiquidado,
      missingFields: requiredFieldsMissing(p),
    });

    for (const [rate, v] of ivaByRate.entries()) {
      alicuotas.push({
        purchaseId: p.id,
        tipoComprobante: p.invoiceType,
        puntoVenta: p.invoicePointOfSale,
        numeroComprobante: p.invoiceNumber,
        alicuotaIva: rate,
        baseImponible: v.neto,
        importeIva: v.iva,
      });
    }
  }

  return { cbte, alicuotas };
}

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(csvEscape).join(";")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(";"));
  }
  return lines.join("\r\n");
}

export function comprasCbteToCsv(rows: ComprasCbteRow[]): string {
  return toCsv(
    [
      "Fecha", "Tipo comprobante", "Punto de venta", "Número comprobante",
      "CUIT vendedor", "Denominación vendedor", "Importe total",
      "Conceptos no gravados", "Operaciones exentas", "Percepción IVA",
      "Otras percepciones nacionales", "Percepción IIBB", "Percepción municipal",
      "Impuestos internos", "IVA liquidado", "Datos faltantes",
    ],
    rows.map((r) => [
      r.fecha.toISOString().slice(0, 10),
      r.tipoComprobanteLabel,
      r.puntoVenta,
      r.numeroComprobante,
      r.cuitVendedor,
      r.denominacionVendedor,
      r.importeTotal,
      r.importeNoGravado,
      r.importeExento,
      r.percepcionIva,
      r.otrasPercepcionesNacionales,
      r.percepcionIibb,
      r.percepcionMunicipal,
      r.impuestosInternos,
      r.importeIvaLiquidado,
      r.missingFields.join(" / "),
    ])
  );
}

export function comprasAlicuotasToCsv(rows: ComprasAlicuotaRow[]): string {
  return toCsv(
    ["Punto de venta", "Número comprobante", "Alícuota IVA (%)", "Base imponible", "Importe IVA"],
    rows.map((r) => [r.puntoVenta, r.numeroComprobante, r.alicuotaIva, r.baseImponible, r.importeIva])
  );
}
