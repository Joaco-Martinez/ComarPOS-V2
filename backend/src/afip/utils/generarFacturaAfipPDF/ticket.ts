/**
 * Construccion del payload de ticket y envio al POS local.
 * Extraidos de generarFacturaAfipPDF.ts (modularizacion, doc seccion 4).
 */
import axios from "axios";
import { POS_LOCAL_URL, POS_LOCAL_TOKEN, Product } from "./types";
import { getReceiptType, getLetraComprobante } from "./labels";
import {
  formatDateTimeTicket,
  formatCaeDate,
  formatPointOfSale,
  formatCbteNumber,
  numberOrZero,
} from "./format";

export function buildTicketPayload({
  tipoComprobante,
  puntoVenta,
  numero,
  fechaEmision,
  nombreCliente,
  total,
  metodoPago,
  cae,
  caeVto,
  products,
  cuit,
  razonSocial,
  direccion,
  documentoCliente,
  telefonoCliente,
  qrUrl,
}: {
  tipoComprobante: number;
  puntoVenta: number;
  numero: number;
  fechaEmision: Date;
  nombreCliente: string;
  total: number;
  metodoPago: string;
  cae: string;
  caeVto: Date;
  products?: Product[];
  cuit: string;
  razonSocial: string;
  direccion: string;
  documentoCliente?: string | number;
  telefonoCliente?: string;
  qrUrl?: string | null;
}) {
  const items = (products ?? []).map((product) => {
    const quantity = numberOrZero(product.quantity);

    const quantityKg =
      product.quantityKg !== null && product.quantityKg !== undefined
        ? numberOrZero(product.quantityKg)
        : undefined;

    const price = numberOrZero(product.price);

    const subtotal =
      product.subtotal !== undefined && product.subtotal !== null
        ? numberOrZero(product.subtotal)
        : quantityKg !== undefined && quantityKg > 0
        ? quantityKg * price
        : quantity * price;

    return {
      name: product.name,
      quantity,
      ...(quantityKg !== undefined ? { quantityKg } : {}),
      price,
      subtotal,
    };
  });

  const subtotal = items.reduce((acc, item) => acc + numberOrZero(item.subtotal), 0);
  const discount = subtotal > total ? subtotal - total : 0;

  return {
    saleId: `FAC-${formatCbteNumber(numero)}`,
    receiptType: getReceiptType(tipoComprobante),
    paymentMethod: metodoPago,
    createdAt: formatDateTimeTicket(fechaEmision),

    business: {
      name: process.env.BUSINESS_NAME ?? razonSocial ?? "GRUPO VJ",
      subtitle: process.env.BUSINESS_SUBTITLE ?? "ComarPOS",
      cuit: process.env.BUSINESS_CUIT ?? cuit,
      address: process.env.BUSINESS_ADDRESS ?? direccion,
      phone: process.env.BUSINESS_PHONE ?? "Teléfono Grupo VJ",
    },

    client: {
      name: nombreCliente || "Consumidor Final",
      dni: documentoCliente ? String(documentoCliente) : "",
      phone: telefonoCliente ?? "",
    },

    items,

    subtotal,
    discount,
    total: numberOrZero(total),

    afip: {
      invoiceLetter: getLetraComprobante(tipoComprobante),
      pointOfSale: formatPointOfSale(puntoVenta),
      cbteNumber: formatCbteNumber(numero),
      cae,
      caeExpiresAt: formatCaeDate(caeVto),
      qrUrl: qrUrl ?? "",
    },

    footer: "Gracias por su compra",
  };
}

export async function enviarTicketAlPOSLocal(payload: any) {
  if (!POS_LOCAL_URL) {
    console.warn("⚠️ POS_LOCAL_URL no configurado, no se imprimió localmente");
    return;
  }

  const url = `${POS_LOCAL_URL.replace(/\/$/, "")}/print/ticket`;

  console.log("🖨️ Enviando ticket JSON al POS local:", url);
  console.log("📦 Payload enviado:", JSON.stringify(payload, null, 2));

  await axios.post(url, payload, {
    headers: {
      "Content-Type": "application/json",
      ...(POS_LOCAL_TOKEN ? { "x-pos-token": POS_LOCAL_TOKEN } : {}),
    },
    timeout: 60000,
  });

  console.log("✅ Ticket enviado correctamente al POS local");
}
