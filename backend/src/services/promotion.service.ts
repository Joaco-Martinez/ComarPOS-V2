import prisma from "../prisma";
import { DiscountType, PromotionType, CategoryClient } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const promotionService = {
  async getAll() {
    return prisma.promotion.findMany({
      where: { ...tenantScope() },
      orderBy: { createdAt: "desc" },
    });
  },

  async getActive() {
    const now = new Date();
    return prisma.promotion.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
        ...tenantScope(),
      },
      orderBy: { startsAt: "asc" },
    });
  },

  async getById(id: string) {
    return prisma.promotion.findFirst({ where: { id, ...tenantScope() } });
  },

  async create(data: {
    name: string;
    description?: string;
    type: PromotionType;
    discountValue: number;
    discountType: DiscountType;
    startsAt: Date;
    endsAt: Date;
    minAmount?: number;
    categoryIds?: string[];
    productIds?: string[];
    clientCategory?: CategoryClient;
  }) {
    if (data.startsAt >= data.endsAt) throw new Error("startsAt debe ser anterior a endsAt.");
    if (data.discountValue <= 0) throw new Error("El descuento debe ser mayor a 0.");
    return prisma.promotion.create({
      data: { ...data, tenantId: currentTenantId() },
    });
  },

  async update(id: string, data: {
    name?: string;
    description?: string;
    discountValue?: number;
    discountType?: DiscountType;
    startsAt?: Date;
    endsAt?: Date;
    isActive?: boolean;
    minAmount?: number;
    categoryIds?: string[];
    productIds?: string[];
    clientCategory?: CategoryClient | null;
  }) {
    const existing = await prisma.promotion.findFirst({ where: { id, ...tenantScope() } });
    if (!existing) throw new Error("Promoción no encontrada.");
    return prisma.promotion.update({ where: { id }, data });
  },

  async deactivate(id: string) {
    const existing = await prisma.promotion.findFirst({ where: { id, ...tenantScope() } });
    if (!existing) throw new Error("Promoción no encontrada.");
    return prisma.promotion.update({ where: { id }, data: { isActive: false } });
  },

  async remove(id: string) {
    const existing = await prisma.promotion.findFirst({
      where: { id, ...tenantScope() },
      include: { _count: { select: { sales: true } } },
    });
    if (!existing) throw new Error("Promoción no encontrada.");
    if (existing._count.sales > 0) {
      throw new Error("No se puede eliminar una promoción ya usada en ventas. Desactivala en su lugar.");
    }
    return prisma.promotion.delete({ where: { id } });
  },

  // Given cart context, returns applicable promotions and best discount
  async applyToCart(params: {
    cartTotal: number;
    productIds: string[];
    categoryIds: string[];
    clientCategory?: CategoryClient;
  }) {
    const activePromos = await promotionService.getActive();
    const applicable = [];

    for (const promo of activePromos) {
      // Check client category restriction
      if (promo.clientCategory && promo.clientCategory !== params.clientCategory) continue;
      // Check minimum amount
      if (promo.minAmount && params.cartTotal < promo.minAmount) continue;

      if (promo.type === "CART_DISCOUNT") {
        applicable.push(promo);
      } else if (promo.type === "PRODUCT_DISCOUNT") {
        if (promo.productIds.some((id) => params.productIds.includes(id))) applicable.push(promo);
      } else if (promo.type === "CATEGORY_DISCOUNT") {
        if (promo.categoryIds.some((id) => params.categoryIds.includes(id))) applicable.push(promo);
      }
    }

    // Pick best discount
    let bestDiscount = 0;
    let bestPromotion = null;
    for (const promo of applicable) {
      const discount =
        promo.discountType === "PERCENTAGE"
          ? round2(params.cartTotal * (promo.discountValue / 100))
          : promo.discountValue;
      if (discount > bestDiscount) {
        bestDiscount = discount;
        bestPromotion = promo;
      }
    }

    return {
      applicable,
      bestPromotion,
      discount: round2(bestDiscount),
      finalTotal: round2(params.cartTotal - bestDiscount),
    };
  },
};
