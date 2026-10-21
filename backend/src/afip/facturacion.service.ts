/**
 * Emision de factura AFIP de una venta -- unico camino, lo usan el boton
 * "Facturar" (afip/controllers/facturar.controller.ts) y el reintento
 * automatico cuando AFIP estaba caido (cron/afipRetry.worker.ts). Antes el
 * reintento usaba otro emisor (wsfe legacy, con produccion y punto de venta
 * 7 fijos) y un payload incompleto, asi que nunca llegaba a facturar.
 *
 * Resuelve que se factura (tipo A/B/C, documento y condicion IVA del
 * receptor) a partir de lo que pidio el usuario, lo pedido en un intento
 * anterior y los datos del cliente; valida las reglas de AFIP; toma un lock
 * por venta para que no salgan dos facturas (doble click, reintento manual
 * mientras corre el worker) y llama a emitirFacturaAFIPBase.
 */
import prisma from "../prisma";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { arcaConfigService } from "../services/arcaConfig.service";
import { emitirFacturaAFIPBase } from "./wsfe-base.service";
import { generarFacturaAfipPDF } from "./utils/generarFacturaAfipPDF";
import {
  getAllowedCbteTipos,
  cbteTipoLabel,
  condicionIvaReceptorFromClient,
  CONDICION_IVA_RECEPTOR,
  CONDICIONES_FACTURA_A,
  CBTE_TIPO_A,
  CBTE_TIPO_B,
  CBTE_TIPO_C,
} from "./ivaCondition";
import {
  normalizarDocumento,
  detectarTipoDocumento,
  mapTipoCliente,
  getNombreCliente,
  getDocumentoCliente,
  getDomicilioCliente,
  mapProductsFromSaleOrBody,
  getMetodoPago,
  getFacturaQrUrl,
} from "./utils/afipMappers";

// Tiempo maximo que una emision retiene el lock (cubre los timeouts de 30s
// de cada llamada SOAP); si el proceso muere a mitad, se libera solo.
const LOCK_MS = 3 * 60 * 1000;

export class FacturacionError extends Error {
  constructor(message: string, public status = 400, public code = "FACTURACION_INVALIDA") {
    super(message);
  }
}

export type FacturarVentaParams = {
  saleId: string;
  tipoComprobante?: number | string | null;
  // undefined = no lo mando el usuario (reintento): se usa el del intento
  // anterior o el del cliente. "" / 0 = consumidor final explicito.
  nroDoc?: string | number | null;
  condicionIVAReceptor?: number | string | null;
  arcaConfigId?: string | null;
};

function saleInclude() {
  return {
    invoiceAfip: true,
    client: true,
    items: { include: { product: true } },
    payments: true,
  } as const;
}

async function acquireLock(saleId: string) {
  const now = new Date();
  const locked = await prisma.sale.updateMany({
    where: {
      id: saleId,
      ...tenantScope(),
      isInvoiced: false,
      OR: [{ afipProcessingUntil: null }, { afipProcessingUntil: { lt: now } }],
    },
    data: { afipProcessingUntil: new Date(now.getTime() + LOCK_MS) },
  });
  return locked.count > 0;
}

async function releaseLock(saleId: string) {
  await prisma.sale
    .update({ where: { id: saleId }, data: { afipProcessingUntil: null } })
    .catch(() => null);
}

