/**
 * Genera los datos de Ventas para el Libro IVA Digital (RG 4597) a partir
 * de las facturas ya emitidas con CAE (InvoiceAfip). A diferencia de
 * Compras, este archivo en la practica AFIP ya lo pre-carga solo en el
 * Portal IVA (tiene el CAE de cada comprobante) -- este export existe para
 * que el usuario tenga TODO el Libro IVA en un solo lugar (ventas y
 * compras), no porque haga falta subirlo. Mismo alcance que
 * compras.service.ts: CSV con los mismos campos que exige AFIP, no el
 * .txt de ancho fijo (ver ese archivo para el detalle de por que).
 */
import prisma from "../../prisma";
import { tenantScope } from "../../utils/tenantScope";
import { invoiceTypeLabel } from "./invoiceTypes";

function round2(n: number) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Codigos AFIP de tipo de documento del comprador mas comunes (ver
// backend/src/afip/utils/afipMappers.ts#detectarTipoDocumento, que es lo
// que ya se uso para completar InvoiceAfip.tipoDoc al facturar).
const DOC_TYPE_LABEL: Record<number, string> = {
  80: "CUIT",
  86: "CUIL",
  96: "DNI",
  99: "Consumidor Final / sin identificar",
};

export type VentasCbteRow = {
  saleId: string | null;
  invoiceAfipId: string;
  fecha: Date;
  tipoComprobante: number;
  tipoComprobanteLabel: string;
  puntoVenta: number;
  numeroComprobante: number;
  codigoDocComprador: number;
  codigoDocCompradorLabel: string;
  nroDocComprador: string;
  denominacionComprador: string;
  importeTotal: number;
  importeNeto: number;
  importeIva: number;
  cae: string | null;
};

export type VentasAlicuotaRow = {
  invoiceAfipId: string;
  tipoComprobante: number;
  puntoVenta: number;
  numeroComprobante: number;
  alicuotaIva: number;
  baseImponible: number;
  importeIva: number;
};

export async function getVentasLibroIvaDigital(params: { from: Date; to: Date }) {
  const invoices = await prisma.invoiceAfip.findMany({
    where: {
      ...tenantScope(),
      fechaEmision: { gte: params.from, lte: params.to },
      resultado: "A", // Aprobado -- las rechazadas no forman parte del libro
    },
    include: {
      sale: {
        include: {
          client: { select: { nombre: true, apellido: true } },
          items: true,
        },
      },
    },
    orderBy: { fechaEmision: "asc" },
  });

  const cbte: VentasCbteRow[] = [];
  const alicuotas: VentasAlicuotaRow[] = [];

  for (const inv of invoices) {
    const denominacion = inv.sale?.client
      ? `${inv.sale.client.nombre} ${inv.sale.client.apellido ?? ""}`.trim()
      : "CONSUMIDOR FINAL";

    cbte.push({
      saleId: inv.saleId,
      invoiceAfipId: inv.id,
      fecha: inv.fechaEmision,
      tipoComprobante: inv.tipoComprobante,
      tipoComprobanteLabel: invoiceTypeLabel(inv.tipoComprobante),
      puntoVenta: inv.puntoVenta,
      numeroComprobante: inv.numero,
      codigoDocComprador: inv.tipoDoc,
      codigoDocCompradorLabel: DOC_TYPE_LABEL[inv.tipoDoc] ?? `Cód. ${inv.tipoDoc}`,
      nroDocComprador: String(inv.nroDoc),
      denominacionComprador: denominacion,
      importeTotal: round2(inv.total),
      importeNeto: round2(inv.neto),
      importeIva: round2(inv.iva),
      cae: inv.cae,
    });

    const ivaByRate = new Map<number, { neto: number; iva: number }>();
    for (const item of inv.sale?.items ?? []) {
      const rate = (item as any).ivaRate ?? 21;
      const gross = round2(item.subtotal);
      const neto = rate > 0 ? round2(gross / (1 + rate / 100)) : gross;
      const iva = round2(gross - neto);
      const cur = ivaByRate.get(rate) ?? { neto: 0, iva: 0 };
      cur.neto = round2(cur.neto + neto);
      cur.iva = round2(cur.iva + iva);
      ivaByRate.set(rate, cur);
    }

    // Fallback si la venta no tiene items linkeados (ej. dato viejo): un
    // solo renglon con el neto/iva ya calculado que trae la factura.
    if (ivaByRate.size === 0 && inv.iva > 0) {
      ivaByRate.set(21, { neto: round2(inv.neto), iva: round2(inv.iva) });
    }

    for (const [rate, v] of ivaByRate.entries()) {
      alicuotas.push({
        invoiceAfipId: inv.id,
        tipoComprobante: inv.tipoComprobante,
        puntoVenta: inv.puntoVenta,
        numeroComprobante: inv.numero,
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

export function ventasCbteToCsv(rows: VentasCbteRow[]): string {
  return toCsv(
    [
      "Fecha", "Tipo comprobante", "Punto de venta", "Número comprobante",
      "Tipo doc. comprador", "Nro. doc. comprador", "Denominación comprador",
      "Importe total", "Importe neto", "IVA", "CAE",
    ],
    rows.map((r) => [
      r.fecha.toISOString().slice(0, 10),
      r.tipoComprobanteLabel,
      r.puntoVenta,
      r.numeroComprobante,
      r.codigoDocCompradorLabel,
      r.nroDocComprador,
      r.denominacionComprador,
      r.importeTotal,
      r.importeNeto,
      r.importeIva,
      r.cae,
    ])
  );
}

export function ventasAlicuotasToCsv(rows: VentasAlicuotaRow[]): string {
  return toCsv(
    ["Punto de venta", "Número comprobante", "Alícuota IVA (%)", "Base imponible", "Importe IVA"],
    rows.map((r) => [r.puntoVenta, r.numeroComprobante, r.alicuotaIva, r.baseImponible, r.importeIva])
  );
}
