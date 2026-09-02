/**
 * Pedidos de la tienda online publica (doc "tienda online por tenant").
 * create()/getPublicByToken()/uploadTransferProof() corren dentro del
 * contexto de tenant que ya resolvio storefrontTenantMiddleware
 * (:tenantSlug en la URL) - el resto (getAll/getById/confirmTransfer/
 * rejectTransfer/convertToSale) corre autenticado, tenant del JWT como
 * siempre.
 *
 * Sin reserva de stock (decision v1): se valida disponibilidad acá Y de
 * nuevo en convertToSale() - riesgo de sobreventa aceptado y documentado en
 * el plan, no una omision.
 */
import fs from "fs";
import prisma from "../prisma";
import { CategoryClient, OrderPaymentMethod, OrderStatus, PaymentMethod } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { AppError } from "../utils/asyncHandler";
import { resolvePrice, getProductStock } from "./catalog.service";
import { storefrontConfigService } from "./storefrontConfig.service";
import { saleService } from "./sale.service";
import { tenantMpConfigService } from "./tenantMpConfig.service";
import { storefrontMercadoPagoService } from "./storefrontMercadoPago.service";
import { whatsappService } from "./whatsapp.service";
import cloudinary from "../config/cloudinary";

const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
const API_PUBLIC_URL = (process.env.API_PUBLIC_URL || "http://localhost:5000").replace(/\/$/, "");

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function safeDeleteLocalFile(path?: string) {
  if (path && fs.existsSync(path)) fs.unlinkSync(path);
}

const PRODUCT_INCLUDE_FOR_STOCK = {
  stock: true,
  components: { include: { component: { include: { stock: true } } } },
} as const;