export async function facturarVenta(params: FacturarVentaParams) {
  const { saleId } = params;
  if (!saleId) throw new FacturacionError("saleId es requerido");

  // Multi-facturacion: el dueno elegido solo se honra con el flag del tenant.
  const multiInvoicingEnabled = await arcaConfigService.isMultiInvoicingEnabled();
  const selectedArcaConfigId = multiInvoicingEnabled && params.arcaConfigId ? String(params.arcaConfigId) : undefined;

  let arcaConfig: Awaited<ReturnType<typeof arcaConfigService.getConfig>> | null = null;
  if (selectedArcaConfigId) {
    try {
      arcaConfig = await arcaConfigService.getConfigById(selectedArcaConfigId);
    } catch {
      throw new FacturacionError("La configuración ARCA (dueño) seleccionada no existe o no pertenece a este negocio.");
    }
  } else {
    arcaConfig = await arcaConfigService.getConfig().catch(() => null);
  }

  const sale = await prisma.sale.findFirst({ where: { id: saleId, ...tenantScope() }, include: saleInclude() });
  if (!sale) throw new FacturacionError("Venta no encontrada", 404, "SALE_NOT_FOUND");

  if (sale.isInvoiced || sale.invoiceStatus === "INVOICED" || sale.invoiceAfip?.cae) {
    throw new FacturacionError("Esta venta ya fue facturada.", 400, "ALREADY_INVOICED");
  }

  const previous = (sale.afipPayloadJson ?? {}) as Record<string, any>;
  const allowedTipos = getAllowedCbteTipos(arcaConfig?.ivaCondition);

  // --- Documento del receptor ---
  const rawDoc =
    params.nroDoc !== undefined
      ? params.nroDoc
      : previous.nroDoc ?? previous.receiverDoc ?? sale.client?.dni ?? "";
  const docLimpio = normalizarDocumento(rawDoc);
  const docDetectado = docLimpio && Number(docLimpio) !== 0 ? detectarTipoDocumento(docLimpio) : null;

  // La condicion IVA cargada en el cliente solo aplica si se le factura a
  // ese mismo documento (en el modal se puede tipear otro).
  const docEsDelCliente = Boolean(sale.client?.dni) && normalizarDocumento(sale.client?.dni) === docLimpio;
  const condicionCliente = docEsDelCliente ? condicionIvaReceptorFromClient(sale.client?.ivaCondition) : null;

  // --- Tipo de comprobante ---
  let tipo = Number(params.tipoComprobante ?? previous.tipoComprobante ?? NaN);
  if (!Number.isFinite(tipo)) {
    if (allowedTipos.includes(CBTE_TIPO_A) && docDetectado?.tipoDoc === 80 && condicionCliente != null && CONDICIONES_FACTURA_A.includes(condicionCliente)) {
      tipo = CBTE_TIPO_A;
    } else if (allowedTipos.includes(CBTE_TIPO_B)) {
      tipo = CBTE_TIPO_B;
    } else {
      tipo = CBTE_TIPO_C;
    }
  }

  if (!allowedTipos.includes(tipo)) {
    throw new FacturacionError(
      `Tu condición frente al IVA no te permite emitir Factura ${cbteTipoLabel(tipo)}. Tipos permitidos: ${allowedTipos.map(cbteTipoLabel).join(", ")}.`
    );
  }

  // --- Documento AFIP + condicion IVA del receptor (RG 5616) ---
  const explicitCondicion = Number(params.condicionIVAReceptor ?? previous.condicionIVAReceptor ?? NaN);
  let tipoDoc: number;
  let nroDoc: number;
  let condicion: number;

  if (tipo === CBTE_TIPO_A) {
    if (!docDetectado || docDetectado.tipoDoc !== 80) {
      throw new FacturacionError("Para Factura A el receptor debe tener un CUIT válido (es para Responsables Inscriptos).");
    }
    tipoDoc = 80;
    nroDoc = docDetectado.nroDoc;
    condicion = Number.isFinite(explicitCondicion)
      ? explicitCondicion
      : condicionCliente ?? CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO;
    if (!CONDICIONES_FACTURA_A.includes(condicion)) {
      throw new FacturacionError(
        "Ese cliente no es Responsable Inscripto ni Monotributista: no se le puede emitir Factura A. Usá Factura B."
      );
    }
  } else {
    if (docDetectado) {
      tipoDoc = docDetectado.tipoDoc;
      nroDoc = docDetectado.nroDoc;
      condicion = Number.isFinite(explicitCondicion)
        ? explicitCondicion
        : condicionCliente ?? CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL;
    } else {
      // Sin documento solo se puede facturar a Consumidor Final.
      tipoDoc = 99;
      nroDoc = 0;
      condicion = CONDICION_IVA_RECEPTOR.CONSUMIDOR_FINAL;
    }

    if (tipo === CBTE_TIPO_B && condicion === CONDICION_IVA_RECEPTOR.RESPONSABLE_INSCRIPTO) {
      throw new FacturacionError("El cliente es Responsable Inscripto: le corresponde Factura A, no B.");
    }
  }

  if (!(await acquireLock(saleId))) {
    throw new FacturacionError("La factura de esta venta ya se está procesando. Esperá unos segundos.", 409, "INVOICE_IN_PROGRESS");
  }

  try {
    // Se graba ANTES de llamar a AFIP: si AFIP esta caido, el worker
    // reintenta con exactamente esto (mismo dueno, tipo y receptor).
    await prisma.sale.update({
      where: { id: saleId },
      data: {
        afipPayloadJson: {
          saleId,
          tipoComprobante: tipo,
          nroDoc: docLimpio,
          condicionIVAReceptor: condicion,
          arcaConfigId: selectedArcaConfigId ?? null,
        },
        afipLastError: null,
        nextRetryAt: null,
        requestedArcaConfigId: selectedArcaConfigId ?? null,
      },
    });

    const factura = await emitirFacturaAFIPBase({
      saleId,
      arcaConfigId: selectedArcaConfigId,
      tipoComprobante: tipo,
      tipoDoc,
      nroDoc,
      condicionIVAReceptor: condicion,
    });

    return { factura, sale, arcaConfig, nroDoc: docLimpio };
  } finally {
    await releaseLock(saleId);
  }
}

