/**
 * Lecturas de productos (listado paginado, busqueda por SKU/id) y movimientos de stock.
 * Extraido de product.service.ts (doc seccion 4.1 - modularizacion).
 */
import prisma from "../../prisma";
import { normalizeSku, productInclude, type GetProductsOptions } from "./product.helpers";
import { tenantScope } from "../../utils/tenantScope";

// Variantes activas (con su stock) adentro de cada padre, para ?grouped=true.
const groupedVariantsInclude = {
  variants: {
    where: { isActive: true },
    include: { stock: { include: { businessLocation: true } } },
    orderBy: { createdAt: "asc" as const },
  },
};

export async function getAll(options?: GetProductsOptions) {
  const page = Number(options?.page);
  const limit = Number(options?.limit);

  const hasPagination =
    Number.isFinite(page) &&
    Number.isFinite(limit) &&
    page > 0 &&
    limit > 0;

  const search = options?.search?.trim();
  const categoryId = options?.categoryId?.trim();
  const sort = options?.sort ?? "default";

  const where: any = {
    isActive: true,
    ...tenantScope(),
  };

  // Sin grouped/sellable el listado queda exactamente como antes (padres y
  // variantes mezclados) para no romper pantallas que no se migraron.
  if (options?.grouped) {
    where.parentId = null;
  } else if (options?.sellable) {
    where.hasVariants = false;
  }

  if (search) {
    const variantMatch = {
      variants: {
        some: {
          isActive: true,
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
          ],
        },
      },
    };

    where.OR = [
      {
        name: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        sku: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: search,
          mode: "insensitive",
        },
      },
      // En modo agrupado, buscar por nombre/SKU de una variante encuentra
      // a su padre.
      ...(options?.grouped ? [variantMatch] : []),
    ];
  }

  if (categoryId) {
    where.categoryId = categoryId;
  }

  let orderBy: any = {
    createdAt: "desc",
  };

  if (sort === "name-asc") {
    orderBy = {
      name: "asc",
    };
  }

  if (sort === "name-desc") {
    orderBy = {
      name: "desc",
    };
  }

  if (sort === "category-asc") {
    orderBy = [
      {
        category: {
          name: "asc",
        },
      },
      {
        name: "asc",
      },
    ];
  }

  if (sort === "category-desc") {
    orderBy = [
      {
        category: {
          name: "desc",
        },
      },
      {
        name: "asc",
      },
    ];
  }

  const include = options?.grouped ? { ...productInclude, ...groupedVariantsInclude } : productInclude;

  if (!hasPagination) {
    return prisma.product.findMany({
      where,
      include,
      orderBy,
    });
  }

  const safePage = Math.max(1, page);
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const skip = (safePage - 1) * safeLimit;

  const [data, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include,
      orderBy,
      skip,
      take: safeLimit,
    }),

    prisma.product.count({
      where,
    }),
  ]);

  return {
    data,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

export async function getBySku(rawSku: string) {
  const sku = normalizeSku(rawSku);

  // Si el SKU es de una variante, trae `parent`; si es de un padre, trae
  // sus variantes activas (el POS abre el selector de variantes).
  return prisma.product.findFirst({
    where: { sku, ...tenantScope() },
    include: { ...productInclude, ...groupedVariantsInclude },
  });
}

export async function getById(id: string) {
  // Incluye todas las variantes (activas o no) para poder editarlas.
  return prisma.product.findFirst({
    where: { id, ...tenantScope() },
    include: {
      ...productInclude,
      variants: {
        include: { stock: { include: { businessLocation: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function getMovements(filters?: {
  productId?: string;
  userId?: string;
  fromDate?: Date;
  toDate?: Date;
}) {
  const createdAt: any = {};

  if (filters?.fromDate) createdAt.gte = filters.fromDate;
  if (filters?.toDate) createdAt.lte = filters.toDate;

  return prisma.stockMovement.findMany({
    where: {
      productId: filters?.productId,
      userId: filters?.userId,
      ...(Object.keys(createdAt).length > 0 && { createdAt }),
      ...tenantScope(),
    },
    include: {
      product: {
        include: {
          category: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      fromLocation: { select: { id: true, name: true } },
      toLocation: { select: { id: true, name: true } },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
