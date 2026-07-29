import prisma from "../prisma";
import { SaleStatus, PaymentMethod } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { updateStatus } from "./sale/sale.lifecycle";
import { round2 } from "./sale/sale.pricing";

export const returnService = {
  async processReturn(
    saleId: string,
    userId: string,
    options?: {
      refundMethod?: PaymentMethod;
      notes?: string;
    }
  ) {
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, ...tenantScope() },
      include: {
        items: true,
      },
    });

    if (!sale) throw new Error("Venta no encontrada");
    if (sale.status !== SaleStatus.COMPLETED) {
      throw new Error("Solo se pueden devolver ventas en estado COMPLETED");
    }

    // Cancel restores stock + reverses account debt automatically
    await updateStatus(saleId, SaleStatus.CANCELLED);

    // Registro propio de la devolucion (motivo + snapshot de items), en vez
    // de reutilizar Sale como si fuera el registro de devolucion.
    const returnRecord = await prisma.return.create({
      data: {
        saleId,
        clientId: sale.clientId,
        userId,
        total: sale.total,
        reason: options?.notes ?? null,
        refundMethod: options?.refundMethod ?? null,
        tenantId: currentTenantId(),
        items: {
          create: sale.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            quantityKg: item.quantityKg,
            unitPrice: item.price,
            subtotal: item.subtotal,
          })),
        },
      },
      include: {
        items: { include: { product: { select: { name: true, sku: true } } } },
        client: { select: { nombre: true, apellido: true } },
        user: { select: { name: true } },
      },
    });

    // Register cash outflow in Finance if a physical refund method was specified
    if (options?.refundMethod && options.refundMethod !== PaymentMethod.CUENTA_CORRIENTE) {
      const marker = `[return:${saleId}]`;
      const existing = await prisma.finance.findFirst({
        where: { description: { contains: marker }, ...tenantScope() },
      });
      if (!existing) {
        await prisma.finance.create({
          data: {
            type: "EGRESO",
            category: "VENTA",
            amount: round2(Number(sale.total)),
            paymentMethod: options.refundMethod,
            description: `Devolución de venta ${saleId} ${marker}`,
            date: new Date(),
            tenantId: currentTenantId(),
          },
        });
      }
    }

    return returnRecord;
  },

  async getReturns(params?: { fromDate?: Date; toDate?: Date; page?: number; limit?: number }) {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = { ...tenantScope() };

    if (params?.fromDate || params?.toDate) {
      where.createdAt = {};
      if (params.fromDate) where.createdAt.gte = params.fromDate;
      if (params.toDate) where.createdAt.lte = params.toDate;
    }

    const [items, total] = await Promise.all([
      prisma.return.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          client: { select: { nombre: true, apellido: true } },
          user: { select: { name: true } },
          items: { include: { product: { select: { name: true, sku: true } } } },
        },
      }),
      prisma.return.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  },
};