async function resolveAndValidateItems(
  tenantId: string,
  items: { productId: string; quantity?: number; quantityKg?: number }[]
) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError("EMPTY_CART", "El pedido debe tener al menos un producto", 400);
  }

  const productIds = Array.from(new Set(items.map((i) => i.productId)));

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, tenantId, isActive: true },
    include: PRODUCT_INCLUDE_FOR_STOCK,
  });

  const byId = new Map(products.map((p) => [p.id, p]));

  return items.map((item) => {
    const product = byId.get(item.productId);
    if (!product) {
      throw new AppError("PRODUCT_NOT_FOUND", "Uno de los productos ya no está disponible", 400);
    }

    const isKg = product.saleUnit === "KG";
    const qty = isKg ? Number(item.quantityKg) : Number(item.quantity);

    if (!Number.isFinite(qty) || qty <= 0) {
      throw new AppError("INVALID_QUANTITY", `Cantidad inválida para "${product.name}"`, 400);
    }

    if (!product.isService && !product.unlimitedStock) {
      const stock = getProductStock(product);
      const available = isKg ? stock.availableKg : stock.availableQuantity;

      if (qty > available) {
        throw new AppError(
          "OUT_OF_STOCK",
          `No hay stock suficiente de "${product.name}" (disponible: ${stock.stockLabel})`,
          409
        );
      }
    }

    const pricing = resolvePrice(product, CategoryClient.Price);
    const unitPrice = pricing.price;
    const subtotal = round2(unitPrice * qty);

    return {
      productId: product.id,
      quantity: isKg ? null : Math.trunc(qty),
      quantityKg: isKg ? qty : null,
      unitPrice,
      subtotal,
      productNameSnapshot: product.name,
      productSkuSnapshot: product.sku,
    };
  });
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Mensaje pre-armado para el pedido "Coordinar por WhatsApp" (doc "tienda
 * online - checkout por WhatsApp"): el pedido ya quedo creado en PENDING con
 * el detalle real (ver create() abajo) - este mensaje es solo para que el
 * negocio vea de entrada que quiere el comprador sin tener que abrir el
 * panel admin primero. Distinto de buildWhatsappMessage en catalog.service.ts
 * (flujo legado sobre una Sale ya creada, no reusado aca a proposito: los
 * shapes de item difieren).
 */
function buildWhatsappOrderMessage(params: {
  order: { publicToken: string; customerName: string; total: number; customerNotes?: string | null };
  items: { productNameSnapshot: string; quantity: number | null; quantityKg: number | null; subtotal: number }[];
  storeUrl: string;
}) {
  const { order, items, storeUrl } = params;

  const lines = items.map((item) => {
    const qty = item.quantityKg != null ? `${item.quantityKg} kg` : `x${item.quantity}`;
    return `- ${item.productNameSnapshot} ${qty} — ${formatMoney(item.subtotal)}`;
  });

  return [
    `Hola! Quiero coordinar este pedido de la tienda online:`,
    "",
    ...lines,
    "",
    `Total: ${formatMoney(order.total)}`,
    `A nombre de: ${order.customerName}`,
    order.customerNotes ? `Notas: ${order.customerNotes}` : null,
    "",
    `Seguimiento: ${storeUrl}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export const orderService = {
  async create(input: {
    items: { productId: string; quantity?: number; quantityKg?: number }[];
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    clientId?: string;
    userId?: string;
    paymentMethod: OrderPaymentMethod;
    customerNotes?: string;
  }) {
    const tenantId = currentTenantId();
    if (!tenantId) throw new AppError("TENANT_NOT_RESOLVED", "No se pudo resolver la tienda", 400);

    // Cuenta obligatoria para comprar (doc "tienda online - checkout por
    // WhatsApp"): antes se aceptaba invitado + cuenta opcional, ahora toda
    // venta necesita un userId real (CLIENTE logueado de ESTE tenant - ver
    // optionalStorefrontAuth, que ya filtra tokens de otro tenant). El
    // controller resuelve input.userId desde el JWT, nunca desde el body.
    if (!input.userId) {
      throw new AppError("LOGIN_REQUIRED", "Necesitás una cuenta para completar la compra", 401);
    }

    if (!input.customerName?.trim()) {
      throw new AppError("CUSTOMER_NAME_REQUIRED", "Falta el nombre del comprador", 400);
    }

    if (input.paymentMethod === OrderPaymentMethod.WHATSAPP) {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { ticketPhone: true } });
      if (!whatsappService.normalizePhone(tenant?.ticketPhone)) {
        throw new AppError(
          "WHATSAPP_NOT_CONFIGURED",
          "Esta tienda todavía no configuró un WhatsApp de contacto",
          400
        );
      }
    }

    let mpAccessToken: string | null = null;

    if (input.paymentMethod === OrderPaymentMethod.MERCADOPAGO) {
      mpAccessToken = await tenantMpConfigService.getActiveAccessToken(tenantId);

      if (!mpAccessToken) {
        throw new AppError(
          "MP_NOT_AVAILABLE",
          "El pago con Mercado Pago todavía no está disponible en esta tienda",
          400
        );
      }
    }

    const config = await storefrontConfigService.ensureConfig(tenantId);

    if (!config.businessLocationId) {
      throw new AppError(
        "STORE_LOCATION_NOT_SET",
        "Esta tienda todavía no tiene una sucursal configurada, contactá al negocio",
        400
      );
    }

    // La tienda online es solo retiro en el local (sin envío a domicilio,
    // ver doc de remocion del modulo "envio").
    if (!config.pickupEnabled) {
      throw new AppError("PICKUP_NOT_AVAILABLE", "Esta tienda no ofrece retiro en el local", 400);
    }

    const resolvedItems = await resolveAndValidateItems(tenantId, input.items);
    const subtotal = round2(resolvedItems.reduce((acc, i) => acc + i.subtotal, 0));
    const total = subtotal;

    // EFECTIVO: se confirma directo (se paga en persona al retirar/recibir).
    // TRANSFERENCIA/MERCADOPAGO: queda PENDING hasta confirmar el pago
    // (comprobante verificado a mano, o el webhook de MP). WHATSAPP: queda
    // PENDING tambien - es una venta pendiente que el negocio coordina y
    // confirma a mano por chat (ver convertToSale), no hay pago online.
    const initialStatus =
      input.paymentMethod === OrderPaymentMethod.EFECTIVO ? OrderStatus.CONFIRMED : OrderStatus.PENDING;

    const order = await prisma.order.create({
      data: {
        tenantId,
        status: initialStatus,
        clientId: input.clientId ?? null,
        userId: input.userId ?? null,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone?.trim() || null,
        customerEmail: input.customerEmail?.trim() || null,
        subtotal,
        total,
        businessLocationId: config.businessLocationId,
        paymentMethod: input.paymentMethod,
        customerNotes: input.customerNotes?.trim() || null,
        items: { create: resolvedItems },
      },
      include: { items: true },
    });

    if (input.paymentMethod === OrderPaymentMethod.MERCADOPAGO && mpAccessToken) {
      const backUrl = `${FRONTEND_URL}/tienda/${(await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }))?.slug}/pedido/${order.publicToken}`;

      try {
        // quantity:1 + unitPrice:subtotal por línea (en vez de
        // quantity/unitPrice reales) a propósito: los items con
        // quantityKg fraccionario (ej. 2.5kg) redondeados como "cantidad"
        // de MP desalinearían el total cobrado del total real del
        // pedido. Así el total de la preferencia siempre coincide exacto
        // con `order.total`, sea cual sea la unidad de venta.
        const preferenceItems = resolvedItems.map((item) => ({
          title: item.productNameSnapshot || "Producto",
          quantity: 1,
          unitPrice: item.subtotal,
        }));

        const preference = await storefrontMercadoPagoService.createPreference({
          accessToken: mpAccessToken,
          orderId: order.id,
          items: preferenceItems,
          payerEmail: input.customerEmail || undefined,
          backUrl,
          notificationUrl: `${API_PUBLIC_URL}/tienda/webhooks/mercadopago/${tenantId}`,
        });

        const updated = await prisma.order.update({
          where: { id: order.id },
          data: { mpPreferenceId: preference.id },
          include: { items: true },
        });

        return { ...updated, mpInitPoint: preference.init_point || preference.sandbox_init_point || null, whatsappUrl: null };
      } catch (err) {
        // El pedido ya existe (no perder el carrito del comprador) pero sin
        // link de pago - el frontend puede ofrecer reintentar o cambiar de
        // metodo de pago.
        console.error("Error creando preferencia de Mercado Pago:", err);
        return { ...order, mpInitPoint: null, whatsappUrl: null };
      }
    }

    if (input.paymentMethod === OrderPaymentMethod.WHATSAPP) {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true, ticketPhone: true } });
      const phone = whatsappService.normalizePhone(tenant?.ticketPhone);
      const storeUrl = `${FRONTEND_URL}/tienda/${tenant?.slug}/pedido/${order.publicToken}`;

      const message = buildWhatsappOrderMessage({
        order: { publicToken: order.publicToken, customerName: order.customerName, total: order.total, customerNotes: order.customerNotes },
        items: resolvedItems,
        storeUrl,
      });

      const whatsappUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null;

      return { ...order, mpInitPoint: null, whatsappUrl };
    }

    return { ...order, mpInitPoint: null, whatsappUrl: null };
  },

  async getPublicByToken(publicToken: string) {
    return prisma.order.findFirst({
      where: { publicToken, ...tenantScope() },
      include: {
        items: { include: { product: { select: { name: true, imageUrl: true, saleUnit: true } } } },
      },
    });
  },

  /**
   * Webhook de Mercado Pago (doc "tienda online por tenant"). El tenant sale
   * del segmento :tenantId de la URL (POST /tienda/webhooks/mercadopago/:tenantId,
   * fijado como notification_url al crear la preferencia arriba) - no de
   * tenantScope()/AsyncLocalStorage, porque esto no pasa por
   * storefrontTenantMiddleware. Nunca confía en el body del webhook: siempre
   * re-consulta el pago a la API de MP con el access token de ESE tenant
   * antes de tocar nada, para no depender de validar una firma con un
   * secret que ademas seria distinto por tenant (mismo motivo que el plan
   * documento como desviacion del patron de billing/mercadoPago.service.ts).
   */
  async handleMpWebhook(tenantId: string, paymentId: string) {
    const accessToken = await tenantMpConfigService.getActiveAccessToken(tenantId);
    if (!accessToken) return;

    let payment;
    try {
      payment = await storefrontMercadoPagoService.getPayment(accessToken, paymentId);
    } catch (err) {
      console.error(`Error consultando pago de MP ${paymentId} para tenant ${tenantId}:`, err);
      return;
    }

    const orderId = payment.external_reference;
    if (!orderId) return;

    const order = await prisma.order.findFirst({ where: { id: orderId, tenantId } });
    if (!order || order.paymentMethod !== OrderPaymentMethod.MERCADOPAGO) return;

    // Ya resuelto (convertido en venta o cancelado) - no pisar un estado
    // final por una notificacion tardía/duplicada.
    if (order.status === OrderStatus.CONVERTED || order.status === OrderStatus.CANCELLED) return;

    if (payment.status === "approved") {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.CONFIRMED, paymentStatus: "APPROVED", mpPaymentId: String(payment.id) },
      });
    } else if (payment.status === "rejected" || payment.status === "cancelled") {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CANCELLED,
          paymentStatus: "REJECTED",
          cancelledAt: new Date(),
          cancelReason: `Mercado Pago: ${payment.status_detail || payment.status}`,
          mpPaymentId: String(payment.id),
        },
      });
    } else {
      // pending / in_process / etc - solo guardamos la referencia, el
      // pedido sigue esperando.
      await prisma.order.update({ where: { id: order.id }, data: { mpPaymentId: String(payment.id) } });
    }
  },

  async uploadTransferProof(publicToken: string, file?: Express.Multer.File) {
    if (!file) {
      throw new AppError("FILE_REQUIRED", "Falta el comprobante", 400);
    }

    const order = await prisma.order.findFirst({ where: { publicToken, ...tenantScope() } });

    if (!order) {
      safeDeleteLocalFile(file.path);
      throw new AppError("ORDER_NOT_FOUND", "Pedido no encontrado", 404);
    }

    if (order.paymentMethod !== OrderPaymentMethod.TRANSFERENCIA) {
      safeDeleteLocalFile(file.path);
      throw new AppError("NOT_TRANSFER_ORDER", "Este pedido no es por transferencia", 400);
    }

    if (order.status !== OrderStatus.PENDING) {
      safeDeleteLocalFile(file.path);
      throw new AppError("ORDER_NOT_PENDING", "Este pedido ya no admite comprobante", 400);
    }

    let newProofId: string | undefined;

    try {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: "comarpos/order-transfer-proofs",
        resource_type: "auto",
      });

      newProofId = result.public_id;
      safeDeleteLocalFile(file.path);

      if (order.transferProofId) {
        await cloudinary.uploader.destroy(order.transferProofId).catch(() => undefined);
      }

      return await prisma.order.update({
        where: { id: order.id },
        data: {
          transferProofUrl: result.secure_url,
          transferProofId: result.public_id,
          status: OrderStatus.PAYMENT_PENDING_REVIEW,
        },
      });
    } catch (err) {
      safeDeleteLocalFile(file.path);
      if (newProofId) await cloudinary.uploader.destroy(newProofId).catch(() => undefined);
      throw err;
    }
  },

  // --- Admin (autenticado, tenant del JWT) ---

  async getAll(filters?: { status?: string }) {
    return prisma.order.findMany({
      where: {
        ...tenantScope(),
        ...(filters?.status ? { status: filters.status as OrderStatus } : {}),
      },
      include: { items: true, client: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  },

  async getById(id: string) {
    return prisma.order.findFirst({
      where: { id, ...tenantScope() },
      include: {
        items: { include: { product: { select: { name: true, imageUrl: true, saleUnit: true } } } },
        client: true,
        sale: { select: { id: true, total: true, status: true } },
      },
    });
  },

  async confirmTransfer(id: string, userId: string) {
    const order = await prisma.order.findFirst({ where: { id, ...tenantScope() } });
    if (!order) return { statusCode: 404, message: "Pedido no encontrado" };
    if (order.paymentMethod !== OrderPaymentMethod.TRANSFERENCIA) {
      return { statusCode: 400, message: "Este pedido no es por transferencia" };
    }
    if (order.status === OrderStatus.CONFIRMED || order.status === OrderStatus.CONVERTED) {
      return { statusCode: 400, message: "Este pedido ya fue confirmado" };
    }

    return prisma.order.update({
      where: { id },
      data: {
        status: OrderStatus.CONFIRMED,
        transferVerifiedAt: new Date(),
        transferVerifiedByUserId: userId,
      },
    });
  },

  async rejectTransfer(id: string, reason: string | undefined, userId: string) {
    const order = await prisma.order.findFirst({ where: { id, ...tenantScope() } });
    if (!order) return { statusCode: 404, message: "Pedido no encontrado" };
    if (order.status === OrderStatus.CONVERTED) {
      return { statusCode: 400, message: "Este pedido ya fue convertido en venta" };
    }

    return prisma.order.update({
      where: { id },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: reason?.trim() || null,
        transferVerifiedAt: new Date(),
        transferVerifiedByUserId: userId,
      },
    });
  },

  async cancel(id: string, reason: string | undefined) {
    const order = await prisma.order.findFirst({ where: { id, ...tenantScope() } });
    if (!order) return { statusCode: 404, message: "Pedido no encontrado" };
    if (order.status === OrderStatus.CONVERTED) {
      return { statusCode: 400, message: "Este pedido ya fue convertido en venta" };
    }

    return prisma.order.update({
      where: { id },
      data: { status: OrderStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason?.trim() || null },
    });
  },

  async convertToSale(id: string, userId: string) {
    const order = await prisma.order.findFirst({
      where: { id, ...tenantScope() },
      include: { items: true },
    });

    if (!order) return { statusCode: 404, message: "Pedido no encontrado" };
    if (order.saleId) return { statusCode: 400, message: "Este pedido ya fue convertido en venta" };
    if (order.status !== OrderStatus.CONFIRMED) {
      return { statusCode: 400, message: "El pedido tiene que estar confirmado antes de convertirlo en venta" };
    }
    if (!order.businessLocationId) {
      return { statusCode: 400, message: "El pedido no tiene una sucursal de stock asignada" };
    }

    // Doble chequeo de stock (decision v1: sin reserva al crear el pedido).
    const productIds = order.items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, ...tenantScope() },
      include: PRODUCT_INCLUDE_FOR_STOCK,
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    for (const item of order.items) {
      const product = byId.get(item.productId);
      if (!product) {
        return { statusCode: 400, message: `El producto "${item.productNameSnapshot}" ya no existe` };
      }
      if (!product.isService && !product.unlimitedStock) {
        const isKg = item.quantityKg != null;
        const needed = isKg ? Number(item.quantityKg) : Number(item.quantity);
        const stock = getProductStock(product);
        const available = isKg ? stock.availableKg : stock.availableQuantity;

        if (needed > available) {
          return {
            statusCode: 409,
            message: `Ya no hay stock suficiente de "${item.productNameSnapshot}" para convertir este pedido`,
          };
        }
      }
    }

    const paymentMethodMap: Record<OrderPaymentMethod, PaymentMethod> = {
      EFECTIVO: PaymentMethod.EFECTIVO,
      TRANSFERENCIA: PaymentMethod.TRANSFERENCIA,
      MERCADOPAGO: PaymentMethod.QR_MERCADOPAGO,
      // El pago real se coordina por chat (efectivo/transferencia/etc. segun
      // lo que acuerden) - EFECTIVO como default razonable, igual que un
      // pedido EFECTIVO comun, ya que se termina de resolver en persona.
      WHATSAPP: PaymentMethod.EFECTIVO,
    };

    const items: any[] = order.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity ?? undefined,
      quantityKg: i.quantityKg ?? undefined,
      price: i.unitPrice,
      priceType: "MANUAL",
    }));

    const result = await saleService.create({
      userId,
      clientId: order.clientId ?? undefined,
      stockLocationId: order.businessLocationId,
      businessLocationId: order.businessLocationId,
      paymentMethod: paymentMethodMap[order.paymentMethod],
      receiptType: "TICKET" as any,
      status: "COMPLETED" as any,
      items,
    });

    const sale = result.sale;

    return prisma.order.update({
      where: { id: order.id },
      data: { saleId: sale.id, status: OrderStatus.CONVERTED, convertedAt: new Date() },
    });
  },
};
