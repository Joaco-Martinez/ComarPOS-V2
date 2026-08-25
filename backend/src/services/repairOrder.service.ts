/**
 * Servicio de "Servicios / Reparaciones": recibir un equipo, presupuestar el
 * arreglo (repuestos reales del catalogo + lineas libres de mano de obra),
 * compartir el presupuesto por un link publico para que el cliente lo
 * apruebe/rechace sin login, y cobrar/facturar generando una Sale normal
 * (reusa sale.service.ts en vez de reimplementar pagos/AFIP/cuenta corriente).
 */
import crypto from "crypto";
import prisma from "../prisma";
import { PaymentMethod, ReceiptType, RepairOrderItemType, RepairOrderStatus, SaleStatus } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { AppError } from "../utils/asyncHandler";
import { saleService } from "./sale.service";
import { generarPresupuestoReparacionPDF } from "../utils/generarPresupuestoReparacionPDF";

const SERVICE_LABOR_SKU = "SERVICIO-TECNICO";
const APPROVAL_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

const LOCKED_STATUSES = new Set<RepairOrderStatus>([
  RepairOrderStatus.DELIVERED,
  RepairOrderStatus.CANCELLED,
]);

// Transiciones manuales permitidas (ver setStatus). DELIVERED solo se llega
// via checkout() (que ademas genera la Sale), nunca por un cambio de estado
// suelto -- por eso no aparece como destino de ninguna fila.
const ALLOWED_TRANSITIONS: Record<RepairOrderStatus, RepairOrderStatus[]> = {
  RECEIVED: [RepairOrderStatus.IN_PROGRESS, RepairOrderStatus.CANCELLED],
  BUDGETED: [RepairOrderStatus.APPROVED, RepairOrderStatus.REJECTED, RepairOrderStatus.CANCELLED],
  APPROVED: [RepairOrderStatus.IN_PROGRESS, RepairOrderStatus.CANCELLED],
  REJECTED: [RepairOrderStatus.BUDGETED, RepairOrderStatus.CANCELLED],
  IN_PROGRESS: [RepairOrderStatus.READY, RepairOrderStatus.CANCELLED],
  READY: [RepairOrderStatus.IN_PROGRESS, RepairOrderStatus.CANCELLED],
  DELIVERED: [],
  CANCELLED: [],
};

