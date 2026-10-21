import "../config/timezone";
import prisma from "../prisma";
import { facturarVenta, generarPdfFacturaVenta, FacturacionError } from "../afip/facturacion.service";
import { isAfipUnavailable } from "../afip/utils/isAfipUnavailable";
import { runWithTenant } from "../context/tenantContext";

function calcNextRetry(retryCount: number) {
  // Backoff: 5m, 10m, 15m, 20m, ... máx 60m
  const minutes = Math.min(60, 5 * Math.max(1, retryCount));
  return new Date(Date.now() + minutes * 60 * 1000);
}

export async function processAfipPendingInvoices() {
  const now = new Date();

  const pendingSales = await prisma.sale.findMany({
    where: {
      invoiceStatus: "PENDING_AFIP",
      nextRetryAt: { lte: now },
    },
    take: 5, // no mates al server
    orderBy: { nextRetryAt: "asc" },
  });

  if (pendingSales.length === 0) return;

  for (const sale of pendingSales) {
    // doc seccion 6 - multi-tenant: este worker corre fuera de un request,
    // asi que no hay tenant resuelto por subdominio. Se usa el tenantId que
    // ya tiene la venta para que la InvoiceAfip que se cree quede del mismo tenant.
    await runWithTenant((sale as any).tenantId, () => processSale(sale, now));
  }
}

async function processSale(sale: any, now: Date) {
  // 🔒 “lock” básico para que no lo agarre 2 veces en el mismo proceso
  const locked = await prisma.sale.updateMany({
    where: {
      id: sale.id,
      invoiceStatus: "PENDING_AFIP",
      nextRetryAt: { lte: now },
    },
    data: {
      nextRetryAt: new Date(Date.now() + 2 * 60 * 1000), // lo pateamos 2 min mientras procesamos
    },
  });

  if (locked.count === 0) return;

  try {
    // Mismo camino que el boton "Facturar": reutiliza el tipo, documento,
    // condicion IVA y dueno grabados en el intento original
    // (afipPayloadJson / requestedArcaConfigId).
    const { factura, sale: fullSale, arcaConfig, nroDoc } = await facturarVenta({
      saleId: sale.id,
      arcaConfigId: sale.requestedArcaConfigId ?? undefined,
    });

    // Si aprobó => PDF + estado OK
    if (factura.resultado === "A" && factura.cae) {
      await generarPdfFacturaVenta(factura, fullSale, arcaConfig, nroDoc).catch((e: any) =>
        console.warn("⚠️ AFIP retry OK pero falló el PDF/impresión:", sale.id, e?.message)
      );

      await prisma.sale.update({
        where: { id: sale.id },
        data: {
          invoiceStatus: "INVOICED",
          afipLastError: null,
          nextRetryAt: null,
          retryCount: 0,
        },
      });

      console.log("✅ AFIP retry OK:", sale.id);
      return;
    }

    // AFIP respondió pero rechazó
    await prisma.sale.update({
      where: { id: sale.id },
      data: {
        invoiceStatus: "ERROR",
        afipLastError: "AFIP_REJECTED_ON_RETRY",
      },
    });

    console.warn("⚠️ AFIP rechazó en retry:", sale.id);
  } catch (err: any) {
    // Otra emision de esta misma venta en curso (ej. reintento manual): se
    // deja como esta, el lock de 2 min ya lo patea para mas adelante.
    if (err instanceof FacturacionError && err.code === "INVOICE_IN_PROGRESS") return;

    const retryCount = (sale.retryCount ?? 0) + 1;

    // Si sigue caído => reprogramar
    if (isAfipUnavailable(err)) {
      const next = calcNextRetry(retryCount);

      await prisma.sale.update({
        where: { id: sale.id },
        data: {
          invoiceStatus: "PENDING_AFIP",
          afipLastError: "AFIP_UNAVAILABLE",
          retryCount,
          nextRetryAt: next,
        },
      });

      console.log("⏳ AFIP sigue caído, reintento programado:", sale.id, next.toISOString());
      return;
    }

    // Error real (no caída de AFIP)
    await prisma.sale.update({
      where: { id: sale.id },
      data: {
        invoiceStatus: "ERROR",
        afipLastError: err?.message ?? "UNKNOWN_ERROR",
        retryCount,
        nextRetryAt: null,
      },
    });

    console.error("❌ Error en retry AFIP:", sale.id, err?.message);
  }
}