/** PDF/ticket de una factura aprobada (sube el PDF y lo manda al POS). */
export async function generarPdfFacturaVenta(
  factura: any,
  sale: any,
  arcaConfig: { businessName?: string | null; fiscalAddress?: string | null } | null,
  nroDoc: string
) {
  const tenantForTicket = currentTenantId()
    ? await prisma.tenant
        .findUnique({ where: { id: currentTenantId()! }, select: { ticketPhone: true } })
        .catch(() => null)
    : null;

  const client = sale.client;
  const docCliente = getDocumentoCliente(client, { dni: nroDoc });

  await generarFacturaAfipPDF({
    tipoComprobante: Number(factura.tipoComprobante),
    puntoVenta: Number(factura.puntoVenta),
    saleId: sale.id,
    numero: Number(factura.numero),
    fechaEmision: factura.fechaEmision ? new Date(factura.fechaEmision) : new Date(),
    total: Number(factura.total),
    products: mapProductsFromSaleOrBody({}, sale).map((p) => ({
      name: p.descripcion,
      quantity: p.cantidad,
      price: p.precioUnitario,
      subtotal: p.subtotal,
    })),
    metodoPago: getMetodoPago({}, sale),
    cae: String(factura.cae),
    caeVto: factura.caeVto ? new Date(factura.caeVto) : new Date(),
    cuit: String(factura.cuit),
    razonSocial: arcaConfig?.businessName || undefined,
    direccion: arcaConfig?.fiscalAddress || undefined,
    telefonoNegocio: tenantForTicket?.ticketPhone || undefined,
    qrBase64: factura.qrBase64 ?? null,
    qrUrl: getFacturaQrUrl(factura) ?? factura.urlQR ?? undefined,
    tipoCliente: mapTipoCliente(client?.category),
    nombreCliente: getNombreCliente(client, {}),
    documentoCliente: docCliente.nroDoc || "",
    telefonoCliente: client?.telefono ?? undefined,
    domicilioCliente: getDomicilioCliente(client),
  });
}
