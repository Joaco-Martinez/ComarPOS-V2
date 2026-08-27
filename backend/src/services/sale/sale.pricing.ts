/**
 * Helpers de pricing, resolucion de items y descuentos de ventas.
 * Extraidos de sale.service.ts (doc seccion 4.1 - modularizacion).
 * Estas funciones son independientes de la DB y se pueden testear unitariamente.
 */
import prisma from "../../prisma";
import {
  CategoryClient,
  SaleItemPriceType,
  ProductType,
  SaleUnit,
  PaymentMethod,
} from "@prisma/client";
import {
  CreateSaleInput,
  ResolvedSaleItem,
  ClientMini,
  DELIVERY_SKU,
} from "./sale.types";
import { tenantScope } from "../../utils/tenantScope";


function normalizeText(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isDeliverySaleItem(item: ResolvedSaleItem) {
  return normalizeText(item.productSku) === DELIVERY_SKU;
}

function shouldDiscountStock(item: ResolvedSaleItem) {
  if (item.isService) return false;
  if (item.unlimitedStock) return false;
  if (isDeliverySaleItem(item)) return false;

  return true;
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function resolveQty(product: any, item: any) {
  if (product.saleUnit === SaleUnit.KG) {
    const q = Number(item.quantityKg);

    if (!Number.isFinite(q) || q <= 0) {
      throw new Error(`Cantidad KG inválida para ${product.name}`);
    }

    return {
      quantity: 0,
      quantityKg: q,
      qtyUsedForTotal: q,
    };
  }

  const q = Number(item.quantity);

  if (!Number.isFinite(q) || q <= 0) {
    throw new Error(`Cantidad UNIT inválida para ${product.name}`);
  }

  return {
    quantity: q,
    quantityKg: null as number | null,
    qtyUsedForTotal: q,
  };
}

function normalizeSaleItemPriceType(
  value: any,
  product: any,
  client: ClientMini,
  hasManualPrice: boolean
): SaleItemPriceType {
  const raw = normalizeText(value);

  if (
    raw === "PRICE" ||
    raw === "RETAIL" ||
    raw === "RETAILPRICE" ||
    raw === "RETAIL_PRICE" ||
    raw === "MINORISTA" ||
    raw === "PUBLICO" ||
    raw === "PÚBLICO"
  ) {
    return SaleItemPriceType.PRICE;
  }

  if (
    raw === "WHOLESALE" ||
    raw === "WHOLESALEPRICE" ||
    raw === "WHOLESALE_PRICE" ||
    raw === "MAYORISTA"
  ) {
    return SaleItemPriceType.WHOLESALE_PRICE;
  }

  if (raw === "MANUAL" || raw === "CUSTOM" || raw === "CUSTOM_PRICE") {
    return SaleItemPriceType.MANUAL;
  }

  // El envío siempre usa precio manual porque viene calculado por distancia.
  if (normalizeText(product.sku) === DELIVERY_SKU && hasManualPrice) {
    return SaleItemPriceType.MANUAL;
  }

  // Compatibilidad con el comportamiento anterior:
  // si el frontend viejo no manda priceType, se usa la categoría del cliente.
  if (client?.category === CategoryClient.Mayorista) {
    return SaleItemPriceType.WHOLESALE_PRICE;
  }

  return SaleItemPriceType.PRICE;
}

function resolveUnitPrice(
  product: any,
  client: ClientMini,
  priceTypeInput: any,
  manualPriceInput?: number
) {
  const isKg = product.saleUnit === SaleUnit.KG;
  const hasManualPrice =
    manualPriceInput !== undefined &&
    manualPriceInput !== null &&
    Number.isFinite(Number(manualPriceInput));

  const priceType = normalizeSaleItemPriceType(
    priceTypeInput,
    product,
    client,
    hasManualPrice
  );

  const publicPrice = isKg ? product.pricePerKg : product.price;
  const wholesalePrice = isKg
    ? product.wholesalePricePerKg
    : product.wholesalePrice;

  const validate = (p: number, label: string) => {
    if (!Number.isFinite(p)) {
      throw new Error(
        `Falta precio ${label} (${isKg ? "KG" : "UNIT"}) en ${product.name}`
      );
    }

    if (p < 0) {
      throw new Error(`El precio ${label} no puede ser negativo en ${product.name}`);
    }

    return round2(p);
  };

  if (priceType === SaleItemPriceType.MANUAL) {
    if (!hasManualPrice) {
      throw new Error(`Falta precio manual para ${product.name}`);
    }

    return {
      unitPrice: validate(Number(manualPriceInput), "manual"),
      priceType,
    };
  }

  if (priceType === SaleItemPriceType.WHOLESALE_PRICE) {
    return {
      unitPrice: validate(Number(wholesalePrice ?? publicPrice), "mayorista"),
      priceType,
    };
  }

  return {
    unitPrice: validate(Number(publicPrice), "minorista"),
    priceType,
  };
}

function resolvePurchasePriceSnapshot(product: any) {
  if (product.type !== ProductType.COMPUESTO) {
    const cost = Number(product.purchasePrice ?? 0);
    return Number.isFinite(cost) ? cost : 0;
  }

  const components = Array.isArray(product.components) ? product.components : [];

  return round2(
    components.reduce((acc: number, component: any) => {
      const componentCost = Number(component.component?.purchasePrice ?? 0);
      const unitQty = Number(component.quantity ?? 0);
      const kgQty = Number(component.quantityKg ?? 0);

      return acc + componentCost * unitQty + componentCost * kgQty;
    }, 0)
  );
}


async function resolveSaleItems(
  saleItems: CreateSaleInput["items"],
  client: ClientMini
): Promise<ResolvedSaleItem[]> {
  // Se trae todos los productos en una sola query (evita N+1: antes se hacia
  // un findUnique por item, con un carrito de 10 items eran 10 roundtrips).
  const productIds = Array.from(new Set(saleItems.map((item) => item.productId)));

  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      ...tenantScope(),
    },
    select: {
      id: true,
      name: true,
      sku: true,
      type: true,
      saleUnit: true,
      isService: true,
      unlimitedStock: true,

      price: true,
      pricePerKg: true,
      purchasePrice: true,

      clientPrice: true,
      wholesalePrice: true,
      clientPricePerKg: true,
      wholesalePricePerKg: true,

      components: {
        select: {
          componentId: true,
          quantity: true,
          quantityKg: true,
          component: {
            select: {
              id: true,
              name: true,
              purchasePrice: true,
            },
          },
        },
      },
    },
  });

  const productById = new Map(products.map((product) => [product.id, product]));

  const itemsWithPrices: ResolvedSaleItem[] = [];

  for (const item of saleItems) {
    const product = productById.get(item.productId);

    if (!product) {
      throw new Error("Producto no encontrado");
    }

    const isDeliveryProduct = normalizeText(product.sku) === DELIVERY_SKU;

    const { quantity, quantityKg, qtyUsedForTotal } = isDeliveryProduct
      ? {
          quantity: Number(item.quantity ?? 1),
          quantityKg: null as number | null,
          qtyUsedForTotal: Number(item.quantity ?? 1),
        }
      : resolveQty(product, item);

    if (isDeliveryProduct && (!Number.isFinite(quantity) || quantity <= 0)) {
      throw new Error(`Cantidad inválida para ${product.name}`);
    }

    const manualPrice = item.price !== undefined ? Number(item.price) : undefined;

    if (
      item.price !== undefined &&
      (!Number.isFinite(Number(item.price)) || Number(item.price) < 0)
    ) {
      throw new Error(`Precio inválido para ${product.name}`);
    }

    const resolvedPrice = resolveUnitPrice(
      product,
      client,
      item.priceType,
      manualPrice
    );

    const unitPrice = resolvedPrice.unitPrice;
    const itemPriceType = resolvedPrice.priceType;
    const subtotal = round2(unitPrice * qtyUsedForTotal);
    const purchasePriceSnapshot = resolvePurchasePriceSnapshot(product);
    const costTotal = round2(purchasePriceSnapshot * qtyUsedForTotal);

    let components: ResolvedSaleItem["components"] = [];

    if (product.type === ProductType.COMPUESTO) {
      if (!product.components.length) {
        throw new Error(`El producto compuesto "${product.name}" no tiene componentes`);
      }

      components = product.components.map((component) => ({
        productId: component.componentId,
        quantity: component.quantity ?? null,
        quantityKg: component.quantityKg ?? null,
      }));
    } else if (Array.isArray(item.boxContents) && item.boxContents.length > 0) {
      components = item.boxContents.map((component) => ({
        productId: component.productId,
        quantity:
          component.quantity !== undefined ? Number(component.quantity) : null,
        quantityKg:
          component.quantityKg !== undefined ? Number(component.quantityKg) : null,
      }));
    }

    itemsWithPrices.push({
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      productType: product.type,
      saleUnit: product.saleUnit,
      isService: product.isService,
      unlimitedStock: product.unlimitedStock,
      quantity,
      quantityKg,
      price: unitPrice,
      priceType: itemPriceType,
      subtotal,
      purchasePriceSnapshot,
      ivaRate: (product as any).ivaRate ?? 21,
      costTotal,
      profit: 0,
      components,
    });
  }

  return itemsWithPrices;
}

