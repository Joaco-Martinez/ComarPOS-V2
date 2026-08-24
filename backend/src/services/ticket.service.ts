import axios from "axios";
import prisma from "../prisma";
import { tenantScope } from "../utils/tenantScope";
import { printboxService } from "./printbox";
import { arcaConfigService } from "./arcaConfig.service";
import { notificationService } from "./notification.service";
import { cbteTipoLabel } from "../afip/ivaCondition";
import { buildNumeroComprobante } from "./facturaPdfGenerator/format";

function numberOrZero(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function stringOrEmpty(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function formatFechaTicket(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatFechaCorta(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function getNombreCliente(client: any) {
  const nombre = client?.nombre?.trim() ?? "";
  const apellido = client?.apellido?.trim() ?? "";
  const fullName = `${nombre} ${apellido}`.trim();

  return fullName || "Consumidor Final";
}

function getMetodoPago(sale: any) {
  if (sale.payments && sale.payments.length > 0) {
    return sale.payments
      .map(
        (p: any) =>
          `${p.method}: ${Number(p.amount).toLocaleString("es-AR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`
      )
      .join(" | ");
  }

  return sale.paymentMethod || "EFECTIVO";
}

function getSellerName(sale: any) {
  return (
    sale.user?.name ||
    sale.seller?.name ||
    sale.employee?.name ||
    sale.createdBy?.name ||
    sale.userName ||
    ""
  );
}

function getSellerEmail(sale: any) {
  return (
    sale.user?.email ||
    sale.seller?.email ||
    sale.employee?.email ||
    sale.createdBy?.email ||
    ""
  );
}

function getClientPhone(client: any) {
  return (
    client?.telefono ||
    client?.phone ||
    client?.celular ||
    client?.mobile ||
    ""
  );
}

function getShippingPayload(sale: any) {
  const client = sale.client || {};

  const addressStreet =
    client.addressStreet ||
    client.street ||
    client.calle ||
    sale.addressStreet ||
    "";

  const addressNumber =
    client.addressNumber ||
    client.number ||
    client.numero ||
    sale.addressNumber ||
    "";

  const addressFloor =
    client.addressFloor ||
    client.floor ||
    client.piso ||
    sale.addressFloor ||
    "";

  const addressApartment =
    client.addressApartment ||
    client.apartment ||
    client.depto ||
    sale.addressApartment ||
    "";

  const city =
    client.city ||
    client.locality ||
    client.localidad ||
    sale.city ||
    sale.locality ||
    "";

  const province =
    client.province ||
    client.state ||
    client.provincia ||
    sale.province ||
    sale.state ||
    "";

  const postalCode =
    client.postalCode ||
    client.zipCode ||
    client.cp ||
    sale.postalCode ||
    sale.zipCode ||
    "";

  const fullAddress =
    client.fullAddress ||
    client.address ||
    sale.fullAddress ||
    sale.address ||
    "";

  const method =
    sale.deliveryMethod ||
    sale.shippingMethod ||
    sale.delivery?.method ||
    sale.shipping?.method ||
    "";

  const status =
    sale.deliveryStatus ||
    sale.shippingStatus ||
    sale.delivery?.status ||
    sale.shipping?.status ||
    "";

  const notes =
    sale.deliveryNotes ||
    sale.shippingNotes ||
    sale.notes ||
    sale.delivery?.notes ||
    sale.shipping?.notes ||
    "";

  const receiverName =
    sale.receiverName ||
    sale.recipientName ||
    sale.delivery?.receiverName ||
    sale.shipping?.receiverName ||
    getNombreCliente(client);

  const receiverPhone =
    sale.receiverPhone ||
    sale.recipientPhone ||
    sale.delivery?.receiverPhone ||
    sale.shipping?.receiverPhone ||
    getClientPhone(client);

  const hasShippingData =
    method ||
    status ||
    fullAddress ||
    addressStreet ||
    addressNumber ||
    addressFloor ||
    addressApartment ||
    city ||
    province ||
    postalCode ||
    notes ||
    receiverName ||
    receiverPhone;

  if (!hasShippingData) return undefined;

  return {
    method: stringOrEmpty(method),
    status: stringOrEmpty(status),
    receiverName: stringOrEmpty(receiverName),
    receiverPhone: stringOrEmpty(receiverPhone),
    fullAddress: stringOrEmpty(fullAddress),
    street: stringOrEmpty(addressStreet),
    number: stringOrEmpty(addressNumber),
    floor: stringOrEmpty(addressFloor),
    apartment: stringOrEmpty(addressApartment),
    city: stringOrEmpty(city),
    province: stringOrEmpty(province),
    postalCode: stringOrEmpty(postalCode),
    notes: stringOrEmpty(notes),
  };
}

// Precio de cada item ya incluye IVA (precio de venta final) -- "destapa"
// el neto de cada uno con su propia alicuota y agrupa el IVA por tasa.
// Mismo criterio que generarCotizacionPDF/sections.ts (Subtotal sin IVA →
// IVA por tasa → Total), para que no diverjan entre el PDF y el ticket.
function buildIvaBreakdown(items: any[]) {
  const ivaByRate: Record<number, number> = {};
  let netoSum = 0;

  for (const item of items) {
    const rate = item.ivaRate ?? item.product?.ivaRate ?? 21;
    const itemSubtotal = numberOrZero(item.subtotal);
    const neto = itemSubtotal / (1 + rate / 100);
    const iva = itemSubtotal - neto;
    ivaByRate[rate] = (ivaByRate[rate] ?? 0) + iva;
    netoSum += neto;
  }

  const ivaBreakdown = Object.entries(ivaByRate)
    .filter(([, amount]) => amount > 0.01)
    .map(([rate, amount]) => ({ rate: Number(rate), amount }));

  return { netoSum, ivaBreakdown };
}

function buildTicketPayload(sale: any, tenant: any, arcaConfig: any) {
  const subtotal = numberOrZero(sale.subtotal);
  const total = numberOrZero(sale.total);
  const discount = subtotal > total ? subtotal - total : 0;

  const sellerName = getSellerName(sale);
  const sellerEmail = getSellerEmail(sale);
  const shipping = getShippingPayload(sale);
  const { netoSum, ivaBreakdown } = buildIvaBreakdown(sale.items);

  // Solo hay QR/CAE si la venta esta REALMENTE facturada por AFIP (no
  // alcanza con sale.isInvoiced -- eso puede estar en true con la emision
  // todavia pendiente/en cola de reintento, ver invoiceStatus en
  // backend/CLAUDE.md). El ticket no fiscal no lleva nada de esto.
  const invoiceAfip = sale.invoiceAfip;
  const invoice =
    invoiceAfip?.cae
      ? {
          letra: cbteTipoLabel(invoiceAfip.tipoComprobante),
          // Codigo AFIP del tipo de comprobante (6 = Factura B, etc), tal
          // cual pedido en el formato de ticket de referencia ("Cod. 006").
          codigo: String(invoiceAfip.tipoComprobante).padStart(3, "0"),
          numero: buildNumeroComprobante(invoiceAfip.puntoVenta, invoiceAfip.numero),
          cae: invoiceAfip.cae,
          caeVto: invoiceAfip.caeVto ? formatFechaCorta(invoiceAfip.caeVto) : "",
          qrUrl: invoiceAfip.urlQR || "",
        }
      : null;

  return {
    saleId: `TICKET-${String(sale.id).slice(0, 8).toUpperCase()}`,
    receiptType: invoice ? `FACTURA ${invoice.letra}` : "COMPROBANTE NO FISCAL",
    paymentMethod: getMetodoPago(sale),
    // Version estructurada de paymentMethod (que ya viene como un string
    // armado tipo "EFECTIVO: 2.600,00 | TRANSFERENCIA: 400,00") -- el
    // firmware la necesita separada por metodo/monto para imprimir cada
    // linea de pago prolija (ver printTicketFromPayload en main.cpp),
    // parsear ese string de vuelta hubiera sido fragil.
    payments:
      sale.payments && sale.payments.length > 0
        ? sale.payments.map((p: any) => ({ method: String(p.method), amount: numberOrZero(p.amount) }))
        : [{ method: sale.paymentMethod || "EFECTIVO", amount: total }],
    createdAt: formatFechaTicket(sale.createdAt ?? new Date()),

    sellerName,
    userName: sellerName,

    seller: {
      id: sale.user?.id || sale.userId || "",
      name: sellerName,
      email: sellerEmail,
    },

    user: {
      id: sale.user?.id || sale.userId || "",
      name: sellerName,
      email: sellerEmail,
    },

    // Datos por-tenant (backend/CLAUDE.md: hoy solo grupo-vj es real y no
    // tiene estos campos cargados, por eso el fallback a las BUSINESS_*
    // historicas -- una vez que un tenant carga sus propios datos en el
    // panel, esos pisan al env var). El logoUrl viaja aparte: el printbox
    // lo cachea en flash, no se manda de nuevo en cada ticket.
    business: {
      name: tenant?.ticketBusinessName || tenant?.name || process.env.BUSINESS_NAME || "Mi Negocio",
      cuit: tenant?.ticketCuit || process.env.BUSINESS_CUIT || "",
      address: tenant?.ticketAddress || process.env.BUSINESS_ADDRESS || "",
      phone: tenant?.ticketPhone || process.env.BUSINESS_PHONE || "",
      // Estos 3 solo existen en ArcaConfig (no hay campo espejo en Tenant,
      // a diferencia de name/cuit/address/phone) -- sin ArcaConfig
      // configurado, quedan vacios y el ticket simplemente no imprime esas
      // lineas (ver strlen() checks en printTicketFromPayload).
      ivaCondition: arcaConfig?.ivaCondition || "",
      iibb: arcaConfig?.iibb || "",
      activityStart: arcaConfig?.activityStart ? formatFechaCorta(arcaConfig.activityStart) : "",
      logoUrl: tenant?.logoUrl || null,
      // Bitmap ESC/POS ya listo para imprimir (ver logoRaster.service.ts).
      // Solo viaja si el tenant subió un logo -- el printbox lo cachea y
      // no lo vuelve a pedir en cada ticket (ver printbox/README.md).
      logoEscposUrl:
        tenant?.id && process.env.API_PUBLIC_URL
          ? `${process.env.API_PUBLIC_URL.replace(/\/$/, "")}/uploads/logo/${tenant.id}/escpos`
          : null,
    },

    client: {
      name: getNombreCliente(sale.client),
      dni: sale.client?.dni ? String(sale.client.dni) : "",
      // El Client no tiene un campo "cuit" separado -- el mismo dni
      // guarda un CUIT/CUIL cuando el cliente es un responsable inscripto
      // (11 digitos, mismo criterio de deteccion que ya usa AFIP al
      // facturar, ver detectarTipoDocumento en afipMappers.ts). El ticket
      // usa esto para el label ("CUIT Cliente" vs "DNI Cliente") en
      // Factura A, donde el CUIT del comprador es obligatorio.
      docLabel: /^\d{11}$/.test(String(sale.client?.dni ?? "").replace(/\D/g, "")) ? "CUIT" : sale.client?.dni ? "DNI" : "",
      phone: getClientPhone(sale.client) ? String(getClientPhone(sale.client)) : "",

      addressStreet: stringOrEmpty(sale.client?.addressStreet),
      addressNumber: stringOrEmpty(sale.client?.addressNumber),
      addressFloor: stringOrEmpty(sale.client?.addressFloor),
      addressApartment: stringOrEmpty(sale.client?.addressApartment),
      city: stringOrEmpty(sale.client?.city || sale.client?.locality),
      province: stringOrEmpty(sale.client?.province || sale.client?.state),
      postalCode: stringOrEmpty(sale.client?.postalCode || sale.client?.zipCode),
      fullAddress: stringOrEmpty(sale.client?.fullAddress || sale.client?.address),
    },

    shipping,

    delivery: shipping,

    items: sale.items.map((item: any) => {
      const quantity = numberOrZero(item.quantity);

      const quantityKg =
        item.quantityKg !== null && item.quantityKg !== undefined
          ? numberOrZero(item.quantityKg)
          : undefined;

      const price = numberOrZero(item.price);

      const subtotalItem =
        item.subtotal !== null && item.subtotal !== undefined
          ? numberOrZero(item.subtotal)
          : quantityKg !== undefined && quantityKg > 0
          ? quantityKg * price
          : quantity * price;

      return {
        name: item.product?.name ?? item.productNameSnapshot ?? "Producto",
        quantity,
        ...(quantityKg !== undefined ? { quantityKg } : {}),
        price,
        subtotal: subtotalItem,
      };
    }),

    subtotal,
    discount,
    total,
    netoSum,
    ivaBreakdown,
    invoice,

    footer: invoice ? "Gracias por su compra" : "Comprobante no valido como factura",
  };
}

async function enviarTicketAlPOSLocal(payload: any) {
  const POS_LOCAL_URL = process.env.POS_LOCAL_URL;
  const POS_LOCAL_TOKEN = process.env.POS_LOCAL_TOKEN;

  if (!POS_LOCAL_URL) {
    throw new Error("POS_LOCAL_URL no está configurado");
  }

  const url = `${POS_LOCAL_URL.replace(/\/$/, "")}/print/ticket`;

  const response = await axios.post(url, payload, {
    timeout: 60000,
    headers: {
      "Content-Type": "application/json",
      ...(POS_LOCAL_TOKEN ? { "x-pos-token": POS_LOCAL_TOKEN } : {}),
    },
  });

  return response.data;
}

// No re-notifica si ya hay un aviso de este tipo sin leer (mismo criterio
// que notificationService.checkOnboarding) -- si no, cada venta sin
// impresora configurada dispara una notificacion nueva.
async function notifyMissingPrinter(tenantId: string) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", tenantId },
    select: { id: true },
  });
  if (!admins.length) return;

  const alreadyNotified = await prisma.notification.findFirst({
    where: {
      tenantId,
      type: "PRINTER_NOT_CONFIGURED",
      isRead: false,
      userId: { in: admins.map((u) => u.id) },
    },
  });
  if (alreadyNotified) return;

  await notificationService.broadcast({
    userIds: admins.map((u) => u.id),
    type: "PRINTER_NOT_CONFIGURED",
    title: "No tenés ninguna impresora conectada",
    body: "Para imprimir tickets necesitás una PrintBox. Escribinos y coordinamos el envío.",
    data: { href: "/ayuda" },
  });
}

export const ticketService = {
  /**
   * deviceId es opcional: si el tenant ya migró a printbox y solo tiene una
   * caja, se resuelve solo. Si el tenant no tiene ningún PrintboxDevice
   * pareado, el bridge HTTP viejo (POS_LOCAL_URL) SOLO se usa si
   * tenant.legacyLocalPrinterEnabled -- hoy nada mas grupo-vj, que es quien
   * realmente tiene ese bridge armado en su red. Para cualquier tenant
   * nuevo sin PrintboxDevice, no se imprime nada (no tiene sentido pegarle
   * al bridge de otro negocio) y en cambio se le avisa, in-app, que puede
   * pedir su propia PrintBox -- ver notifyMissingPrinter arriba.
   */
  async printSaleTicket(saleId: string, deviceId?: string) {
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, ...tenantScope() },
      include: {
        tenant: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        client: true,
        items: {
          include: {
            product: true,
          },
        },
        payments: true,
        invoiceAfip: true,
      },
    });

    if (!sale) {
      throw new Error("Venta no encontrada");
    }

    // getConfig() usa tenantScope() (currentTenantId() de la request) --
    // no hace falta pasarle el tenantId de la venta a mano.
    const arcaConfig = await arcaConfigService.getConfig().catch(() => null);
    const payload = buildTicketPayload(sale, sale.tenant, arcaConfig);

    if (sale.tenantId) {
      const device = deviceId
        ? await prisma.printboxDevice.findFirst({
            where: { id: deviceId, tenantId: sale.tenantId, status: "ACTIVE" },
          })
        : await printboxService.resolveDefaultDevice(sale.tenantId);

      if (device) {
        const job = await printboxService.publishTicket({
          tenantId: sale.tenantId,
          deviceId: device.id,
          saleId: sale.id,
          payload,
        });

        return { payload, printJobId: job.id, via: "printbox" };
      }

      if (!sale.tenant?.legacyLocalPrinterEnabled) {
        await notifyMissingPrinter(sale.tenantId);
        const err: any = new Error(
          "No tenés ninguna impresora conectada. Te avisamos dentro del sistema para que puedas pedir tu PrintBox."
        );
        err.code = "PRINTER_NOT_CONFIGURED";
        throw err;
      }
    }

    const posResponse = await enviarTicketAlPOSLocal(payload);

    return {
      payload,
      posResponse,
      via: "pos-local",
    };
  },
};