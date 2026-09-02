import prisma from "../prisma";
import { PaymentMethod, PurchaseOrderStatus } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { purchaseService } from "./purchase.service";
import { generarOrdenCompraPDF } from "../utils/generarOrdenCompraPDF";

export const purchaseOrderService = {
  async getAll(status?: PurchaseOrderStatus) {
    return prisma.purchaseOrder.findMany({
      where: { ...tenantScope(), ...(status ? { status } : {}) },
      include: {
        supplier: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async getById(id: string) {
    return prisma.purchaseOrder.findFirst({
      where: { id, ...tenantScope() },
      include: {
        supplier: true,
        user: { select: { id: true, name: true } },
        purchases: { select: { id: true, totalAmount: true, createdAt: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true, saleUnit: true } } } },
      },
    });
  },

  async create(data: {
    supplierId: string;
    userId: string;
    expectedDate?: Date;
    notes?: string;
    items: { productId: string; quantity: number; unitCost?: number; ivaRate?: number }[];
  }) {
    if (!data.items.length) throw new Error("La orden debe tener al menos un ítem.");
    const scope = tenantScope();

    const supplier = await prisma.supplier.findFirst({ where: { id: data.supplierId, ...scope } });
    if (!supplier) throw new Error("Proveedor no encontrado.");

    const totalAmount = data.items.reduce(
      (sum, i) => sum + (i.unitCost ?? 0) * i.quantity,
      0
    );

    return prisma.purchaseOrder.create({
      data: {
        supplierId: data.supplierId,
        userId: data.userId,
        expectedDate: data.expectedDate ?? null,
        notes: data.notes ?? null,
        totalAmount,
        tenantId: currentTenantId(),
        items: {
          create: data.items.map((i) => ({
            productId: i.productId,
            quantityOrdered: i.quantity,
            unitCost: i.unitCost ?? 0,
            ivaRate: i.ivaRate ?? 21,
            subtotal: (i.unitCost ?? 0) * i.quantity,
          })),
        },
      },
      include: { items: true },
    });
  },

  async updateStatus(id: string, status: PurchaseOrderStatus) {
    const order = await prisma.purchaseOrder.findFirst({ where: { id, ...tenantScope() } });
    if (!order) throw new Error("Orden de compra no encontrada.");
    const allowed: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
      DRAFT: ["SENT", "CANCELLED"],
      SENT: ["PARTIAL", "RECEIVED", "CANCELLED"],
      PARTIAL: ["RECEIVED", "CANCELLED"],
      RECEIVED: [],
      CANCELLED: [],
    };
    if (!allowed[order.status].includes(status)) {
      throw new Error(`No se puede pasar de ${order.status} a ${status}.`);
    }
    return prisma.purchaseOrder.update({ where: { id }, data: { status } });
  },

  /**
   * Confirma que la mercadería de la orden llegó (completa) y registra la
   * Compra real por vos: mismo camino que "Registrar compra" a mano
   * (purchaseService.create — suma stock, actualiza costo, genera deuda con
   * el proveedor y el egreso en Finanzas), pero con los items/cantidades/
   * costos que ya estaban cargados en la orden, sin volver a tipearlos.
   * Los datos fiscales del comprobante (CUIT, tipo/punto de venta/numero,
   * percepciones) no se conocen al crear la orden -- recién llegan con la
   * mercadería -- por eso se piden aca, al recibir, igual que en "Registrar
   * compra" a mano (Compras), para que la Compra generada quede completa
   * para el Libro IVA Digital.
   * No hay recepcion parcial item-por-item: el schema no trackea cantidad
   * recibida por item (PurchaseOrderItem no tiene receivedQuantity), asi que
   * "recibir" es todo-o-nada sobre lo pedido.
   */
  async receiveFull(
    id: string,
    data: {
      businessLocationId: string;
      paymentMethod?: PaymentMethod;
      invoiceNumber?: string;
      providerCuit?: string;
      invoiceType?: number | string;
      invoicePointOfSale?: number | string;
      nonTaxedAmount?: number | string;
      exemptAmount?: number | string;
      ivaPerceptionAmount?: number | string;
      nationalTaxPerceptionAmount?: number | string;
      iibbPerceptionAmount?: number | string;
      municipalPerceptionAmount?: number | string;
      internalTaxAmount?: number | string;
    },
    userId: string
  ) {
    const scope = tenantScope();
    const order = await prisma.purchaseOrder.findFirst({
      where: { id, status: { in: ["SENT", "PARTIAL"] }, ...scope },
      include: {
        supplier: true,
        items: { include: { product: { select: { saleUnit: true } } } },
      },
    });
    if (!order) throw new Error("Orden no encontrada o no está en estado SENT/PARTIAL.");
    if (!order.items.length) throw new Error("La orden no tiene productos.");

    const purchase = await purchaseService.create(
      {
        supplierId: order.supplierId ?? undefined,
        purchaseOrderId: order.id,
        businessLocationId: data.businessLocationId,
        paymentMethod: data.paymentMethod,
        description: `Recepción de Orden de Compra #${order.id.slice(-8).toUpperCase()}`,
        invoiceNumber: data.invoiceNumber,
        providerCuit: data.providerCuit || order.supplier?.cuit || undefined,
        invoiceType: data.invoiceType,
        invoicePointOfSale: data.invoicePointOfSale,
        nonTaxedAmount: data.nonTaxedAmount,
        exemptAmount: data.exemptAmount,
        ivaPerceptionAmount: data.ivaPerceptionAmount,
        nationalTaxPerceptionAmount: data.nationalTaxPerceptionAmount,
        iibbPerceptionAmount: data.iibbPerceptionAmount,
        municipalPerceptionAmount: data.municipalPerceptionAmount,
        internalTaxAmount: data.internalTaxAmount,
        items: order.items.map((item) => ({
          productId: item.productId,
          quantity: item.product.saleUnit === "KG" ? undefined : (item.quantityOrdered ?? 0),
          quantityKg: item.product.saleUnit === "KG" ? (item.quantityKgOrdered ?? 0) : undefined,
          unitCost: item.unitCost,
          ivaRate: item.ivaRate,
        })),
      },
      userId
    );

    const updatedOrder = await prisma.purchaseOrder.update({
      where: { id },
      data: { status: "RECEIVED" },
      include: { supplier: true, items: true },
    });

    return { order: updatedOrder, purchase };
  },

  async generatePdf(id: string) {
    const order = await prisma.purchaseOrder.findFirst({
      where: { id, ...tenantScope() },
      include: {
        supplier: true,
        items: { include: { product: { select: { name: true, sku: true } } } },
      },
    });
    if (!order) throw new Error("Orden de compra no encontrada.");

    const tenant = order.tenantId
      ? await prisma.tenant.findUnique({
          where: { id: order.tenantId },
          select: { name: true, logoUrl: true, ticketBusinessName: true, ticketCuit: true, ticketAddress: true, ticketPhone: true },
        })
      : null;

    const buffer = await generarOrdenCompraPDF({
      id: order.id,
      createdAt: order.createdAt,
      status: order.status,
      expectedDate: order.expectedDate,
      notes: order.notes,
      totalAmount: order.totalAmount,
      supplier: order.supplier
        ? {
            name: order.supplier.name,
            cuit: order.supplier.cuit,
            contactName: order.supplier.contactName,
            phone: order.supplier.phone,
            email: order.supplier.email,
            address: order.supplier.address,
          }
        : null,
      items: order.items.map((item) => ({
        productName: item.productNameSnapshot || item.product.name,
        sku: item.product.sku,
        quantity: item.quantityOrdered,
        quantityKg: item.quantityKgOrdered,
        unitCost: item.unitCost,
        subtotal: item.subtotal,
        ivaRate: item.ivaRate,
      })),
      business: {
        name: tenant?.ticketBusinessName || tenant?.name || "Mi Negocio",
        cuit: tenant?.ticketCuit ?? null,
        address: tenant?.ticketAddress ?? null,
        phone: tenant?.ticketPhone ?? null,
        logoUrl: tenant?.logoUrl ?? null,
      },
    });

    return { buffer, filename: `orden-compra-${order.id.slice(-8)}.pdf` };
  },

  async remove(id: string) {
    const order = await prisma.purchaseOrder.findFirst({ where: { id, status: "DRAFT", ...tenantScope() } });
    if (!order) throw new Error("Solo se pueden eliminar órdenes en estado DRAFT.");
    await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
    return prisma.purchaseOrder.delete({ where: { id } });
  },
};