function saleItemToResolved(item: any): ResolvedSaleItem {
  const qtyForCost = item.quantityKg ?? item.quantity;

  return {
    productId: item.productId,
    productName:
      item.productNameSnapshot ?? item.product?.name ?? "Producto",
    productSku: item.productSkuSnapshot ?? item.product?.sku ?? null,
    productType: item.product?.type as ProductType,
    saleUnit: item.product?.saleUnit as SaleUnit,
    isService: Boolean(item.product?.isService),
    unlimitedStock: Boolean(item.product?.unlimitedStock),
    quantity: item.quantity,
    quantityKg: item.quantityKg ?? null,
    price: item.price,
    priceType: item.priceType ?? SaleItemPriceType.PRICE,
    subtotal: item.subtotal ?? round2(item.price * qtyForCost),
    purchasePriceSnapshot: item.purchasePriceSnapshot ?? 0,
    ivaRate: item.ivaRate ?? item.product?.ivaRate ?? 21,
    costTotal: round2((item.purchasePriceSnapshot ?? 0) * qtyForCost),
    profit: item.profit ?? 0,
    components:
      item.boxContents?.map((box: any) => ({
        productId: box.productId,
        quantity: box.quantity ?? null,
        quantityKg: box.quantityKg ?? null,
      })) ?? [],
  };
}