const CHECKOUT_ALLOWED_STATUSES = new Set<RepairOrderStatus>([
  RepairOrderStatus.APPROVED,
  RepairOrderStatus.IN_PROGRESS,
  RepairOrderStatus.READY,
]);

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function cleanString(value?: string | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

const REPAIR_INCLUDE = {
  client: true,
  user: { select: { id: true, name: true } },
  businessLocation: { select: { id: true, name: true } },
  items: { orderBy: { createdAt: "asc" as const }, include: { product: { select: { id: true, name: true, sku: true } } } },
  sale: { select: { id: true, total: true, status: true, invoiceStatus: true, receiptType: true, createdAt: true } },
};

async function findOrThrow(id: string) {
  const order = await prisma.repairOrder.findFirst({
    where: { id, ...tenantScope() },
    include: REPAIR_INCLUDE,
  });
  if (!order) throw new AppError("REPAIR_ORDER_NOT_FOUND", "Reparación no encontrada", 404);
  return order;
}

function assertEditable(order: { status: RepairOrderStatus }) {
  if (LOCKED_STATUSES.has(order.status)) {
    throw new AppError("REPAIR_ORDER_LOCKED", "No se puede modificar una reparación entregada o cancelada", 409);
  }
}

async function recalcTotal(id: string) {
  const items = await prisma.repairOrderItem.findMany({ where: { repairOrderId: id } });
  const totalAmount = round2(items.reduce((acc, it) => acc + Number(it.subtotal || 0), 0));

  const order = await prisma.repairOrder.findUnique({ where: { id } });
  const data: { totalAmount: number; status?: RepairOrderStatus; budgetedAt?: Date } = { totalAmount };

  // El primer item cargado sobre una reparacion recien recibida arranca el
  // presupuesto -- pasa a BUDGETED automaticamente, sin boton aparte.
  if (items.length > 0 && order?.status === RepairOrderStatus.RECEIVED) {
    data.status = RepairOrderStatus.BUDGETED;
    data.budgetedAt = new Date();
  }

  await prisma.repairOrder.update({ where: { id }, data });
  return findOrThrow(id);
}

// El item "mano de obra / texto libre" se carga en la Sale final como un
// Product mas (igual patron que DELIVERY_SKU en delivery.service.ts) con
// precio manual = suma de esas lineas. Un producto por alicuota de IVA
// distinta (21/10.5/27/0...) porque saleService.create() resuelve el
// ivaRate de cada SaleItem desde el Product, no desde un override por item
// -- asi el checkout no pierde el desglose de IVA que se cargo en el
// presupuesto sin tener que tocar sale.pricing.ts. Se crean solos la
// primera vez que hace falta cada alicuota.
async function ensureServiceLaborProduct(ivaRate: number) {
  const rate = round2(ivaRate);
  const sku = `${SERVICE_LABOR_SKU}-${rate}`;
  const scope = tenantScope();
  const existing = await prisma.product.findFirst({ where: { sku, ...scope } });
  if (existing) return existing;

  return prisma.product.create({
    data: {
      name: rate === 21 ? "Servicio técnico" : `Servicio técnico (${rate <= 0 ? "Exento" : `IVA ${rate}%`})`,
      sku,
      type: "SIMPLE",
      saleUnit: "UNIT",
      isService: true,
      price: 0,
      clientPrice: 0,
      wholesalePrice: 0,
      ivaRate: rate,
      tenantId: currentTenantId(),
    },
  });
}

async function buildPdfBuffer(order: {
  id: string;
  createdAt: Date;
  status: RepairOrderStatus;
  deviceType: string;
  deviceBrand: string | null;
  deviceModel: string | null;
  deviceSerial: string | null;
  deviceAccessories: string | null;
  reportedIssue: string;
  diagnosis: string | null;
  totalAmount: number;
  tenantId: string | null;
  client?: { nombre: string; apellido: string; dni?: string | null; telefono?: string | null } | null;
  items: { description: string; quantity: number; unitPrice: number; subtotal: number; ivaRate: number }[];
}) {
  const tenant = order.tenantId
    ? await prisma.tenant.findUnique({
        where: { id: order.tenantId },
        select: { name: true, logoUrl: true, ticketBusinessName: true, ticketCuit: true, ticketAddress: true, ticketPhone: true },
      })
    : null;

  return generarPresupuestoReparacionPDF({
    id: order.id,
    createdAt: order.createdAt,
    status: order.status,
    deviceType: order.deviceType,
    deviceBrand: order.deviceBrand,
    deviceModel: order.deviceModel,
    deviceSerial: order.deviceSerial,
    deviceAccessories: order.deviceAccessories,
    reportedIssue: order.reportedIssue,
    diagnosis: order.diagnosis,
    totalAmount: order.totalAmount,
    client: order.client,
    items: order.items,
    business: {
      name: tenant?.ticketBusinessName || tenant?.name || "Mi Negocio",
      cuit: tenant?.ticketCuit ?? null,
      address: tenant?.ticketAddress ?? null,
      phone: tenant?.ticketPhone ?? null,
      logoUrl: tenant?.logoUrl ?? null,
    },
  });
}

export const repairOrderService = {
  async getAll(params: { status?: string; search?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 50));

    const where: any = { ...tenantScope() };
    if (params.status) where.status = params.status;

    const q = cleanString(params.search);
    if (q) {
      where.OR = [
        { deviceType: { contains: q, mode: "insensitive" } },
        { deviceBrand: { contains: q, mode: "insensitive" } },
        { deviceModel: { contains: q, mode: "insensitive" } },
        { deviceSerial: { contains: q, mode: "insensitive" } },
        { reportedIssue: { contains: q, mode: "insensitive" } },
        {
          client: {
            is: {
              OR: [
                { nombre: { contains: q, mode: "insensitive" } },
                { apellido: { contains: q, mode: "insensitive" } },
                { dni: { contains: q, mode: "insensitive" } },
              ],
            },
          },
        },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.repairOrder.findMany({
        where,
        include: REPAIR_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.repairOrder.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  },

  async getById(id: string) {
    return findOrThrow(id);
  },

  async create(data: {
    clientId?: string | null;
    userId?: string | null;
    businessLocationId?: string | null;
    deviceType: string;
    deviceBrand?: string | null;
    deviceModel?: string | null;
    deviceSerial?: string | null;
    deviceAccessories?: string | null;
    deviceConditionNotes?: string | null;
    reportedIssue: string;
    estimatedDeliveryDate?: Date | null;
    notes?: string | null;
  }) {
    const deviceType = cleanString(data.deviceType);
    const reportedIssue = cleanString(data.reportedIssue);
    if (!deviceType) throw new AppError("VALIDATION_ERROR", "El tipo de equipo es obligatorio", 400);
    if (!reportedIssue) throw new AppError("VALIDATION_ERROR", "La falla reportada es obligatoria", 400);

    if (data.clientId) {
      const client = await prisma.client.findFirst({ where: { id: data.clientId, ...tenantScope() } });
      if (!client) throw new AppError("CLIENT_NOT_FOUND", "Cliente no encontrado", 404);
    }

    if (data.businessLocationId) {
      const location = await prisma.businessLocation.findFirst({ where: { id: data.businessLocationId, ...tenantScope() } });
      if (!location) throw new AppError("LOCATION_NOT_FOUND", "Sucursal no encontrada", 404);
    }

    const order = await prisma.repairOrder.create({
      data: {
        tenantId: currentTenantId(),
        clientId: data.clientId || null,
        userId: data.userId || null,
        businessLocationId: data.businessLocationId || null,
        deviceType,
        deviceBrand: cleanString(data.deviceBrand),
        deviceModel: cleanString(data.deviceModel),
        deviceSerial: cleanString(data.deviceSerial),
        deviceAccessories: cleanString(data.deviceAccessories),
        deviceConditionNotes: cleanString(data.deviceConditionNotes),
        reportedIssue,
        estimatedDeliveryDate: data.estimatedDeliveryDate ?? null,
        notes: cleanString(data.notes),
        status: RepairOrderStatus.RECEIVED,
      },
      include: REPAIR_INCLUDE,
    });

    return order;
  },

  async update(
    id: string,
    data: Partial<{
      clientId: string | null;
      businessLocationId: string | null;
      deviceType: string;
      deviceBrand: string | null;
      deviceModel: string | null;
      deviceSerial: string | null;
      deviceAccessories: string | null;
      deviceConditionNotes: string | null;
      reportedIssue: string;
      diagnosis: string | null;
      estimatedDeliveryDate: Date | null;
      notes: string | null;
    }>
  ) {
    const order = await findOrThrow(id);
    assertEditable(order);

    if (data.clientId) {
      const client = await prisma.client.findFirst({ where: { id: data.clientId, ...tenantScope() } });
      if (!client) throw new AppError("CLIENT_NOT_FOUND", "Cliente no encontrado", 404);
    }

    const updateData: any = {};
    if (data.clientId !== undefined) updateData.clientId = data.clientId || null;
    if (data.businessLocationId !== undefined) updateData.businessLocationId = data.businessLocationId || null;
    if (data.deviceType !== undefined) {
      const deviceType = cleanString(data.deviceType);
      if (!deviceType) throw new AppError("VALIDATION_ERROR", "El tipo de equipo es obligatorio", 400);
      updateData.deviceType = deviceType;
    }
    if (data.deviceBrand !== undefined) updateData.deviceBrand = cleanString(data.deviceBrand);
    if (data.deviceModel !== undefined) updateData.deviceModel = cleanString(data.deviceModel);
    if (data.deviceSerial !== undefined) updateData.deviceSerial = cleanString(data.deviceSerial);
    if (data.deviceAccessories !== undefined) updateData.deviceAccessories = cleanString(data.deviceAccessories);
    if (data.deviceConditionNotes !== undefined) updateData.deviceConditionNotes = cleanString(data.deviceConditionNotes);
    if (data.reportedIssue !== undefined) {
      const reportedIssue = cleanString(data.reportedIssue);
      if (!reportedIssue) throw new AppError("VALIDATION_ERROR", "La falla reportada es obligatoria", 400);
      updateData.reportedIssue = reportedIssue;
    }
    if (data.diagnosis !== undefined) updateData.diagnosis = cleanString(data.diagnosis);
    if (data.estimatedDeliveryDate !== undefined) updateData.estimatedDeliveryDate = data.estimatedDeliveryDate;
    if (data.notes !== undefined) updateData.notes = cleanString(data.notes);

    await prisma.repairOrder.update({ where: { id }, data: updateData });
    return findOrThrow(id);
  },

  async addItem(
    id: string,
    item: {
      type?: string;
      productId?: string | null;
      description?: string;
      quantity?: number;
      unitPrice: number;
      ivaRate?: number;
    }
  ) {
    const order = await findOrThrow(id);
    assertEditable(order);

    let productId: string | null = null;
    let description = cleanString(item.description) ?? "";
    let productIvaRate: number | null = null;

    if (item.productId) {
      const product = await prisma.product.findFirst({ where: { id: item.productId, ...tenantScope() } });
      if (!product) throw new AppError("PRODUCT_NOT_FOUND", "Producto no encontrado", 404);
      productId = product.id;
      productIvaRate = product.ivaRate;
      if (!description) description = product.name;
    } else if (!description) {
      throw new AppError("VALIDATION_ERROR", "La línea necesita una descripción o un producto del catálogo", 400);
    }

    const quantity = Math.max(1, Math.trunc(Number(item.quantity) || 1));
    const unitPrice = Number(item.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new AppError("VALIDATION_ERROR", "El precio de la línea es inválido", 400);
    }

    const ivaRate = item.ivaRate !== undefined ? Number(item.ivaRate) : productIvaRate ?? 21;
    if (!Number.isFinite(ivaRate) || ivaRate < 0 || ivaRate > 100) {
      throw new AppError("VALIDATION_ERROR", "La alícuota de IVA es inválida", 400);
    }

    await prisma.repairOrderItem.create({
      data: {
        repairOrderId: id,
        type: item.type === "LABOR" ? RepairOrderItemType.LABOR : productId ? RepairOrderItemType.PART : RepairOrderItemType.LABOR,
        productId,
        description,
        quantity,
        unitPrice: round2(unitPrice),
        subtotal: round2(unitPrice * quantity),
        ivaRate: round2(ivaRate),
      },
    });

    return recalcTotal(id);
  },

  async updateItem(
    id: string,
    itemId: string,
    data: { description?: string; quantity?: number; unitPrice?: number; ivaRate?: number }
  ) {
    const order = await findOrThrow(id);
    assertEditable(order);

    const existing = await prisma.repairOrderItem.findFirst({ where: { id: itemId, repairOrderId: id } });
    if (!existing) throw new AppError("ITEM_NOT_FOUND", "Línea no encontrada", 404);

    const quantity = data.quantity !== undefined ? Math.max(1, Math.trunc(Number(data.quantity))) : existing.quantity;
    const unitPrice = data.unitPrice !== undefined ? Number(data.unitPrice) : Number(existing.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new AppError("VALIDATION_ERROR", "El precio de la línea es inválido", 400);
    }

    const ivaRate = data.ivaRate !== undefined ? Number(data.ivaRate) : Number(existing.ivaRate);
    if (!Number.isFinite(ivaRate) || ivaRate < 0 || ivaRate > 100) {
      throw new AppError("VALIDATION_ERROR", "La alícuota de IVA es inválida", 400);
    }

    await prisma.repairOrderItem.update({
      where: { id: itemId },
      data: {
        description: data.description !== undefined ? cleanString(data.description) ?? existing.description : undefined,
        quantity,
        unitPrice: round2(unitPrice),
        subtotal: round2(unitPrice * quantity),
        ivaRate: round2(ivaRate),
      },
    });

    return recalcTotal(id);
  },

  async removeItem(id: string, itemId: string) {
    const order = await findOrThrow(id);
    assertEditable(order);

    await prisma.repairOrderItem.deleteMany({ where: { id: itemId, repairOrderId: id } });
    return recalcTotal(id);
  },

  async setStatus(id: string, status: string) {
    const order = await findOrThrow(id);
    const next = status as RepairOrderStatus;

    if (!Object.values(RepairOrderStatus).includes(next)) {
      throw new AppError("VALIDATION_ERROR", "Estado inválido", 400);
    }

    const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(next)) {
      throw new AppError("INVALID_TRANSITION", `No se puede pasar de ${order.status} a ${next}`, 409);
    }

    const data: any = { status: next };
    if (next === RepairOrderStatus.REJECTED) data.rejectedAt = new Date();

    await prisma.repairOrder.update({ where: { id }, data });
    return findOrThrow(id);
  },

  async createApprovalLink(id: string) {
    const order = await findOrThrow(id);
    if (!order.items.length) {
      throw new AppError("VALIDATION_ERROR", "Agregá al menos un ítem al presupuesto antes de compartirlo", 400);
    }

    const token = crypto.randomBytes(24).toString("hex");
    const approvalTokenExpiresAt = new Date(Date.now() + APPROVAL_LINK_TTL_MS);

    await prisma.repairOrder.update({
      where: { id },
      data: { approvalToken: token, approvalTokenExpiresAt },
    });

    return { token, expiresAt: approvalTokenExpiresAt };
  },

  // --- Acceso publico (sin login, autenticado solo por el token) ---

  async getByToken(token: string) {
    const order = await prisma.repairOrder.findUnique({
      where: { approvalToken: token },
      include: {
        client: { select: { nombre: true, apellido: true } },
        items: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!order) throw new AppError("NOT_FOUND", "Presupuesto no encontrado", 404);
    if (order.approvalTokenExpiresAt && order.approvalTokenExpiresAt < new Date()) {
      throw new AppError("LINK_EXPIRED", "Este link venció, pedí que te compartan uno nuevo", 410);
    }
    return order;
  },

  async approveByToken(token: string) {
    const order = await repairOrderService.getByToken(token);
    if (order.status !== RepairOrderStatus.BUDGETED && order.status !== RepairOrderStatus.REJECTED) {
      throw new AppError("INVALID_TRANSITION", "Este presupuesto ya no está pendiente de aprobación", 409);
    }
    return prisma.repairOrder.update({
      where: { id: order.id },
      data: { status: RepairOrderStatus.APPROVED, approvedAt: new Date() },
    });
  },

  async rejectByToken(token: string, reason?: string) {
    const order = await repairOrderService.getByToken(token);
    if (order.status !== RepairOrderStatus.BUDGETED) {
      throw new AppError("INVALID_TRANSITION", "Este presupuesto ya no está pendiente de aprobación", 409);
    }
    return prisma.repairOrder.update({
      where: { id: order.id },
      data: { status: RepairOrderStatus.REJECTED, rejectedAt: new Date(), rejectionReason: cleanString(reason) },
    });
  },

  // --- Cobro: convierte la reparacion en una Sale normal ---

  async checkout(
    id: string,
    data: {
      paymentMethod: string;
      receiptType: string;
      payments?: { method: string; amount: number; reference?: string; notes?: string }[];
      businessLocationId?: string;
      stockLocationId?: string;
      discountType?: "PERCENTAGE" | "FIXED";
      discountValue?: number;
    },
    userId?: string
  ) {
    const order = await findOrThrow(id);

    if (order.saleId) throw new AppError("ALREADY_CHARGED", "Esta reparación ya fue cobrada", 409);
    if (!CHECKOUT_ALLOWED_STATUSES.has(order.status)) {
      throw new AppError(
        "INVALID_TRANSITION",
        "La reparación tiene que estar aprobada por el cliente antes de cobrarla",
        409
      );
    }
    if (!order.items.length) throw new AppError("VALIDATION_ERROR", "No hay ítems cargados para cobrar", 400);

    const partItems = order.items.filter((it) => it.productId);
    const freeItems = order.items.filter((it) => !it.productId);

    const saleItems: { productId: string; quantity: number; price: number; priceType: string }[] = partItems.map((it) => ({
      productId: it.productId as string,
      quantity: it.quantity,
      price: round2(Number(it.unitPrice)),
      priceType: "MANUAL",
    }));

    // Las lineas libres (mano de obra/otro) se agrupan por alicuota de IVA
    // -- una linea de Sale por cada alicuota distinta, no todas juntas, para
    // no perder el desglose de IVA que se cargo en el presupuesto (ver
    // ensureServiceLaborProduct).
    const laborByRate = new Map<number, number>();
    for (const it of freeItems) {
      const rate = round2(Number(it.ivaRate ?? 21));
      laborByRate.set(rate, round2((laborByRate.get(rate) ?? 0) + Number(it.subtotal || 0)));
    }

    for (const [rate, amount] of laborByRate) {
      if (amount <= 0) continue;
      const laborProduct = await ensureServiceLaborProduct(rate);
      saleItems.push({ productId: laborProduct.id, quantity: 1, price: amount, priceType: "MANUAL" });
    }

    const { sale } = await saleService.create({
      userId,
      clientId: order.clientId ?? undefined,
      businessLocationId: data.businessLocationId ?? order.businessLocationId ?? undefined,
      stockLocationId: data.stockLocationId,
      discountType: data.discountType,
      discountValue: data.discountValue,
      paymentMethod: data.paymentMethod as PaymentMethod,
      receiptType: data.receiptType as ReceiptType,
      status: SaleStatus.COMPLETED,
      payments: data.payments as any,
      items: saleItems,
    });

    await prisma.repairOrder.update({
      where: { id },
      data: { saleId: sale.id, status: RepairOrderStatus.DELIVERED, deliveredAt: new Date() },
    });

    return findOrThrow(id);
  },

  async generatePdf(id: string) {
    const order = await findOrThrow(id);
    const buffer = await buildPdfBuffer(order);
    return { buffer, filename: `presupuesto-reparacion-${order.id.slice(-8)}.pdf` };
  },

  async generatePdfByToken(token: string) {
    const order = await repairOrderService.getByToken(token);
    const buffer = await buildPdfBuffer(order as any);
    return { buffer, filename: `presupuesto-reparacion-${order.id.slice(-8)}.pdf` };
  },

  async remove(id: string) {
    const order = await findOrThrow(id);
    if (order.saleId) throw new AppError("CANNOT_DELETE", "No se puede eliminar una reparación ya cobrada", 409);
    await prisma.repairOrder.delete({ where: { id } });
    return { ok: true };
  },
};
