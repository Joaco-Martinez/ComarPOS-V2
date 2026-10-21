/**
 * Reporte para el contador: todo lo fiscal de un periodo en un solo lugar
 * (pantalla /contador del frontend) y exportable a PDF y Word. Reutiliza el
 * Libro IVA (ventas/compras) y la liquidacion, no recalcula nada propio salvo
 * los totales de ventas del periodo (facturado vs sin facturar).
 */
import PDFDocument from "pdfkit";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import prisma from "../../prisma";
import { SaleStatus } from "@prisma/client";
import { tenantScope } from "../../utils/tenantScope";
import { monthRangeAR } from "../../utils/dateAR";
import { arcaConfigService } from "../arcaConfig.service";
import { getVentasLibroIvaDigital, type VentasCbteRow } from "./ventas.service";
import { getComprasLibroIvaDigital, type ComprasCbteRow } from "./compras.service";
import { getLiquidacion, type LiquidacionView } from "./liquidacion.service";
import { isCreditNoteType } from "./invoiceTypes";

function round2(n: number) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

type AlicuotaResumen = { alicuota: number; base: number; iva: number };

export type ContadorReport = {
  periodo: { year: number; month: number; label: string };
  generadoEl: Date;
  negocio: { razonSocial: string | null; cuit: string | null; condicionIva: string | null };
  resumen: {
    ventasTotal: number | null;
    ventasFacturadas: number | null;
    ventasSinFacturar: number | null;
    cantidadVentas: number | null;
    facturado: number;
    notasCredito: number;
    netoFacturado: number;
    comprasTotal: number;
    comprasConDatosFaltantes: number;
  };
  comprobantes: (VentasCbteRow & { esNotaCredito: boolean })[];
  ivaVentas: AlicuotaResumen[];
  compras: ComprasCbteRow[];
  ivaCompras: AlicuotaResumen[];
  liquidacion: LiquidacionView | null;
  liquidacionNota: string | null;
};

function sumAlicuotas(rows: { tipoComprobante: number | null; alicuotaIva: number; baseImponible: number; importeIva: number }[]) {
  const byRate = new Map<number, AlicuotaResumen>();
  for (const r of rows) {
    const sign = isCreditNoteType(r.tipoComprobante) ? -1 : 1;
    const cur = byRate.get(r.alicuotaIva) ?? { alicuota: r.alicuotaIva, base: 0, iva: 0 };
    cur.base = round2(cur.base + sign * r.baseImponible);
    cur.iva = round2(cur.iva + sign * r.importeIva);
    byRate.set(r.alicuotaIva, cur);
  }
  return [...byRate.values()].sort((a, b) => a.alicuota - b.alicuota);
}

