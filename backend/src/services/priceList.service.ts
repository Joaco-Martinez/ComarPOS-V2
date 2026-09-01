/**
 * Listas de precios (doc "listas de precios + descuentos multiples en
 * cotizaciones"). Siempre existe una lista default ("Minorista") por tenant,
 * sincronizada automaticamente desde Product.price/pricePerKg (ver
 * product.write.ts) - no se puede renombrar, desactivar ni eliminar, y sus
 * items no se editan directo (solo via el form de producto). Las listas
 * custom que arma el usuario si tienen precios editables por producto.
 */
import prisma from "../prisma";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";

const DEFAULT_PRICE_LIST_NAME = "Minorista";

async function ensureDefaultPriceList(tenantId: string | null | undefined) {
  const normalizedTenantId = tenantId ?? null;

  const existing = await prisma.priceList.findFirst({
    where: { isDefault: true, tenantId: normalizedTenantId },
  });

  if (existing) return existing;

  return prisma.priceList.create({
    data: {
      tenantId: normalizedTenantId,
      name: DEFAULT_PRICE_LIST_NAME,
      description: "Lista principal (venta al público) - se sincroniza con el precio del producto",
      isDefault: true,
      isActive: true,
    },
  });
}

async function syncDefaultPriceListItem(
  tenantId: string | null | undefined,
  product: { id: string; price: number; pricePerKg: number | null }
) {
  const defaultList = await ensureDefaultPriceList(tenantId);

  await prisma.priceListItem.upsert({
    where: {
      priceListId_productId: {
        priceListId: defaultList.id,
        productId: product.id,
      },
    },
    update: {
      price: product.price,
      pricePerKg: product.pricePerKg,
    },
    create: {
      priceListId: defaultList.id,
      productId: product.id,
      price: product.price,
      pricePerKg: product.pricePerKg,
    },
  });
}

