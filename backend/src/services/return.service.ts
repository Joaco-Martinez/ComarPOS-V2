import prisma from "../prisma";
import { SaleStatus, PaymentMethod } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { updateStatus } from "./sale/sale.lifecycle";
import { financeService } from "./finance.service";
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
      select: {
        id: true,
        status: true,
        total: true,
        clientId: true,
        isAccountSale: true,
        accountDebtAmount: true,
        tenantId: true,
      },
    });

    if (!sale) throw new Error("Venta no encontrada");
    if (sale.status !== SaleStatus.COMPLETED) {
      throw new Error("Solo se pueden devolver ventas en estado COMPLETED");
    }

    // Cancel restores stock + reverses account debt automatically
    const cancelled = await updateStatus(saleId, SaleStatus.CANCELLED);

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

    return cancelled;
  },

  async getReturnedSales(params?: { fromDate?: Date; toDate?: Date; page?: number; limit?: number }) {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = {
      status: SaleStatus.CANCELLED,
      ...tenantScope(),
    };

    if (params?.fromDate || params?.toDate) {
      where.updatedAt = {};
      if (params.fromDate) where.updatedAt.gte = params.fromDate;
      if (params.toDate) where.updatedAt.lte = params.toDate;
    }

    const [items, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: "desc" },
        include: {
          client: { select: { nombre: true, apellido: true } },
          user: { select: { name: true } },
          items: { include: { product: { select: { name: true, sku: true } } } },
        },
      }),
      prisma.sale.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  },
};
