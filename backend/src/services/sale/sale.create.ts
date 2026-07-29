/**
 * Creacion de una venta nueva (resolucion de precios, stock, pagos y deuda).
 * Extraido de sale.service.ts (doc seccion 4.1 - modularizacion).
 */
import prisma from "../../prisma";
import { DeliveryMethod, DeliveryStatus, SaleStatus } from "@prisma/client";
import { CreateSaleInput, ClientMini, DELIVERY_SKU } from "./sale.types";
import {
  round2,
  normalizeStockLocation,
  isDeliverySaleItem,
  resolveSaleItems,
  buildSaleItemCreateData,
  applyDiscountAndProfitToItems,
} from "./sale.pricing";
import { buildStockLines, validateStockAvailability, discountStockLines, queueStockAlerts } from "./sale.stock";
import { calculatePaymentState, createAccountDebtMovement } from "./sale.payment";
import { addHours, resolveQuotationHours, queueSalePdfGeneration } from "./sale.query";
import { tenantScope } from "../../utils/tenantScope";
import { currentTenantId } from "../../context/tenantContext";
import { promotionService } from "../promotion.service";

export async function create(data: CreateSaleInput) {
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new Error("La venta debe tener al menos un producto");
  }

  let client: ClientMini = null;

  if (data.clientId) {
    client = await prisma.client.findFirst({
      where: {
        id: data.clientId,
        ...tenantScope(),
      },
      select: {
        category: true,
      },
    });

    if (!client) {
      throw new Error("Cliente no encontrado");
    }
  }

  if (data.businessLocationId) {
    const location = await prisma.businessLocation.findFirst({
      where: {
        id: data.businessLocationId,
        ...tenantScope(),
      },
      select: {
        id: true,
        isActive: true,
      },
    });

    if (!location) {
      throw new Error("Sucursal/depósito no encontrado");
    }

    if (!location.isActive) {
      throw new Error("La sucursal/depósito seleccionado está inactivo");
    }
  }

  const itemsWithPrices = await resolveSaleItems(data.items, client);

  const subtotal = round2(
    itemsWithPrices.reduce((acc, item) => acc + item.subtotal, 0)
  );

  const deliveryCost = round2(Number(data.deliveryCost ?? 0));

  if (!Number.isFinite(deliveryCost) || deliveryCost < 0) {
    throw new Error("El costo de envío no puede ser negativo");
  }

  const deliveryLineSubtotal = round2(
    itemsWithPrices
      .filter(isDeliverySaleItem)
      .reduce((acc, item) => acc + item.subtotal, 0)
  );

  const discountBaseSubtotal = round2(subtotal - deliveryLineSubtotal);

  let discountAmount = 0;
  let appliedPromotionId: string | null = null;
  let appliedPromotionDiscount: number | null = null;

  if (data.discountType && typeof data.discountValue === "number") {
    // Manual discount from the client — skip promotion lookup
    discountAmount =
      data.discountType === "PERCENTAGE"
        ? discountBaseSubtotal * (data.discountValue / 100)
        : data.discountValue;
  } else {
    // Try to automatically apply the best active promotion
    const productIds = itemsWithPrices.map((i) => i.productId);
    const productCategoryRows = await prisma.product.findMany({
      where: { id: { in: productIds }, ...tenantScope() },
      select: { categoryId: true },
    });
    const categoryIds = [
      ...new Set(productCategoryRows.map((p) => p.categoryId).filter(Boolean)),
    ] as string[];

    const promoResult = await promotionService.applyToCart({
      cartTotal: discountBaseSubtotal,
      productIds,
      categoryIds,
      clientCategory: client?.category ?? undefined,
    });

    if (promoResult.bestPromotion && promoResult.discount > 0) {
      discountAmount = promoResult.discount;
      appliedPromotionId = promoResult.bestPromotion.id;
      appliedPromotionDiscount = promoResult.discount;
    }
  }

  discountAmount = round2(discountAmount);

  if ((data.deliveryMethod ?? DeliveryMethod.PICKUP) === DeliveryMethod.LOCAL_DELIVERY) {
    if (deliveryCost <= 0) {
      throw new Error("El costo de envío debe ser mayor a 0");
    }

    if (deliveryLineSubtotal <= 0) {
      throw new Error(
        `El envío debe venir cargado como item (${DELIVERY_SKU}) en la venta`
      );
    }

    if (Math.abs(deliveryLineSubtotal - deliveryCost) > 0.01) {
      throw new Error(
        `El item de envío (${round2(deliveryLineSubtotal)}) no coincide con deliveryCost (${deliveryCost})`
      );
    }
  }

  // El envío ya entra dentro de subtotal porque se manda como un item de venta.
  // Por eso NO se suma deliveryCost otra vez, para no duplicarlo.
  const total = round2(subtotal - discountAmount);

  const itemsWithProfit = applyDiscountAndProfitToItems(
    itemsWithPrices,
    discountBaseSubtotal,
    discountAmount
  );

  const grossProfit = round2(
    itemsWithProfit.reduce((acc, item) => acc + item.profit, 0)
  );

  if (total < 0) {
    throw new Error("El total no puede ser negativo");
  }

  const paymentState = calculatePaymentState({
    total,
    paymentMethod: data.paymentMethod,
    payments: data.payments,
  });

  if (paymentState.isAccountSale && !data.clientId) {
    throw new Error("Para vender en cuenta corriente necesitás seleccionar un cliente");
  }

  const stockLocation = normalizeStockLocation(data.stockLocation);
  const stockLines = buildStockLines(itemsWithProfit);

  const pendingAlerts: string[] = [];

  const saleStatus = data.status ?? SaleStatus.PENDING;

  const quotationExpiresAt =
    saleStatus === SaleStatus.PENDING
      ? addHours(new Date(), resolveQuotationHours(data.quotationHours))
      : null;

  const result = await prisma.$transaction(
    async (tx) => {
      await validateStockAvailability(tx, stockLines, stockLocation);

      const sale = await tx.sale.create({
        data: {
          userId: data.userId,
          clientId: data.clientId ?? null,
          businessLocationId: data.businessLocationId ?? null,

          subtotal,
          total,
          grossProfit,
          tenantId: currentTenantId(),

          gmailSend: null,

          discountType: data.discountType ?? (appliedPromotionId ? "FIXED" : null),
          discountValue: data.discountValue ?? (appliedPromotionDiscount ?? null),
          promotionId: appliedPromotionId,
          promotionDiscount: appliedPromotionDiscount,

          paymentMethod: data.paymentMethod,
          receiptType: data.receiptType,
          status: saleStatus,
          stockLocation,

          deliveryMethod: data.deliveryMethod ?? DeliveryMethod.PICKUP,
          deliveryStatus: data.deliveryStatus ?? DeliveryStatus.NONE,
          deliveryAddressSnapshot: data.deliveryAddressSnapshot ?? null,
          deliveryDistanceKm: data.deliveryDistanceKm ?? null,
          deliveryPricePerKm: data.deliveryPricePerKm ?? null,
          deliveryCost,

          transportName: data.transportName ?? null,
          transportCuit: data.transportCuit ?? null,

          packagesCount: data.packagesCount ?? null,
          declaredValue: data.declaredValue ?? null,

          quotationExpiresAt,
          quotationExpiredAt: null,

          isAccountSale: paymentState.isAccountSale,
          accountDebtAmount: paymentState.debtAmount,

          items: {
            create: itemsWithProfit.map(buildSaleItemCreateData),
          },

          payments: paymentState.hasPayments
            ? {
                create: paymentState.paymentsToPersist.map((payment) => ({
                  method: payment.method,
                  amount: payment.amount,
                  reference: payment.reference ?? null,
                  notes: payment.notes ?? null,
                })),
              }
            : undefined,
        },
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
          user: { select: { id: true, name: true, email: true, role: true } },
          client: true,
        },
      });

      await discountStockLines(
        tx,
        stockLines,
        data.userId,
        sale.id,
        stockLocation,
        pendingAlerts
      );

      if (paymentState.isAccountSale && paymentState.debtAmount > 0 && data.clientId) {
        await createAccountDebtMovement(tx, {
          clientId: data.clientId,
          saleId: sale.id,
          userId: data.userId ?? null,
          amount: paymentState.debtAmount,
        });
      }

      return sale;
    },
    {
      timeout: 20000,
      maxWait: 20000,
    }
  );

  queueStockAlerts(pendingAlerts);
  queueSalePdfGeneration(result.id);

  return {
    sale: result,
    invoice: null,
    pdfQueued: true,
  };
}
