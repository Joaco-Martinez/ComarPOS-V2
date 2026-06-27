/**
 * Helpers de consulta: construccion de filtros, include de relaciones,
 * estadisticas, y cola de generacion de PDFs.
 * Extraidos de sale.service.ts (doc seccion 4.1 - modularizacion).
 */
import prisma from "../../prisma";
import { SaleStatus, InvoiceStatus } from "@prisma/client";
import { generateInvoicePDF } from "../../utils/pdfGenerator";
import { GetSalesParams, DEFAULT_QUOTATION_HOURS } from "./sale.types";
import { round2 } from "./sale.pricing";
import { tenantScope } from "../../utils/tenantScope";


function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function resolveQuotationHours(value?: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_QUOTATION_HOURS;
  }

  return parsed;
}

function buildSaleInclude() {
  return {
    payments: true,
    businessLocation: true,
    items: {
      include: {
        product: {
          include: {
            category: true,
          },
        },
        boxContents: {
          include: {
            product: true,
          },
        },
      },
    },
    user: true,
    client: true,
    invoiceAfip: {
      include: {
        creditNotes: true,
      },
    },
  };
}

function queueSalePdfGeneration(saleId: string) {
  setImmediate(() => {
    void (async () => {
      try {
        const sale = await prisma.sale.findFirst({
          where: { id: saleId, ...tenantScope() },
          include: {
            payments: true,
            businessLocation: true,
            items: {
              include: {
                product: true,
                boxContents: {
                  include: {
                    product: true,
                  },
                },
              },
            },
            user: true,
            client: true,
          },
        });

        if (!sale) return;

        const pdfPath = await generateInvoicePDF(sale);

        await prisma.invoice.upsert({
          where: {
            saleId: sale.id,
          },
          create: {
            saleId: sale.id,
            pdfUrl: pdfPath,
          },
          update: {
            pdfUrl: pdfPath,
          },
        });

        await prisma.sale.update({
          where: { id: sale.id },
          data: {
            pdfUrl: pdfPath,
          },
        });
      } catch (error) {
        console.error("Error generando PDF de venta en segundo plano:", error);
      }
    })();
  });
}

function normalizePositiveInt(value: unknown, fallback?: number) {
  if (value === undefined || value === null || value === "") return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;

  const valueAsInt = Math.trunc(parsed);
  return valueAsInt > 0 ? valueAsInt : fallback;
}

function normalizeSaleStatusFilter(value?: string | SaleStatus) {
  if (!value) return undefined;

  const status = String(value).toUpperCase();
  return Object.values(SaleStatus).includes(status as SaleStatus)
    ? (status as SaleStatus)
    : undefined;
}

function buildSalesWhere(params: GetSalesParams = {}, includeStatus = true) {
  const where: any = { ...tenantScope() };
  const status = includeStatus ? normalizeSaleStatusFilter(params.status) : undefined;
  const search = String(params.search ?? "").trim();

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { id: { contains: search, mode: "insensitive" } },
      { client: { nombre: { contains: search, mode: "insensitive" } } },
      { client: { apellido: { contains: search, mode: "insensitive" } } },
      { client: { dni: { contains: search, mode: "insensitive" } } },
      { client: { gmail: { contains: search, mode: "insensitive" } } },
    ];
  }

  return where;
}

function getConfirmedMoneyWhere(baseWhere: any = {}) {
  return {
    AND: [
      baseWhere,
      { status: { not: SaleStatus.CANCELLED } },
      {
        OR: [
          { status: SaleStatus.COMPLETED },
          { isInvoiced: true },
          { invoiceStatus: InvoiceStatus.INVOICED },
        ],
      },
    ],
  };
}

async function buildSalesStats(params: GetSalesParams = {}) {
  const baseWhere = buildSalesWhere(params, false);
  const confirmedWhere = getConfirmedMoneyWhere(baseWhere);

  const [
    totalCount,
    pendingCount,
    completedCount,
    cancelledCount,
    confirmedTotal,
    debt,
  ] = await Promise.all([
    prisma.sale.count({ where: baseWhere }),
    prisma.sale.count({ where: { ...baseWhere, status: SaleStatus.PENDING } }),
    prisma.sale.count({ where: { ...baseWhere, status: SaleStatus.COMPLETED } }),
    prisma.sale.count({ where: { ...baseWhere, status: SaleStatus.CANCELLED } }),
    prisma.sale.aggregate({ where: confirmedWhere, _sum: { total: true } }),
    prisma.sale.aggregate({ where: confirmedWhere, _sum: { accountDebtAmount: true } }),
  ]);

  return {
    totalCount,
    pendingCount,
    completedCount,
    cancelledCount,
    confirmedTotal: round2(Number(confirmedTotal._sum.total ?? 0)),
    debt: round2(Number(debt._sum.accountDebtAmount ?? 0)),
  };
}

export {
  addHours,
  resolveQuotationHours,
  buildSaleInclude,
  queueSalePdfGeneration,
  normalizePositiveInt,
  normalizeSaleStatusFilter,
  buildSalesWhere,
  getConfirmedMoneyWhere,
  buildSalesStats,
};