export async function getContadorReport(params: { year: number; month: number; arcaConfigId?: string }): Promise<ContadorReport> {
  const { year, month, arcaConfigId } = params;
  const { start, end } = monthRangeAR(year, month);

  const [ventas, compras, config] = await Promise.all([
    getVentasLibroIvaDigital({ from: start, to: end, arcaConfigId }),
    getComprasLibroIvaDigital({ from: start, to: end, arcaConfigId }),
    (arcaConfigId ? arcaConfigService.getConfigById(arcaConfigId) : arcaConfigService.getConfig()).catch(() => null),
  ]);

  let liquidacion: LiquidacionView | null = null;
  let liquidacionNota: string | null = null;
  try {
    liquidacion = await getLiquidacion(year, month, arcaConfigId);
  } catch (err: any) {
    liquidacionNota = err?.message ?? "No se pudo calcular la liquidación.";
  }

  // Ventas del periodo (facturadas o no). Una venta sin factura no tiene
  // dueño (CUIT) asignado, asi que con un dueño elegido no se muestran.
  let ventasResumen: Pick<ContadorReport["resumen"], "ventasTotal" | "ventasFacturadas" | "ventasSinFacturar" | "cantidadVentas"> = {
    ventasTotal: null,
    ventasFacturadas: null,
    ventasSinFacturar: null,
    cantidadVentas: null,
  };
  if (!arcaConfigId) {
    const where = { ...tenantScope(), status: SaleStatus.COMPLETED, isNoteCredit: false, createdAt: { gte: start, lte: end } };
    const [all, invoiced] = await Promise.all([
      prisma.sale.aggregate({ where, _sum: { total: true }, _count: { _all: true } }),
      prisma.sale.aggregate({ where: { ...where, isInvoiced: true }, _sum: { total: true } }),
    ]);
    const total = round2(all._sum.total ?? 0);
    const facturadas = round2(invoiced._sum.total ?? 0);
    ventasResumen = {
      ventasTotal: total,
      ventasFacturadas: facturadas,
      ventasSinFacturar: round2(total - facturadas),
      cantidadVentas: all._count._all,
    };
  }

  const comprobantes = ventas.cbte.map((r) => ({ ...r, esNotaCredito: isCreditNoteType(r.tipoComprobante) }));
  const facturado = round2(comprobantes.filter((c) => !c.esNotaCredito).reduce((s, c) => s + c.importeTotal, 0));
  const notasCredito = round2(comprobantes.filter((c) => c.esNotaCredito).reduce((s, c) => s + c.importeTotal, 0));

  return {
    periodo: {
      year,
      month,
      label: new Date(year, month - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" }),
    },
    generadoEl: new Date(),
    negocio: {
      razonSocial: (config as any)?.businessName ?? null,
      cuit: (config as any)?.cuit ?? null,
      condicionIva: (config as any)?.ivaCondition ?? null,
    },
    resumen: {
      ...ventasResumen,
      facturado,
      notasCredito,
      netoFacturado: round2(facturado - notasCredito),
      comprasTotal: round2(compras.cbte.reduce((s, r) => s + r.importeTotal, 0)),
      comprasConDatosFaltantes: compras.cbte.filter((r) => r.missingFields.length > 0).length,
    },
    comprobantes,
    ivaVentas: sumAlicuotas(ventas.alicuotas),
    compras: compras.cbte,
    ivaCompras: sumAlicuotas(compras.alicuotas),
    liquidacion,
    liquidacionNota,
  };
}

// ---------------------------------------------------------------------------
// Formato compartido por PDF y Word
// ---------------------------------------------------------------------------

const moneyFmt = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n: number | null | undefined) => (n == null ? "—" : `$ ${moneyFmt.format(n)}`);
const dateFmt = (d: Date) => new Date(d).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
const pct = (n: number) => `${String(n).replace(".", ",")}%`;

function cbteNumero(pv: number | null, nro: number | string | null) {
  if (pv == null || nro == null) return "—";
  return `${String(pv).padStart(5, "0")}-${String(nro).padStart(8, "0")}`;
}

type Section = { title: string; note?: string; headers: string[]; widths: number[]; align: ("left" | "right")[]; rows: string[][]; empty: string };

