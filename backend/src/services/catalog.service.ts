import prisma from "../prisma";
import {
  CategoryClient,
  PaymentMethod,
  ProductType,
  ReceiptType,
  Role,
  SaleStatus,
  SaleUnit,
} from "@prisma/client";
import { saleService } from "./sale.service";
import { whatsappService } from "./whatsapp.service";
import { tenantScope } from "../utils/tenantScope";

type CatalogFilters = {
  userId?: string;
  categorySlug?: string;
  search?: string;
  limit?: number;
  page?: number;
};

type CheckoutItemInput = {
  productId: string;
  quantity?: number;
  quantityKg?: number;
};

type CheckoutInput = {
  userId: string;
  items: CheckoutItemInput[];
  paymentMethod?: PaymentMethod;
  customerNotes?: string;
};

type CustomerContext = {
  userId?: string;
  clientId?: string;
  category: CategoryClient;
  customerName?: string;
  dni?: string;
  phone?: string | null;
  email?: string | null;
};

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function cleanLimit(limit?: number) {
  if (!limit || !Number.isFinite(limit)) return 60;
  return Math.min(Math.max(Math.trunc(limit), 1), 120);
}

function cleanPage(page?: number) {
  if (!page || !Number.isFinite(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}

function normalizeSearch(search?: string) {
  const value = String(search || "").trim();
  return value.length ? value : undefined;
}

function normalizeCategory(value?: string | null): CategoryClient {
  if (value === CategoryClient.Mayorista || value === "Mayorista") {
    return CategoryClient.Mayorista;
  }

  // Compatibilidad: Cliente/Price/Minorista se tratan como minorista.
  return CategoryClient.Price;
}

// Stock del catalogo publico = suma de todas las ubicaciones del tenant
// (ver doc de migracion "ubicaciones de stock dinamicas" - reemplaza la
// regla fija Mayorista->LOCAL / resto->DEPOSITO, que dejo de tener sentido
// con N ubicaciones dinamicas en vez de 2 fijas).
function getUnitStockTotal(product: any) {
  const rows = Array.isArray(product.stock) ? product.stock : [];
  return rows.reduce((acc: number, row: any) => acc + Number(row.quantity || 0), 0);
}

function getKgStockTotal(product: any) {
  const rows = Array.isArray(product.stock) ? product.stock : [];
  return rows.reduce((acc: number, row: any) => acc + Number(row.quantityKg || 0), 0);
}

function getProductStock(product: any) {
  if (product.type === ProductType.COMPUESTO) {
    if (!Array.isArray(product.components) || product.components.length === 0) {
      return {
        availableQuantity: 0,
        availableKg: 0,
        stockLabel: "Sin componentes configurados",
        canSell: false,
      };
    }

    const maxByComponents = product.components.map((component: any) => {
      const componentProduct = component.component;
      const unitQty = Number(component.quantity || 0);
      const kgQty = Number(component.quantityKg || 0);

      if (!componentProduct) return 0;

      if (unitQty > 0) {
        return Math.floor(getUnitStockTotal(componentProduct) / unitQty);
      }

      if (kgQty > 0) {
        return Math.floor(getKgStockTotal(componentProduct) / kgQty);
      }

      return 0;
    });

    const available = Math.max(0, Math.min(...maxByComponents));

    return {
      availableQuantity: available,
      availableKg: 0,
      stockLabel: available > 0 ? `${available} disponibles` : "Sin stock",
      canSell: available > 0,
    };
  }

  if (product.saleUnit === SaleUnit.KG) {
    const availableKg = getKgStockTotal(product);

    return {
      availableQuantity: 0,
      availableKg,
      stockLabel: availableKg > 0 ? `${round2(availableKg)} kg disponibles` : "Sin stock",
      canSell: availableKg > 0,
    };
  }

  const availableQuantity = getUnitStockTotal(product);

  return {
    availableQuantity,
    availableKg: 0,
    stockLabel: availableQuantity > 0 ? `${availableQuantity} disponibles` : "Sin stock",
    canSell: availableQuantity > 0,
  };
}

function resolvePrice(product: any, category: CategoryClient) {
  const isKg = product.saleUnit === SaleUnit.KG;

  const publicPriceRaw = isKg ? product.pricePerKg : product.price;
  const wholesalePriceRaw = isKg
    ? product.wholesalePricePerKg
    : product.wholesalePrice;

  const publicPrice = Number(publicPriceRaw);
  const safePublicPrice = Number.isFinite(publicPrice) ? publicPrice : 0;

  const wholesalePrice = Number(wholesalePriceRaw ?? safePublicPrice);
  const safeWholesalePrice = Number.isFinite(wholesalePrice)
    ? wholesalePrice
    : safePublicPrice;

  let price = safePublicPrice;
  let priceList: "PUBLIC" | "WHOLESALE" = "PUBLIC";

  if (category === CategoryClient.Mayorista) {
    price = safeWholesalePrice;
    priceList = "WHOLESALE";
  }

  return {
    price: round2(Number.isFinite(price) ? price : 0),
    priceList,
    publicPrice: round2(safePublicPrice),
    clientPrice: round2(safePublicPrice),
    wholesalePrice: round2(safeWholesalePrice),
    currency: "ARS",
  };
}

function mapProduct(product: any, customer: CustomerContext) {
  const stock = getProductStock(product);
  const pricing = resolvePrice(product, customer.category);

  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    type: product.type,
    saleUnit: product.saleUnit,
    imageUrl: product.imageUrl,
    category: product.category
      ? {
          id: product.category.id,
          name: product.category.name,
          slug: product.category.slug,
        }
      : null,
    price: pricing.price,
    priceList: pricing.priceList,
    publicPrice: pricing.publicPrice,
    clientPrice: pricing.clientPrice,
    wholesalePrice: pricing.wholesalePrice,
    currency: pricing.currency,
    availableQuantity: stock.availableQuantity,
    availableKg: stock.availableKg,
    stockLabel: stock.stockLabel,
    canSell: stock.canSell,
    components:
      product.type === ProductType.COMPUESTO
        ? product.components.map((component: any) => ({
            id: component.id,
            productId: component.componentId,
            name: component.component?.name ?? "Componente",
            quantity: component.quantity,
            quantityKg: component.quantityKg,
            saleUnit: component.component?.saleUnit,
          }))
        : [],
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function normalizeWhatsappNumber(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function buildWhatsappUrl(message: string) {
  const phone = normalizeWhatsappNumber(
    process.env.STORE_WHATSAPP_NUMBER ||
      process.env.WHATSAPP_PHONE ||
      process.env.BUSINESS_WHATSAPP_NUMBER ||
      process.env.BUSINESS_WHATSAPP,
  );

  if (!phone) return null;

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function buildWhatsappMessage(params: {
  sale: any;
  customer: CustomerContext;
  customerNotes?: string;
}) {
  const { sale, customer, customerNotes } = params;

  const lines = sale.items.map((item: any) => {
    const productName =
      item.product?.name || item.productNameSnapshot || "Producto";
    const saleUnit = item.product?.saleUnit || "UNIT";
    const qty =
      saleUnit === SaleUnit.KG
        ? `${round2(Number(item.quantityKg || 0))} kg`
        : `x${item.quantity}`;

    return `- ${productName} ${qty} — ${formatMoney(Number(item.subtotal || 0))}`;
  });

  const customerLines = [
    customer.customerName ? `Mi nombre: ${customer.customerName}` : null,
    customer.dni ? `DNI/CUIT: ${customer.dni}` : null,
    customer.phone ? `Teléfono: ${customer.phone}` : null,
    customer.email ? `Email: ${customer.email}` : null,
  ].filter(Boolean);

  return [
    "Hola! Quiero hacer este pedido:",
    "",
    `Pedido #${sale.id}`,
    ...lines,
    "",
    `Total: ${formatMoney(Number(sale.total || 0))}`,
    "",
    ...customerLines,
    customerNotes ? "" : null,
    customerNotes ? `Notas: ${customerNotes}` : null,
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");
}

export const catalogService = {
  async getCustomerContext(userId?: string): Promise<CustomerContext> {
    if (!userId) {
      return { category: CategoryClient.Price };
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, ...tenantScope() },
      include: { client: true },
    });

    if (!user || user.isActive === false) {
      return { category: CategoryClient.Price };
    }

    if (user.role !== Role.CLIENTE || !user.client) {
      return {
        userId: user.id,
        category: CategoryClient.Price,
        customerName: user.name,
        email: user.email,
      };
    }

    return {
      userId: user.id,
      clientId: user.client.id,
      category: normalizeCategory(user.client.category),
      customerName:
        [user.client.nombre, user.client.apellido]
          .filter(Boolean)
          .join(" ")
          .trim() || user.name,
      dni: user.client.dni,
      phone: user.client.telefono,
      email: user.client.gmail || user.email,
    };
  },

  async getCategories() {
    const categories = await prisma.productCategory.findMany({
      where: { isActive: true, ...tenantScope() },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            products: { where: { isActive: true } },
          },
        },
      },
    });

    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      productsCount: category._count.products,
    }));
  },

  async getProducts(filters: CatalogFilters) {
    const customer = await this.getCustomerContext(filters.userId);
    const limit = cleanLimit(filters.limit);
    const page = cleanPage(filters.page);
    const search = normalizeSearch(filters.search);

    const where: any = { isActive: true, ...tenantScope() };

    if (filters.categorySlug) {
      where.category = {
        slug: filters.categorySlug,
        isActive: true,
      };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { sku: { contains: search, mode: "insensitive" } },
      ];
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      include: {
        category: true,
        stock: true,
        components: { include: { component: { include: { stock: true } } } },
      },
    });

    const mappedProducts = products
      .map((product) => mapProduct(product, customer))
      .sort((a, b) => {
        if (a.canSell !== b.canSell) return a.canSell ? -1 : 1;

        return String(a.name || "").localeCompare(
          String(b.name || ""),
          "es-AR",
          {
            numeric: true,
            sensitivity: "base",
          },
        );
      });

    const total = mappedProducts.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const paginatedProducts = mappedProducts.slice(
      (safePage - 1) * limit,
      safePage * limit,
    );

    return {
      customer: {
        category: customer.category,
        isLoggedIn: !!customer.userId,
        clientId: customer.clientId ?? null,
      },
      pagination: {
        page: safePage,
        limit,
        total,
        pages: totalPages,
        totalPages,
      },
      products: paginatedProducts,
    };
  },

  async checkoutWhatsapp(data: CheckoutInput) {
    if (!data.userId) {
      throw new Error("Para finalizar el pedido tenés que iniciar sesión");
    }

    const customer = await this.getCustomerContext(data.userId);

    if (!customer.clientId) {
      throw new Error(
        "Solo los usuarios cliente pueden finalizar pedidos desde la tienda",
      );
    }

    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new Error("El carrito está vacío");
    }

    const normalizedItems = data.items.map((item) => ({
      productId: String(item.productId || ""),
      quantity: item.quantity !== undefined ? Number(item.quantity) : undefined,
      quantityKg:
        item.quantityKg !== undefined ? Number(item.quantityKg) : undefined,
    }));

    for (const item of normalizedItems) {
      if (!item.productId) {
        throw new Error("Hay un producto inválido en el carrito");
      }
    }

    // El pedido de la tienda descuenta de la ubicacion default del tenant
    // (o la primera activa si ninguna esta marcada default) - ver doc de
    // migracion "ubicaciones de stock dinamicas". Antes se elegia LOCAL/
    // DEPOSITO segun categoria de cliente, regla que ya no aplica con N
    // ubicaciones dinamicas.
    const defaultLocation = await prisma.businessLocation.findFirst({
      where: { isActive: true, ...tenantScope() },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    if (!defaultLocation) {
      throw new Error("El negocio todavía no configuró ninguna ubicación de stock");
    }

    const saleResult = await saleService.create({
      userId: data.userId,
      clientId: customer.clientId,
      paymentMethod: data.paymentMethod || PaymentMethod.TRANSFERENCIA,
      receiptType: ReceiptType.TICKET,
      status: SaleStatus.PENDING,
      stockLocationId: defaultLocation.id,
      items: normalizedItems,
    });

    const sale = (saleResult as any).sale;

    const whatsappMessage = buildWhatsappMessage({
      sale,
      customer,
      customerNotes: data.customerNotes,
    });

    const whatsappApi = await whatsappService.sendTextMessage({
      to: customer.phone || "",
      message: whatsappMessage,
    });

    return {
      saleId: sale.id,
      status: sale.status,
      total: sale.total,
      whatsappMessage,
      whatsappUrl: null,
      missingWhatsappConfig: Boolean(whatsappApi.missingConfig),
      whatsappApi,
      sale,
    };
  },
};