function buildSaleItemCreateData(item: ResolvedSaleItem) {
  return {
    productId: item.productId,
    quantity: item.quantity,
    quantityKg: item.quantityKg,
    price: item.price,
    priceType: item.priceType,
    subtotal: item.subtotal,
    purchasePriceSnapshot: item.purchasePriceSnapshot,
    ivaRate: item.ivaRate ?? 21,
    profit: item.profit,
    productNameSnapshot: item.productName,
    productSkuSnapshot: item.productSku,

    boxContents: item.components.length
      ? {
          create: item.components.map((component) => ({
            productId: component.productId,
            quantity: component.quantity,
            quantityKg: component.quantityKg,
          })),
        }
      : undefined,
  };
}

function getPaymentsFromExistingSale(sale: any) {
  if (Array.isArray(sale.payments) && sale.payments.length > 0) {
    return sale.payments.map((payment: any) => ({
      method: payment.method as PaymentMethod,
      amount: Number(payment.amount),
      reference: payment.reference ?? undefined,
      notes: payment.notes ?? undefined,
    }));
  }

  if (sale.paymentMethod === PaymentMethod.CUENTA_CORRIENTE) {
    return [
      {
        method: PaymentMethod.CUENTA_CORRIENTE,
        amount: Number(sale.total ?? 0),
      },
    ];
  }

  return undefined;
}

function applyDiscountAndProfitToItems(
  items: ResolvedSaleItem[],
  discountBaseSubtotal: number,
  discountAmount: number
) {
  let appliedDiscount = 0;

  const lastDiscountableIndex = (() => {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      if (!isDeliverySaleItem(items[i])) return i;
    }

    return -1;
  })();

  return items.map((item, index) => {
    const isDeliveryItem = isDeliverySaleItem(item);
    const isLastDiscountable = index === lastDiscountableIndex;

    const proportionalDiscount =
      !isDeliveryItem && discountBaseSubtotal > 0
        ? isLastDiscountable
          ? round2(discountAmount - appliedDiscount)
          : round2(discountAmount * (item.subtotal / discountBaseSubtotal))
        : 0;

    appliedDiscount = round2(appliedDiscount + proportionalDiscount);

    const netSubtotal = round2(item.subtotal - proportionalDiscount);

    return {
      ...item,
      profit: round2(netSubtotal - item.costTotal),
    };
  });
}

// Re-exports para uso externo
export {
  round2,
  normalizeText,
  isDeliverySaleItem,
  shouldDiscountStock,
  resolveQty,
  normalizeSaleItemPriceType,
  resolveUnitPrice,
  resolvePurchasePriceSnapshot,
  resolveSaleItems,
  saleItemToResolved,
  buildSaleItemCreateData,
  getPaymentsFromExistingSale,
  applyDiscountAndProfitToItems,
};
