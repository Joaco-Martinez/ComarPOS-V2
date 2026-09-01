import prisma from "../prisma";
import bcrypt from "bcryptjs";
import { CategoryClient, Role } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { startOfDayAR, endOfDayAR } from "../utils/dateAR";
import { planLimitsService } from "./planLimits.service";
import { AppError } from "../utils/asyncHandler";

type ClientCategory = "Price" | "Cliente" | "Mayorista";

function normalizeRole(value: string): Role {
  if (value === "ADMIN") return Role.ADMIN;
  if (value === "EMPLEADO") return Role.EMPLEADO;
  if (value === "CLIENTE") return Role.CLIENTE;
  throw new Error("Rol inválido");
}

function normalizeCategory(value?: string | null): CategoryClient {
  if (value === "Mayorista") return CategoryClient.Mayorista;

  // Compatibilidad: si algo viejo manda "Cliente", ahora lo tratamos como minorista.
  if (value === "Cliente") return CategoryClient.Price;

  return CategoryClient.Price;
}

function cleanEmail(value?: string | null) {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}


function parseFromDateParam(value?: string | null) {
  if (!value) return undefined;
  const date = startOfDayAR(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseToDateParam(value?: string | null) {
  if (!value) return undefined;
  const date = endOfDayAR(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function buildDateWhere(fromDate?: Date, toDate?: Date) {
  const dateWhere: { gte?: Date; lte?: Date } = {};

  if (fromDate) dateWhere.gte = fromDate;
  if (toDate) dateWhere.lte = toDate;

  return Object.keys(dateWhere).length ? dateWhere : undefined;
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isCancelled(status: unknown) {
  const value = String(status ?? '').toUpperCase();
  return value === 'CANCELLED' || value === 'CANCELED' || value === 'CANCELADA';
}

function saleTotal(sale: any) {
  const directTotal = n(sale?.total);
  if (directTotal > 0) return directTotal;

  return (sale?.items ?? []).reduce((acc: number, item: any) => {
    const qty = n(item?.quantityKg) > 0 ? n(item?.quantityKg) : n(item?.quantity) || 1;
    return acc + (n(item?.subtotal) || n(item?.price) * qty);
  }, 0);
}

function purchaseTotal(purchase: any) {
  const directTotal = n(purchase?.total ?? purchase?.amount ?? purchase?.subtotal);
  if (directTotal > 0) return directTotal;

  return (purchase?.items ?? purchase?.purchaseItems ?? []).reduce((acc: number, item: any) => {
    const qty = n(item?.quantityKg) > 0 ? n(item?.quantityKg) : n(item?.quantity) || 1;
    const cost = n(item?.costPrice ?? item?.purchasePrice ?? item?.price);
    return acc + (n(item?.subtotal) || cost * qty);
  }, 0);
}

function buildProductSummaryFromSales(sales: any[]) {
  const map = new Map<string, any>();

  for (const sale of sales) {
    if (isCancelled(sale?.status)) continue;

    for (const item of sale?.items ?? []) {
      const product = item?.product;
      const key = String(item?.productId || product?.id || item?.productNameSnapshot || product?.name || 'sin-producto');
      const quantity = n(item?.quantity);
      const quantityKg = n(item?.quantityKg);
      const subtotal = n(item?.subtotal) || n(item?.price) * (quantityKg > 0 ? quantityKg : quantity || 1);

      const current = map.get(key) ?? {
        key,
        productId: item?.productId ?? product?.id ?? null,
        name: item?.productNameSnapshot || product?.name || 'Producto',
        sku: item?.productSkuSnapshot || product?.sku || null,
        category: product?.category?.name ?? null,
        quantity: 0,
        quantityKg: 0,
        subtotal: 0,
        operations: 0,
      };

      current.quantity += quantity;
      current.quantityKg += quantityKg;
      current.subtotal += subtotal;
      current.operations += 1;
      map.set(key, current);
    }
  }

  return Array.from(map.values())
    .map((item) => ({ ...item, subtotal: round2(item.subtotal) }))
    .sort((a, b) => b.subtotal - a.subtotal);
}

function buildProductSummaryFromPurchases(purchases: any[]) {
  const map = new Map<string, any>();

  for (const purchase of purchases) {
    if (isCancelled(purchase?.status)) continue;

    for (const item of purchase?.items ?? purchase?.purchaseItems ?? []) {
      const product = item?.product;
      const key = String(item?.productId || product?.id || item?.productNameSnapshot || product?.name || 'sin-producto');
      const quantity = n(item?.quantity);
      const quantityKg = n(item?.quantityKg);
      const cost = n(item?.costPrice ?? item?.purchasePrice ?? item?.price);
      const subtotal = n(item?.subtotal) || cost * (quantityKg > 0 ? quantityKg : quantity || 1);

      const current = map.get(key) ?? {
        key,
        productId: item?.productId ?? product?.id ?? null,
        name: item?.productNameSnapshot || product?.name || 'Producto',
        sku: item?.productSkuSnapshot || product?.sku || null,
        category: product?.category?.name ?? null,
        quantity: 0,
        quantityKg: 0,
        subtotal: 0,
        operations: 0,
      };

      current.quantity += quantity;
      current.quantityKg += quantityKg;
      current.subtotal += subtotal;
      current.operations += 1;
      map.set(key, current);
    }
  }

  return Array.from(map.values())
    .map((item) => ({ ...item, subtotal: round2(item.subtotal) }))
    .sort((a, b) => b.subtotal - a.subtotal);
}

async function safeFindMany(modelName: string, args: any) {
  const model = (prisma as any)[modelName];

  if (!model?.findMany) return [];

  try {
    return await model.findMany(args);
  } catch {
    return [];
  }
}

type UserActivityParams = {
  fromDate?: string | null;
  toDate?: string | null;
};

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  client: true,
  defaultBusinessLocationId: true,
  restrictToDefaultLocation: true,
  defaultBusinessLocation: { select: { id: true, name: true } },
};

/** Valida que la sucursal exista y pertenezca al tenant actual. Tira si no. */
async function requireLocationOrNull(businessLocationId: string | null | undefined) {
  if (businessLocationId === undefined) return undefined;
  if (businessLocationId === null || businessLocationId === "") return null;

  const location = await prisma.businessLocation.findFirst({
    where: { id: businessLocationId, ...tenantScope() },
    select: { id: true },
  });
  if (!location) throw new Error("La sucursal indicada no existe");

  return location.id;
}

export const userService = {
  async getAll() {
    return prisma.user.findMany({
      where: { role: { not: Role.CLIENTE }, ...tenantScope() },
      orderBy: { createdAt: "desc" },
      select: userSelect,
    });
  },

  async getById(id: string) {
    return prisma.user.findFirst({
      where: { id, ...tenantScope() },
      select: userSelect,
    });
  },



  async getActivityById(id: string, params: UserActivityParams = {}) {
    const fromDate = parseFromDateParam(params.fromDate);
    const toDate = parseToDateParam(params.toDate);

    const user = await prisma.user.findFirst({
      where: { id, ...tenantScope() },
      select: userSelect,
    });

    if (!user) return null;

    const saleCreatedAt = buildDateWhere(fromDate, toDate);
    const movementCreatedAt = buildDateWhere(fromDate, toDate);
    const remitoCreatedAt = buildDateWhere(fromDate, toDate);
    const accountDate = buildDateWhere(fromDate, toDate);

    const [sales, stockMovements, accountMovements, remitos, arcaAuditLogs, purchases] = await Promise.all([
      prisma.sale.findMany({
        where: {
          userId: id,
          ...(saleCreatedAt && { createdAt: saleCreatedAt }),
          ...tenantScope(),
        },
        include: {
          client: true,
          businessLocation: true,
          payments: true,
          invoice: true,
          invoiceAfip: {
            include: {
              creditNotes: true,
            },
          },
          remitos: {
            include: {
              items: {
                include: { product: true },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
          accountMovements: {
            orderBy: { createdAt: 'desc' },
          },
          items: {
            include: {
              product: {
                include: {
                  category: true,
                },
              },
              boxContents: {
                include: {
                  product: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),

      prisma.stockMovement.findMany({
        where: {
          userId: id,
          ...(movementCreatedAt && { createdAt: movementCreatedAt }),
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
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),

      prisma.accountMovement.findMany({
        where: {
          userId: id,
          ...(accountDate && { date: accountDate }),
        },
        include: {
          client: true,
          sale: {
            include: {
              client: true,
            },
          },
        },
        orderBy: { date: 'desc' },
      }),

      prisma.remito.findMany({
        where: {
          userId: id,
          ...(remitoCreatedAt && { createdAt: remitoCreatedAt }),
          ...tenantScope(),
        },
        include: {
          client: true,
          sale: true,
          businessLocation: true,
          items: {
            include: { product: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),

      safeFindMany('arcaAuditLog', {
        where: {
          userId: id,
          ...(movementCreatedAt && { createdAt: movementCreatedAt }),
          ...tenantScope(),
        },
        orderBy: { createdAt: 'desc' },
      }),

      safeFindMany('purchase', {
        where: {
          userId: id,
          ...(saleCreatedAt && { createdAt: saleCreatedAt }),
          ...tenantScope(),
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
          items: {
            include: {
              product: {
                include: { category: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const validSales = sales.filter((sale: any) => !isCancelled(sale.status));
    const validPurchases = purchases.filter((purchase: any) => !isCancelled(purchase.status));
    const completedSales = sales.filter((sale: any) => String(sale.status ?? '').toUpperCase() === 'COMPLETED');
    const pendingSales = sales.filter((sale: any) => String(sale.status ?? '').toUpperCase() === 'PENDING');
    const cancelledSales = sales.filter((sale: any) => isCancelled(sale.status));

    const totalSold = validSales.reduce((acc: number, sale: any) => acc + saleTotal(sale), 0);
    const totalPurchased = validPurchases.reduce((acc: number, purchase: any) => acc + purchaseTotal(purchase), 0);
    const totalDebtGenerated = validSales.reduce((acc: number, sale: any) => acc + n(sale.accountDebtAmount), 0);
    const totalAccountPayments = accountMovements
      .filter((movement: any) => String(movement.type ?? '').toUpperCase() === 'ABONO')
      .reduce((acc: number, movement: any) => acc + n(movement.amount), 0);

    const paymentBreakdown = validSales.reduce((acc: Record<string, number>, sale: any) => {
      const payments = sale.payments?.length
        ? sale.payments
        : [{ method: sale.paymentMethod, amount: saleTotal(sale) }];

      for (const payment of payments) {
        const method = String(payment.method || 'SIN_METODO');
        acc[method] = round2((acc[method] ?? 0) + n(payment.amount));
      }

      return acc;
    }, {});

    const stockBreakdown = stockMovements.reduce((acc: Record<string, number>, movement: any) => {
      const type = String(movement.type || 'MOVIMIENTO');
      acc[type] = (acc[type] ?? 0) + 1;
      return acc;
    }, {});

    return {
      user,
      filters: {
        fromDate: fromDate?.toISOString() ?? null,
        toDate: toDate?.toISOString() ?? null,
      },
      summary: {
        salesCount: sales.length,
        validSalesCount: validSales.length,
        completedSalesCount: completedSales.length,
        pendingSalesCount: pendingSales.length,
        cancelledSalesCount: cancelledSales.length,
        purchasesCount: purchases.length,
        stockMovementsCount: stockMovements.length,
        remitosCount: remitos.length,
        accountMovementsCount: accountMovements.length,
        arcaAuditLogsCount: arcaAuditLogs.length,
        totalSold: round2(totalSold),
        totalPurchased: round2(totalPurchased),
        totalDebtGenerated: round2(totalDebtGenerated),
        totalAccountPayments: round2(totalAccountPayments),
        averageTicket: validSales.length ? round2(totalSold / validSales.length) : 0,
        paymentBreakdown,
        stockBreakdown,
      },
      productsSold: buildProductSummaryFromSales(sales),
      productsPurchased: buildProductSummaryFromPurchases(purchases),
      sales,
      purchases,
      stockMovements,
      accountMovements,
      remitos,
      arcaAuditLogs,
    };
  },

  async create(data: {
    email: string;
    password: string;
    name: string;
    role: Role | string;
    isActive?: boolean;
    defaultBusinessLocationId?: string | null;
    restrictToDefaultLocation?: boolean;

    nombre?: string;
    apellido?: string;
    dni?: string;
    telefono?: string | null;
    category?: ClientCategory;
    creditLimit?: number | null;
    isAccountEnabled?: boolean;
  }) {
    const email = cleanEmail(data.email);
    const password = String(data.password || "");
    const role = normalizeRole(String(data.role || ""));
    const name = String(data.name || "").trim();

    if (!email) throw new Error("El email es obligatorio");
    if (!name) throw new Error("El nombre es obligatorio");
    if (!password || password.length < 6) {
      throw new Error("La contraseña debe tener al menos 6 caracteres");
    }

    // email es unico globalmente (migracion user_email_globally_unique), no
    // por tenant - mismo motivo que en auth.service.ts register().
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) throw new Error("Ya existe un usuario con ese email");

    const hashedPassword = await bcrypt.hash(password, 10);

    if (role !== Role.CLIENTE) {
      const limitCheck = await planLimitsService.checkLimit(currentTenantId(), "users");
      if (!limitCheck.ok) throw new AppError("PLAN_LIMIT_REACHED", limitCheck.message, 403);

      const defaultBusinessLocationId = await requireLocationOrNull(data.defaultBusinessLocationId);
      if (data.restrictToDefaultLocation && !defaultBusinessLocationId) {
        throw new Error("Para restringir a una sucursal primero tenés que asignarle una");
      }

      return prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role,
          isActive: data.isActive ?? true,
          tenantId: currentTenantId(),
          defaultBusinessLocationId: defaultBusinessLocationId ?? null,
          restrictToDefaultLocation: data.restrictToDefaultLocation ?? false,
        },
        select: userSelect,
      });
    }

    const nombre = String(data.nombre || name.split(" ")[0] || name).trim();
    const apellido = String(
      data.apellido || name.split(" ").slice(1).join(" ") || ""
    ).trim();
    const dni = String(data.dni || "").trim();

    if (!dni) {
      throw new Error("Para crear un usuario cliente, el DNI/CUIT es obligatorio");
    }

    const existingClient = await prisma.client.findFirst({
      where: { dni, ...tenantScope() },
    });

    if (existingClient) {
      throw new Error("Ya existe un cliente con ese DNI/CUIT");
    }

    return prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: Role.CLIENTE,
        isActive: data.isActive ?? true,
        tenantId: currentTenantId(),
        client: {
          create: {
            nombre,
            apellido,
            dni,
            telefono: data.telefono ?? null,
            gmail: email,
            category: normalizeCategory(data.category),
            creditLimit: data.creditLimit ?? null,
            isAccountEnabled: data.isAccountEnabled ?? false,
            tenantId: currentTenantId(),
          },
        },
      },
      select: userSelect,
    });
  },

  async update(
    id: string,
    data: Partial<{
      email: string;
      password: string;
      name: string;
      role: Role | string;
      isActive: boolean;
      defaultBusinessLocationId: string | null;
      restrictToDefaultLocation: boolean;
    }>
  ) {
    const cleanData: any = {};

    if (data.email !== undefined) {
      cleanData.email = cleanEmail(data.email);
    }

    if (data.name !== undefined) {
      cleanData.name = String(data.name).trim();
    }

    if (data.role !== undefined) {
      cleanData.role = normalizeRole(String(data.role));
    }

    if (data.isActive !== undefined) {
      cleanData.isActive = data.isActive;
    }

    if (data.password !== undefined && data.password !== "") {
      if (data.password.length < 6) {
        throw new Error("La contraseña debe tener al menos 6 caracteres");
      }

      cleanData.password = await bcrypt.hash(data.password, 10);
    }

    const existing = await prisma.user.findFirst({
      where: { id, ...tenantScope() },
      select: { id: true, defaultBusinessLocationId: true },
    });

    if (!existing) throw new Error("Usuario no encontrado");

    if (data.defaultBusinessLocationId !== undefined) {
      cleanData.defaultBusinessLocationId = await requireLocationOrNull(data.defaultBusinessLocationId);
    }

    if (data.restrictToDefaultLocation !== undefined) {
      const willHaveLocation =
        cleanData.defaultBusinessLocationId !== undefined
          ? cleanData.defaultBusinessLocationId
          : existing.defaultBusinessLocationId;
      if (data.restrictToDefaultLocation && !willHaveLocation) {
        throw new Error("Para restringir a una sucursal primero tenés que asignarle una");
      }
      cleanData.restrictToDefaultLocation = data.restrictToDefaultLocation;
    }

    return prisma.user.update({
      where: { id },
      data: cleanData,
      select: userSelect,
    });
  },

  async delete(id: string) {
    const user = await prisma.user.findFirst({
      where: { id, ...tenantScope() },
      include: { client: true },
    });

    if (!user) throw new Error("Usuario no encontrado");

    if (user.role === Role.ADMIN) {
      const adminCount = await prisma.user.count({
        where: {
          role: Role.ADMIN,
          isActive: true,
          ...tenantScope(),
        },
      });

      if (adminCount <= 1) {
        throw new Error("No podés eliminar el último usuario ADMIN activo");
      }
    }

    return prisma.user.delete({
      where: { id },
    });
  },
};