export const priceListService = {
  ensureDefaultPriceList,
  syncDefaultPriceListItem,

  async getAll(options?: { includeInactive?: boolean }) {
    await ensureDefaultPriceList(currentTenantId());

    return prisma.priceList.findMany({
      where: {
        ...tenantScope(),
        ...(options?.includeInactive ? {} : { isActive: true }),
      },
      include: {
        _count: { select: { items: true, clients: true } },
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
  },

  async getById(id: string) {
    return prisma.priceList.findFirst({
      where: { id, ...tenantScope() },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, saleUnit: true, price: true, pricePerKg: true } },
          },
          orderBy: { updatedAt: "desc" },
        },
        _count: { select: { items: true, clients: true } },
      },
    });
  },

  async create(data: { name: string; description?: string | null }) {
    if (!data.name || !data.name.trim()) {
      return { statusCode: 400, message: "El nombre de la lista es requerido" };
    }

    return prisma.priceList.create({
      data: {
        tenantId: currentTenantId(),
        name: data.name.trim(),
        description: data.description?.trim() || null,
        isDefault: false,
        isActive: true,
      },
    });
  },

  async update(
    id: string,
    data: { name?: string; description?: string | null; isActive?: boolean }
  ) {
    const existing = await prisma.priceList.findFirst({ where: { id, ...tenantScope() } });

    if (!existing) {
      return { statusCode: 404, message: "Lista de precios no encontrada" };
    }

    if (existing.isDefault) {
      return {
        statusCode: 400,
        message: "La lista Minorista no se puede modificar: se sincroniza automáticamente con el precio de cada producto",
      };
    }

    const prismaData: any = {};

    if (data.name !== undefined) {
      if (!data.name.trim()) {
        return { statusCode: 400, message: "El nombre de la lista no puede estar vacío" };
      }
      prismaData.name = data.name.trim();
    }

    if (data.description !== undefined) {
      prismaData.description = data.description?.trim() || null;
    }

    if (data.isActive !== undefined) {
      prismaData.isActive = data.isActive;
    }

    return prisma.priceList.update({ where: { id }, data: prismaData });
  },

  async remove(id: string) {
    const existing = await prisma.priceList.findFirst({ where: { id, ...tenantScope() } });

    if (!existing) {
      return { statusCode: 404, message: "Lista de precios no encontrada" };
    }

    if (existing.isDefault) {
      return { statusCode: 400, message: "La lista Minorista no se puede eliminar" };
    }

    await prisma.priceList.delete({ where: { id } });

    return { ok: true };
  },

  async setItemPrice(
    priceListId: string,
    productId: string,
    data: { price: number; pricePerKg?: number | null }
  ) {
    const list = await prisma.priceList.findFirst({ where: { id: priceListId, ...tenantScope() } });

    if (!list) {
      return { statusCode: 404, message: "Lista de precios no encontrada" };
    }

    if (list.isDefault) {
      return {
        statusCode: 400,
        message: "La lista Minorista no se edita acá: cambiá el precio del producto",
      };
    }

    const product = await prisma.product.findFirst({
      where: { id: productId, ...tenantScope() },
      select: { id: true },
    });

    if (!product) {
      return { statusCode: 404, message: "Producto no encontrado" };
    }

    if (!Number.isFinite(data.price) || data.price < 0) {
      return { statusCode: 400, message: "Precio inválido" };
    }

    return prisma.priceListItem.upsert({
      where: { priceListId_productId: { priceListId, productId } },
      update: { price: data.price, pricePerKg: data.pricePerKg ?? null },
      create: { priceListId, productId, price: data.price, pricePerKg: data.pricePerKg ?? null },
    });
  },

  async removeItem(priceListId: string, productId: string) {
    const list = await prisma.priceList.findFirst({ where: { id: priceListId, ...tenantScope() } });

    if (!list) {
      return { statusCode: 404, message: "Lista de precios no encontrada" };
    }

    if (list.isDefault) {
      return { statusCode: 400, message: "La lista Minorista no se edita acá" };
    }

    await prisma.priceListItem
      .delete({ where: { priceListId_productId: { priceListId, productId } } })
      .catch(() => null);

    return { ok: true };
  },

  /**
   * Carga TODOS los productos del tenant en la lista de una sola vez,
   * aplicando un ajuste porcentual sobre el precio de Minorista (positivo =
   * recargo, negativo = descuento, 0 = mismo precio que Minorista). Pedido
   * explicito: poder armar una lista completa con "10% off" o "10% de
   * recargo" en vez de cargar producto por producto. Se puede volver a
   * correr las veces que haga falta (pisa los precios existentes de la
   * lista con el nuevo porcentaje, calculado siempre desde Minorista, nunca
   * desde un override previo, para que el resultado sea predecible).
   */
  async bulkApply(priceListId: string, percentage: number) {
    const list = await prisma.priceList.findFirst({ where: { id: priceListId, ...tenantScope() } });

    if (!list) {
      return { statusCode: 404, message: "Lista de precios no encontrada" };
    }

    if (list.isDefault) {
      return { statusCode: 400, message: "La lista Minorista no se edita en bloque" };
    }

    if (!Number.isFinite(percentage) || percentage <= -100) {
      return { statusCode: 400, message: "Porcentaje inválido" };
    }

    const products = await prisma.product.findMany({
      where: { ...tenantScope(), isActive: true },
      select: { id: true, price: true, pricePerKg: true },
    });

    const factor = 1 + percentage / 100;
    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

    await prisma.$transaction(
      products.map((product) =>
        prisma.priceListItem.upsert({
          where: { priceListId_productId: { priceListId, productId: product.id } },
          update: {
            price: round2(product.price * factor),
            pricePerKg: product.pricePerKg != null ? round2(product.pricePerKg * factor) : null,
          },
          create: {
            priceListId,
            productId: product.id,
            price: round2(product.price * factor),
            pricePerKg: product.pricePerKg != null ? round2(product.pricePerKg * factor) : null,
          },
        })
      )
    );

    return { ok: true, count: products.length };
  },
};