function buildSections(r: ContadorReport): { resumen: [string, string][]; sections: Section[] } {
  const liq = r.liquidacion;
  const resumen: [string, string][] = [
    ...(r.resumen.ventasTotal != null
      ? ([
          ["Ventas del período", `${money(r.resumen.ventasTotal)} (${r.resumen.cantidadVentas} ventas)`],
          ["Ventas facturadas", money(r.resumen.ventasFacturadas)],
          ["Ventas sin facturar", money(r.resumen.ventasSinFacturar)],
        ] as [string, string][])
      : []),
    ["Facturado (comprobantes con CAE)", money(r.resumen.facturado)],
    ["Notas de crédito emitidas", money(r.resumen.notasCredito)],
    ["Facturado neto de notas de crédito", money(r.resumen.netoFacturado)],
    ["Compras del período", money(r.resumen.comprasTotal)],
    ["IVA débito fiscal", liq ? money(liq.debitoFiscal) : "—"],
    ["IVA crédito fiscal", liq ? money(liq.creditoFiscal) : "—"],
    ["Saldo a favor del período anterior", liq ? money(liq.saldoTecnicoAnterior) : "—"],
    [
      liq ? (liq.resultado === "A_PAGAR" ? "Saldo técnico a pagar" : "Saldo técnico a favor") : "Saldo técnico",
      liq ? `${money(Math.abs(liq.saldoTecnico))} (${liq.status === "CERRADO" ? "período cerrado" : "borrador"})` : r.liquidacionNota ?? "—",
    ],
  ];

  const sections: Section[] = [
    {
      title: "Comprobantes emitidos",
      headers: ["Fecha", "Comprobante", "Número", "Receptor", "Documento", "Neto", "IVA", "Total", "CAE"],
      widths: [9, 13, 13, 18, 11, 9, 8, 9, 10],
      align: ["left", "left", "left", "left", "left", "right", "right", "right", "left"],
      rows: r.comprobantes.map((c) => [
        dateFmt(c.fecha),
        c.tipoComprobanteLabel,
        cbteNumero(c.puntoVenta, c.numeroComprobante),
        c.denominacionComprador,
        c.codigoDocComprador === 99 ? "Cons. final" : `${c.codigoDocCompradorLabel} ${c.nroDocComprador}`,
        money(c.importeNeto),
        money(c.importeIva),
        money(c.importeTotal),
        c.cae ?? "—",
      ]),
      empty: "No hay comprobantes emitidos en el período.",
    },
    {
      title: "IVA ventas por alícuota",
      note: "Las notas de crédito restan.",
      headers: ["Alícuota", "Base imponible", "IVA"],
      widths: [30, 35, 35],
      align: ["left", "right", "right"],
      rows: r.ivaVentas.map((a) => [pct(a.alicuota), money(a.base), money(a.iva)]),
      empty: "Sin IVA discriminado en ventas (por ejemplo, solo Factura C).",
    },
    {
      title: "Compras",
      headers: ["Fecha", "Proveedor", "CUIT", "Comprobante", "Número", "IVA", "Percep. IVA", "Otras percep.", "Total"],
      widths: [9, 19, 11, 13, 13, 8, 8, 9, 10],
      align: ["left", "left", "left", "left", "left", "right", "right", "right", "right"],
      rows: r.compras.map((c) => [
        dateFmt(c.fecha),
        c.denominacionVendedor ?? "—",
        c.cuitVendedor ?? "—",
        c.tipoComprobanteLabel,
        c.puntoVenta != null || c.numeroComprobante ? `${String(c.puntoVenta ?? "").padStart(5, "0")}-${c.numeroComprobante ?? ""}` : "—",
        money(c.importeIvaLiquidado),
        money(c.percepcionIva),
        money(round2(c.otrasPercepcionesNacionales + c.percepcionIibb + c.percepcionMunicipal + c.impuestosInternos)),
        money(c.importeTotal),
      ]),
      empty: "No hay compras cargadas en el período.",
    },
    {
      title: "IVA compras por alícuota",
      note: "Solo los comprobantes A y M dan crédito fiscal; B y C van a alícuota 0.",
      headers: ["Alícuota", "Base imponible", "IVA"],
      widths: [30, 35, 35],
      align: ["left", "right", "right"],
      rows: r.ivaCompras.map((a) => [pct(a.alicuota), money(a.base), money(a.iva)]),
      empty: "Sin compras con IVA en el período.",
    },
  ];

  return { resumen, sections };
}

