/**
 * Handler de emision de factura AFIP.
 * Extraido de afip.controller.ts (doc seccion 4.3 - modularizacion).
 */
import { Request, Response } from "express";
import {
  emitirFacturaCConsumidorFinal,
  emitirFacturaCACliente,
} from "../wsfe-C.service";
import { generarFacturaAfipPDF } from "../utils/generarFacturaAfipPDF";
import { isAfipUnavailable } from "../utils/isAfipUnavailable";
import prisma from "../../prisma";
import { tenantScope } from "../../utils/tenantScope";
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
} from "../utils/afipMappers";

export async function facturarController(req: Request, res: Response) {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  const { saleId, ...facturaData } = req.body;

  // Seguridad backend: aunque el frontend mande A o B, este sistema solo emite Factura C.
  facturaData.tipoComprobante = 11;
  req.body.tipoComprobante = 11;

  console.log("============================================================");
  console.log(`🟦 [${requestId}] INICIO POST /afip/facturar`);
  console.log(`🟦 [${requestId}] Timestamp:`, new Date().toISOString());
  console.log(`🟦 [${requestId}] Body completo:`, JSON.stringify(req.body, null, 2));
  console.log(`🟦 [${requestId}] Body resumen:`, {
    saleId,
    tipoComprobante: facturaData.tipoComprobante,
    tipoDoc: facturaData.tipoDoc,
    nroDoc: facturaData.nroDoc,
    cuit: facturaData.cuit,
    importe: facturaData.importe,
    condicionIVAReceptor: facturaData.condicionIVAReceptor,
  });

  try {
    console.log(`🔎 [${requestId}] Validando saleId...`);

    if (!saleId) {
      console.warn(`⚠️ [${requestId}] saleId faltante`);
      return res.status(400).json({ ok: false, error: "saleId es requerido" });
    }

    console.log(`🔎 [${requestId}] Buscando venta en DB:`, saleId);

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, ...tenantScope() },
      include: {
        invoiceAfip: true,
        client: true,
        items: {
          include: {
            product: true,
          },
        },
        payments: true,
      },
    });

    if (!sale) {
      console.warn(`❌ [${requestId}] Venta no encontrada:`, saleId);
      return res.status(404).json({ ok: false, error: "Venta no encontrada" });
    }

    console.log(`✅ [${requestId}] Venta encontrada:`, {
      id: sale.id,
      total: sale.total,
      subtotal: (sale as any).subtotal,
      discount: (sale as any).discount,
      status: sale.status,
      isInvoiced: sale.isInvoiced,
      invoiceStatus: sale.invoiceStatus,
      tieneInvoiceAfip: Boolean(sale.invoiceAfip),
      invoiceAfipId: sale.invoiceAfip?.id ?? null,
      clientId: sale.clientId,
      tieneCliente: Boolean(sale.client),
      itemsLength: sale.items.length,
      paymentsLength: sale.payments.length,
      afipLastError: sale.afipLastError,
      nextRetryAt: sale.nextRetryAt,
      retryCount: sale.retryCount,
    });

    console.log(`👤 [${requestId}] Cliente:`, sale.client
      ? {
          id: sale.client.id,
          nombre: sale.client.nombre,
          apellido: sale.client.apellido,
          dni: sale.client.dni,
          gmail: sale.client.gmail,
          telefono: sale.client.telefono,
          category: sale.client.category,
        }
      : null
    );

    console.log(`📦 [${requestId}] Items de venta:`, sale.items.map((item: any) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product?.name,
      sku: item.product?.sku,
      quantity: item.quantity,
      quantityKg: item.quantityKg,
      price: item.price,
      subtotal: item.subtotal,
    })));

    console.log(`💳 [${requestId}] Pagos:`, sale.payments.map((payment: any) => ({
      id: payment.id,
      method: payment.method,
      amount: payment.amount,
    })));

    const invoiceApproved =
      sale.isInvoiced ||
      sale.invoiceStatus === "INVOICED" ||
      Boolean(sale.invoiceAfip?.cae);

    if (invoiceApproved) {
      console.warn(`⚠️ [${requestId}] Venta ya facturada/aprobada:`, {
        saleId,
        isInvoiced: sale.isInvoiced,
        invoiceStatus: sale.invoiceStatus,
        invoiceAfipId: sale.invoiceAfip?.id ?? null,
        cae: sale.invoiceAfip?.cae ?? null,
      });

      return res.status(400).json({
        ok: false,
        error: "Esta venta ya fue facturada.",
      });
    }

    if (sale.invoiceStatus === "PENDING_AFIP") {
      console.warn(`🔁 [${requestId}] Venta pendiente AFIP. Reintentando facturación manualmente...`, {
        saleId,
        nextRetryAt: sale.nextRetryAt,
        retryCount: sale.retryCount,
        afipLastError: sale.afipLastError,
      });

      await prisma.sale.update({
        where: { id: saleId },
        data: {
          afipLastError: null,
          nextRetryAt: null,
        },
      });
    }

    console.log(`📝 [${requestId}] Guardando payload AFIP en sale.afipPayloadJson...`);

    await prisma.sale.update({
      where: { id: saleId },
      data: {
        afipPayloadJson: req.body,
        afipLastError: null,
        nextRetryAt: null,
      },
    });

    console.log(`✅ [${requestId}] Payload AFIP guardado correctamente`);

    let factura: any;

    console.log(`🧾 [${requestId}] Decidiendo tipo de comprobante...`, {
      tipoComprobante: facturaData.tipoComprobante,
      tipoComprobanteNumber: Number(facturaData.tipoComprobante),
    });

    if (facturaData.tipoComprobante !== 11) {
      console.warn(`⚠️ [${requestId}] Tipo de comprobante no soportado:`, facturaData.tipoComprobante);

      return res.status(400).json({
        ok: false,
        error: "Tipo de comprobante no soportado. Este sistema solo permite Factura C.",
      });
    }

    console.log(`🇨 [${requestId}] Entró a Factura C`);

    const docLimpio = normalizarDocumento(facturaData.nroDoc);

    const quiereConsumidorFinal =
      Number(facturaData.tipoDoc) === 99 ||
      docLimpio === "" ||
      Number(docLimpio) === 0;

    console.log(`🪪 [${requestId}] Documento Factura C:`, {
      tipoDocOriginal: facturaData.tipoDoc,
      nroDocOriginal: facturaData.nroDoc,
      docLimpio,
      quiereConsumidorFinal,
    });

    if (quiereConsumidorFinal) {
      console.log(`👤 [${requestId}] Factura C consumidor final`);

      console.log(`🚀 [${requestId}] Llamando emitirFacturaCConsumidorFinal...`, {
        saleId,
        cuit: facturaData.cuit,
        importe: facturaData.importe,
      });

      factura = await emitirFacturaCConsumidorFinal({
        saleId,
        cuit: facturaData.cuit,
        importe: facturaData.importe,
      });

      console.log(`✅ [${requestId}] emitirFacturaCConsumidorFinal respondió`);
    } else {
      const docDetectado = detectarTipoDocumento(facturaData.nroDoc);

      console.log(`🪪 [${requestId}] Documento detectado Factura C cliente:`, docDetectado);

      if (!docDetectado) {
        console.warn(`⚠️ [${requestId}] Factura C con cliente sin documento válido`);
        return res.status(400).json({
          ok: false,
          error:
            "Para Factura C con cliente, el documento debe ser válido. Puede ser DNI, CUIT o CUIL.",
        });
      }

      console.log(`🚀 [${requestId}] Llamando emitirFacturaCACliente...`, {
        saleId,
        cuit: facturaData.cuit,
        tipoDoc: docDetectado.tipoDoc,
        nroDoc: docDetectado.nroDoc,
        importe: facturaData.importe,
        condicionIVAReceptor: facturaData.condicionIVAReceptor,
      });

      factura = await emitirFacturaCACliente({
        saleId,
        cuit: facturaData.cuit,
        tipoDoc: docDetectado.tipoDoc,
        nroDoc: docDetectado.nroDoc,
        importe: facturaData.importe,
        condicionIVAReceptor: facturaData.condicionIVAReceptor,
      });

      console.log(`✅ [${requestId}] emitirFacturaCACliente respondió`);
    }

    console.log(`📨 [${requestId}] Respuesta cruda de AFIP/factura:`, factura);

    const safeFactura = JSON.parse(
      JSON.stringify(factura, (_, v) => (typeof v === "bigint" ? v.toString() : v))
    );

    console.log(`🧾 [${requestId}] Factura safe:`, safeFactura);

    console.log(`🔎 [${requestId}] Evaluando resultado AFIP:`, {
      resultado: factura?.resultado,
      cae: factura?.cae,
      numero: factura?.numero,
      tipoComprobante: factura?.tipoComprobante,
      puntoVenta: factura?.puntoVenta,
      total: factura?.total,
    });

    if (factura.resultado === "A" && factura.cae) {
      console.log(`✅ [${requestId}] AFIP APROBÓ la factura`);

      let posDisconnected = false;
      let posErrorMessage: string | null = null;

      try {
        console.log(`🖨️ [${requestId}] Preparando generación PDF / impresión POS...`);

        const client = sale.client;

        console.log(`👤 [${requestId}] Mapeando cliente para PDF...`);

        const tipoCliente = mapTipoCliente(client?.category);
        const nombreCliente = getNombreCliente(client, facturaData);
        const _docCliente = getDocumentoCliente(client, facturaData);
        const documentoCliente: string | number = _docCliente.nroDoc || "";
        const telefonoCliente = client?.telefono ?? undefined;
        const domicilioCliente = getDomicilioCliente(client);

        console.log(`👤 [${requestId}] Cliente PDF:`, {
          tipoCliente,
          nombreCliente,
          documentoCliente,
          telefonoCliente,
          domicilioCliente,
        });

        console.log(`📦 [${requestId}] Mapeando productos para PDF...`);

        const products = mapProductsFromSaleOrBody(req.body, sale).map((p) => ({
          name: p.descripcion,
          quantity: p.cantidad,
          price: p.precioUnitario,
          subtotal: p.subtotal,
        }));

        console.log(`📦 [${requestId}] Productos PDF:`, products);

        console.log(`💳 [${requestId}] Mapeando método de pago...`);

        const metodoPago = getMetodoPago(req.body, sale);

        console.log(`💳 [${requestId}] Método de pago PDF:`, metodoPago);

        const qrUrl = getFacturaQrUrl(factura);

        console.log(`🧾 [${requestId}] QR URL enviado al agente:`, qrUrl ?? "SIN QR URL");

        console.log(`🚀 [${requestId}] Llamando generarFacturaAfipPDF...`, {
          tipoComprobante: Number(factura.tipoComprobante),
          puntoVenta: Number(factura.puntoVenta),
          saleId,
          numero: Number(factura.numero),
          fechaEmision: factura.fechaEmision ? new Date(factura.fechaEmision) : new Date(),
          total: Number(factura.total),
          metodoPago,
          cae: String(factura.cae),
          caeVto: factura.caeVto ? new Date(factura.caeVto) : new Date(),
          cuit: String(factura.cuit),
          tieneQrBase64: Boolean(factura.qrBase64),
          qrUrl,
        });

        await generarFacturaAfipPDF({
          tipoComprobante: Number(factura.tipoComprobante),
          puntoVenta: Number(factura.puntoVenta),
          saleId,
          numero: Number(factura.numero),
          fechaEmision: factura.fechaEmision
            ? new Date(factura.fechaEmision)
            : new Date(),
          total: Number(factura.total),
          products,
          metodoPago,
          cae: String(factura.cae),
          caeVto: factura.caeVto ? new Date(factura.caeVto) : new Date(),
          cuit: String(factura.cuit),

          qrBase64: factura.qrBase64 ?? null,
          qrUrl,

          tipoCliente,
          nombreCliente,
          documentoCliente,
          telefonoCliente,
          domicilioCliente,
        });

        console.log(`✅ [${requestId}] PDF generado, subido y ticket enviado correctamente`);
      } catch (printErr: any) {
        posDisconnected = true;

        console.error(`❌ [${requestId}] Error en generación PDF / impresión POS`);
        console.error(`📛 [${requestId}] printErr message:`, printErr?.message);
        console.error(`📛 [${requestId}] printErr name:`, printErr?.name);
        console.error(`📛 [${requestId}] printErr code:`, printErr?.code);
        console.error(`📛 [${requestId}] printErr stack:`, printErr?.stack);

        if (printErr?.response) {
          console.error(`🌐 [${requestId}] printErr response status:`, printErr.response.status);
          console.error(`🌐 [${requestId}] printErr response data:`, printErr.response.data);
          console.error(`🌐 [${requestId}] printErr response headers:`, printErr.response.headers);
        }

        if (printErr?.config) {
          console.error(`🌐 [${requestId}] printErr axios config:`, {
            method: printErr.config.method,
            url: printErr.config.url,
            baseURL: printErr.config.baseURL,
            timeout: printErr.config.timeout,
          });
        }

        const status = printErr?.response?.status;
        const ngrokCode = printErr?.response?.headers?.["ngrok-error-code"];
        const url = printErr?.config?.url;

        posErrorMessage =
          ngrokCode === "ERR_NGROK_3200" || status === 404
            ? `AFIP aprobó y se facturó, pero el POS está desconectado. Endpoint: ${
                url ?? "desconocido"
              }`
            : `AFIP aprobó y se facturó, pero falló la impresión en el POS. ${
                printErr?.message ?? ""
              }`;

        console.warn(`⚠️ [${requestId}]`, posErrorMessage);
      }

      console.log(`📝 [${requestId}] Actualizando venta como INVOICED...`, {
        saleId,
        posDisconnected,
        posErrorMessage,
      });

      await prisma.sale.update({
        where: { id: saleId },
        data: {
          invoiceStatus: "INVOICED",
          afipLastError: posDisconnected ? "POS_DISCONNECTED" : null,
          nextRetryAt: null,
          retryCount: 0,
        },
      });

      console.log(`✅ [${requestId}] Venta actualizada como INVOICED`);

      const responsePayload = {
        ok: true,
        invoiceStatus: "INVOICED",
        factura: safeFactura,
        ...(posDisconnected
          ? {
              warning: "AFIP aprobó y se facturó, pero el POS está desconectado.",
              posError: posErrorMessage,
            }
          : {}),
      };

      console.log(`🟩 [${requestId}] Respondiendo 200:`, responsePayload);
      console.log(`🟩 [${requestId}] FIN OK en ${Date.now() - startedAt}ms`);
      console.log("============================================================");

      return res.status(200).json(responsePayload);
    }

    console.warn(`🟥 [${requestId}] AFIP rechazó o no aprobó la factura:`, safeFactura);

    console.log(`📝 [${requestId}] Actualizando venta como ERROR / AFIP_REJECTED...`);

    await prisma.sale.update({
      where: { id: saleId },
      data: {
        invoiceStatus: "ERROR",
        afipLastError: "AFIP_REJECTED",
      },
    });

    console.log(`🟥 [${requestId}] Respondiendo 409 AFIP_REJECTED`);
    console.log(`🟥 [${requestId}] FIN REJECTED en ${Date.now() - startedAt}ms`);
    console.log("============================================================");

    return res.status(409).json({
      ok: false,
      invoiceStatus: "REJECTED",
      message: "AFIP rechazó la factura.",
      factura: safeFactura,
    });
  } catch (err: any) {
    console.error(`❌ [${requestId}] ERROR GENERAL EN /afip/facturar`);
    console.error(`📛 [${requestId}] Message:`, err?.message);
    console.error(`📛 [${requestId}] Name:`, err?.name);
    console.error(`📛 [${requestId}] Code:`, err?.code);
    console.error(`📛 [${requestId}] Stack:`, err?.stack);

    if (err?.response) {
      console.error(`🌐 [${requestId}] Error response status:`, err.response.status);
      console.error(`🌐 [${requestId}] Error response data:`, err.response.data);
      console.error(`🌐 [${requestId}] Error response headers:`, err.response.headers);
    }

    if (err?.config) {
      console.error(`🌐 [${requestId}] Error axios config:`, {
        method: err.config.method,
        url: err.config.url,
        baseURL: err.config.baseURL,
        timeout: err.config.timeout,
      });
    }

    if (err?.cause) {
      console.error(`🧨 [${requestId}] Cause:`, err.cause);
    }

    console.error(`🧾 [${requestId}] Body que causó error:`, JSON.stringify(req.body, null, 2));
    console.error(`🧾 [${requestId}] saleId:`, saleId);

    if (isAfipUnavailable(err)) {
      console.warn(`🟨 [${requestId}] Detectado AFIP_UNAVAILABLE. Marcando venta como PENDING_AFIP...`);

      const nextRetryAt = new Date(Date.now() + 5 * 60 * 1000);

      try {
        await prisma.sale.update({
          where: { id: saleId },
          data: {
            invoiceStatus: "PENDING_AFIP",
            afipLastError: "AFIP_UNAVAILABLE",
            nextRetryAt,
            retryCount: { increment: 1 },
            afipPayloadJson: req.body,
          },
        });

        console.log(`✅ [${requestId}] Venta marcada como PENDING_AFIP`, {
          saleId,
          nextRetryAt,
        });
      } catch (updateErr: any) {
        console.error(`❌ [${requestId}] No se pudo marcar PENDING_AFIP`);
        console.error(`📛 [${requestId}] updateErr message:`, updateErr?.message);
        console.error(`📛 [${requestId}] updateErr stack:`, updateErr?.stack);
      }

      console.log(`🟨 [${requestId}] Respondiendo 202 PENDING_AFIP`);
      console.log(`🟨 [${requestId}] FIN PENDING_AFIP en ${Date.now() - startedAt}ms`);
      console.log("============================================================");

      return res.status(202).json({
        ok: true,
        invoiceStatus: "PENDING_AFIP",
        nextRetryAt: nextRetryAt.toISOString(),
      });
    }

    const responsePayload = {
      ok: false,
      error: err?.message || "Error interno al facturar",
      detail: err?.response?.data ?? null,
      code: err?.code ?? null,
    };

    console.error(`🟥 [${requestId}] Respondiendo 500:`, responsePayload);
    console.error(`🟥 [${requestId}] FIN ERROR en ${Date.now() - startedAt}ms`);
    console.error("============================================================");

    return res.status(500).json(responsePayload);
  }
}
