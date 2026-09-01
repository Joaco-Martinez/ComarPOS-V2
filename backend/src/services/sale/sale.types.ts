/**
 * Tipos compartidos del servicio de ventas.
 * Extraidos de sale.service.ts (doc seccion 4.1 - modularizacion).
 */
import {
  CategoryClient,
  DeliveryMethod,
  DeliveryStatus,
  SaleItemPriceType,
  PaymentMethod,
  ProductType,
  ReceiptType,
  SaleStatus,
  SaleUnit,
} from "@prisma/client";

export type CreateSaleInput = {
  userId?: string;
  stockLocationId?: string;
  clientId?: string;

  businessLocationId?: string | null;

  discountType?: "PERCENTAGE" | "FIXED";
  discountValue?: number;

  // Lista de precios a usar para resolver el precio de los items (ver
  // sale.pricing.ts#resolveUnitPrice). Si no se manda, se usa la lista
  // asignada al cliente (Client.priceListId) o el mecanismo de siempre.
  priceListId?: string | null;

  // Descuentos multiples (pantalla de Cotizaciones, ver sale.discounts.ts).
  // Mutuamente excluyente con discountType/discountValue: si se manda
  // "discounts", ese es el mecanismo que se usa para esta venta.
  discounts?: {
    label?: string | null;
    type: "PERCENTAGE" | "FIXED";
    value: number;
    applied?: boolean;
  }[];
  discountsAccumulate?: boolean;

  gmailSend?: string;

  paymentMethod: PaymentMethod;

  quotationHours?: number;

  deliveryMethod?: DeliveryMethod;
  deliveryStatus?: DeliveryStatus;
  deliveryAddressSnapshot?: string | null;
  deliveryDistanceKm?: number | null;
  deliveryPricePerKm?: number | null;
  deliveryCost?: number | null;

  transportName?: string | null;
  transportCuit?: string | null;

  packagesCount?: number | null;
  declaredValue?: number | null;

  payments?: {
    method: PaymentMethod;
    amount: number;
    reference?: string;
    notes?: string;
  }[];

  receiptType: ReceiptType;
  status?: SaleStatus;

  items: {
    productId: string;
    quantity?: number;
    quantityKg?: number;
    price?: number;
    priceType?: string | SaleItemPriceType;
    boxContents?: {
      productId: string;
      quantity?: number;
      quantityKg?: number;
    }[];
  }[];
};

export type ClientMini = {
  category: CategoryClient;
  priceListId?: string | null;
} | null;

export type ResolvedSaleItem = {
  productId: string;
  productName: string;
  productSku: string | null;
  productType: ProductType;
  saleUnit: SaleUnit;
  isService: boolean;
  unlimitedStock: boolean;
  priceType: SaleItemPriceType;
  quantity: number;
  quantityKg: number | null;
  price: number;
  subtotal: number;
  purchasePriceSnapshot: number;
  ivaRate: number;
  costTotal: number;
  profit: number;

  components: {
    productId: string;
    quantity: number | null;
    quantityKg: number | null;
  }[];
};

export type StockLine = {
  productId: string;
  quantity: number;
  quantityKg: number;
  reason: string;
};

export type GetSalesParams = {
  page?: number;
  limit?: number;
  search?: string;
  status?: SaleStatus | string;
  from?: string;
  to?: string;
};

export const DELIVERY_SKU = "ENVIO-FLETE2";
export const DEFAULT_QUOTATION_HOURS = Number(process.env.DEFAULT_QUOTATION_HOURS ?? 36);