function headerLines(r: ContadorReport) {
  return [
    `Período: ${r.periodo.label}`,
    [r.negocio.razonSocial, r.negocio.cuit ? `CUIT ${r.negocio.cuit}` : null, r.negocio.condicionIva].filter(Boolean).join(" · "),
    `Generado el ${dateFmt(r.generadoEl)} con ComarPOS`,
  ].filter(Boolean);
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

export async function buildContadorPdf(r: ContadorReport): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 20;
  const { resumen, sections } = buildSections(r);

  doc.font("Helvetica-Bold").fontSize(16).fillColor("#111827").text("Reporte para el contador", left, doc.y);
  doc.font("Helvetica").fontSize(9).fillColor("#667085");
  for (const line of headerLines(r)) doc.text(line);
  doc.moveDown(0.8);

  const ensure = (h: number) => {
    if (doc.y + h > bottom()) doc.addPage();
  };

  // Resumen: dos columnas de etiqueta/valor
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827").text("Resumen", left);
  doc.moveDown(0.3);
  // Dos columnas que se leen de arriba hacia abajo: primero ventas/compras,
  // despues el IVA y el saldo.
  const colW = width / 2;
  const half = Math.ceil(resumen.length / 2);
  const startY = doc.y;
  [resumen.slice(0, half), resumen.slice(half)].forEach((col, c) => {
    col.forEach(([label, value], i) => {
      const x = left + c * colW;
      const y = startY + i * 15;
      doc.font("Helvetica").fontSize(8.5).fillColor("#667085").text(label, x, y, { width: colW * 0.55 });
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#111827").text(value, x + colW * 0.55, y, { width: colW * 0.42 });
    });
  });
  doc.x = left;
  doc.y = startY + half * 15;
  doc.moveDown(0.6);

  const rowPad = 3;
  for (const s of sections) {
    ensure(50);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827").text(s.title, left);
    if (s.note) doc.font("Helvetica").fontSize(8).fillColor("#667085").text(s.note);
    doc.moveDown(0.3);

    const colWidths = s.widths.map((w) => (w / 100) * width);
    const drawRow = (cells: string[], header: boolean) => {
      doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(7.5);
      const h = Math.max(...cells.map((c, i) => doc.heightOfString(c, { width: colWidths[i] - 6 }))) + rowPad * 2;
      if (doc.y + h > bottom()) {
        doc.addPage();
        if (!header) drawRow(s.headers, true);
      }
      const y = doc.y;
      if (header) doc.rect(left, y, width, h).fill("#F4F6F8");
      let x = left;
      cells.forEach((c, i) => {
        doc.fillColor(header ? "#111827" : "#172033").font(header ? "Helvetica-Bold" : "Helvetica").fontSize(7.5)
          .text(c, x + 3, y + rowPad, { width: colWidths[i] - 6, align: s.align[i] });
        x += colWidths[i];
      });
      doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.5).strokeColor("#EAECF0").stroke();
      doc.y = y + h;
    };

    drawRow(s.headers, true);
    if (s.rows.length === 0) {
      doc.font("Helvetica").fontSize(8).fillColor("#667085").text(s.empty, left + 3, doc.y + 4);
      doc.moveDown(0.5);
    }
    for (const row of s.rows) drawRow(row, false);
    doc.x = left;
    doc.moveDown(1);
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.font("Helvetica").fontSize(7).fillColor("#98A2B3")
      .text(`Página ${i + 1} de ${range.count}`, left, doc.page.height - doc.page.margins.bottom - 10, { width, align: "right", lineBreak: false });
  }

  doc.end();
  return done;
}

// ---------------------------------------------------------------------------
// Word (.docx)
// ---------------------------------------------------------------------------

function docxTable(headers: string[], widths: number[], align: ("left" | "right")[], rows: string[][]) {
  const cell = (text: string, i: number, header: boolean) =>
    new TableCell({
      width: { size: widths[i], type: WidthType.PERCENTAGE },
      shading: header ? { fill: "F4F6F8" } : undefined,
      children: [
        new Paragraph({
          alignment: align[i] === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [new TextRun({ text, bold: header, size: 16 })],
        }),
      ],
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }),
      ...rows.map((row) => new TableRow({ children: row.map((c, i) => cell(c, i, false)) })),
    ],
  });
}

export async function buildContadorDocx(r: ContadorReport): Promise<Buffer> {
  const { resumen, sections } = buildSections(r);
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun("Reporte para el contador")] }),
    ...headerLines(r).map((line) => new Paragraph({ children: [new TextRun({ text: line, color: "667085", size: 18 })] })),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Resumen")] }),
    docxTable(["Concepto", "Importe"], [60, 40], ["left", "right"], resumen.map(([a, b]) => [a, b])),
  ];

  for (const s of sections) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(s.title)] }));
    if (s.note) children.push(new Paragraph({ children: [new TextRun({ text: s.note, color: "667085", size: 18 })] }));
    if (s.rows.length === 0) {
      children.push(new Paragraph({ children: [new TextRun({ text: s.empty, italics: true, size: 18 })] }));
    } else {
      children.push(docxTable(s.headers, s.widths, s.align, s.rows));
    }
  }

  const doc = new Document({
    creator: "ComarPOS",
    title: `Reporte para el contador - ${r.periodo.label}`,
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
