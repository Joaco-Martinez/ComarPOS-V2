/**
 * Lecturas de productos (listado paginado, busqueda por SKU/id) y movimientos de stock.
 * Extraido de product.service.ts (doc seccion 4.1 - modularizacion).
 */
import prisma from "../../prisma";
import { normalizeSku, productInclude, type GetProductsOptions } from "./product.helpers";
import { tenantScope } from "../../utils/tenantScope";

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

  if (search) {
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

  if (!hasPagination) {
    return prisma.product.findMany({
      where,
      include: productInclude,
      orderBy,
    });
  }

  const safePage = Math.max(1, page);
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const skip = (safePage - 1) * safeLimit;

  const [data, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: productInclude,
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

  return prisma.product.findFirst({
    where: { sku, ...tenantScope() },
    include: productInclude,
  });
}

export async function getById(id: string) {
  return prisma.product.findFirst({
    where: { id, ...tenantScope() },
    include: productInclude,
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
