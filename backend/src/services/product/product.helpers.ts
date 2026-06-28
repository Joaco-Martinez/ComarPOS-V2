/**
 * Helpers internos del servicio de productos.
 * Extraidos de product.service.ts (doc seccion 4.1 - modularizacion).
 */
import prisma from "../../prisma";
import {
  ProductType,
  Location,
  MovementType,
  Product,
  SaleUnit,
} from "@prisma/client";
import type { Express } from "express";
import cloudinary from "../../config/cloudinary";
import fs from "fs";
import alertService from "../alert.service";
import { tenantScope } from "../../utils/tenantScope";

function normalizeSku(raw: string): string {
  return raw
    .trim()
    .replace(/['"]/g, "")
    .replace(/\s+/g, "");
}

function toNumberOrNull(v: any) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toNumberOrZero(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isValidPositiveNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

function isTrue(value: any) {
  return value === true || value === "true";
}

function safeDeleteLocalFile(path?: string) {
  if (path && fs.existsSync(path)) {
    fs.unlinkSync(path);
  }
}

export type ProductComponentInput = {
  componentId?: string;
  productId?: string;
  quantity?: number | string;
  quantityKg?: number | string;
};

export type GetProductsOptions = {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  sort?: string;
};

export type CreateProductInput = {
  name: string;
  description?: string | null;

  type?: ProductType;
  price?: number | string;
  wholesalePrice?: number | string;
  clientPrice?: number | string;
  purchasePrice?: number | string;
  ivaRate?: number | string;
  isService?: boolean | string;

  categoryId?: string;
  category?: string;

  saleUnit?: SaleUnit | "UNIT" | "KG";
  pricePerKg?: number | string;
  clientPricePerKg?: number | string;
  wholesalePricePerKg?: number | string;
  stockLocalKg?: number | string;
  stockDepositoKg?: number | string;
  minStockKg?: number | string;
  minStockDepositoKg?: number | string;

  sku: string;

  minStock?: number | string;
  minStockDeposito?: number | string;
  stockLocal?: number | string;
  stockDeposito?: number | string;

  file?: Express.Multer.File;

  components?: ProductComponentInput[];
  boxContents?: { productId: string; quantity: number; quantityKg?: number }[];
};

function normalizeComponents(data: CreateProductInput | any): ProductComponentInput[] {
  if (Array.isArray(data.components)) return data.components;

  if (Array.isArray(data.boxContents)) {
    return data.boxContents.map((item: any) => ({
      componentId: item.productId,
      quantity: item.quantity,
      quantityKg: item.quantityKg,
    }));
  }

  return [];
}

async function validateCategory(categoryId?: string | null) {
  if (!categoryId) return;

  const category = await prisma.productCategory.findFirst({
    where: { id: categoryId, ...tenantScope() },
    select: { id: true, isActive: true },
  });

  if (!category) {
    throw new Error("La categoría seleccionada no existe");
  }

  if (!category.isActive) {
    throw new Error("La categoría seleccionada está inactiva");
  }
}

async function validateComponents(
  compositeId: string | null,
  components: ProductComponentInput[]
) {
  const normalized = components.map((c) => {
    const componentId = c.componentId ?? c.productId;

    return {
      componentId,
      quantity: toNumberOrNull(c.quantity),
      quantityKg: toNumberOrNull(c.quantityKg),
    };
  });

  const seen = new Set<string>();

  for (const c of normalized) {
    if (!c.componentId) {
      throw new Error("Cada componente debe tener componentId");
    }

    if (compositeId && c.componentId === compositeId) {
      throw new Error("Un producto no puede ser componente de sí mismo");
    }

    if (seen.has(c.componentId)) {
      throw new Error("No podés repetir el mismo componente dentro de una promo");
    }

    seen.add(c.componentId);

    const hasUnitQty = c.quantity !== null && c.quantity > 0;
    const hasKgQty = c.quantityKg !== null && c.quantityKg > 0;

    if (!hasUnitQty && !hasKgQty) {
      throw new Error("Cada componente debe tener quantity o quantityKg mayor a 0");
    }

    const componentProduct = await prisma.product.findFirst({
      where: { id: c.componentId, ...tenantScope() },
      select: {
        id: true,
        name: true,
        type: true,
        saleUnit: true,
        isActive: true,
      },
    });

    if (!componentProduct) {
      throw new Error(`Componente ${c.componentId} no encontrado`);
    }

    if (!componentProduct.isActive) {
      throw new Error(`El componente "${componentProduct.name}" está inactivo`);
    }

    if (componentProduct.type === ProductType.COMPUESTO) {
      throw new Error(
        `El componente "${componentProduct.name}" es COMPUESTO. Por ahora no se permiten promos dentro de promos`
      );
    }

    if (componentProduct.saleUnit === SaleUnit.UNIT && hasKgQty) {
      throw new Error(
        `El componente "${componentProduct.name}" se vende por unidad, no por KG`
      );
    }

    if (componentProduct.saleUnit === SaleUnit.KG && hasUnitQty) {
      throw new Error(
        `El componente "${componentProduct.name}" se vende por KG, no por unidad`
      );
    }
  }

  return normalized;
}

function validatePricesBySaleUnit(data: CreateProductInput | any) {
  if (isTrue(data.isService)) {
    return;
  }

  const saleUnit: SaleUnit = (data.saleUnit as SaleUnit) ?? SaleUnit.UNIT;
  const type: ProductType = (data.type as ProductType) ?? ProductType.SIMPLE;

  if (saleUnit === SaleUnit.KG) {
    const pricePerKg = toNumberOrNull(data.pricePerKg);
    const clientPricePerKg = toNumberOrNull(data.clientPricePerKg);
    const wholesalePricePerKg = toNumberOrNull(data.wholesalePricePerKg);

    if (pricePerKg === null) {
      throw new Error("Si saleUnit es KG, pricePerKg es requerido");
    }

    if (clientPricePerKg === null) {
      throw new Error("Si saleUnit es KG, clientPricePerKg es requerido");
    }

    if (wholesalePricePerKg === null) {
      throw new Error("Si saleUnit es KG, wholesalePricePerKg es requerido");
    }

    if (!isValidPositiveNumber(pricePerKg)) {
      throw new Error("Si saleUnit es KG, pricePerKg debe ser mayor a 0");
    }

    if (!isValidPositiveNumber(clientPricePerKg)) {
      throw new Error("Si saleUnit es KG, clientPricePerKg debe ser mayor a 0");
    }

    if (!isValidPositiveNumber(wholesalePricePerKg)) {
      throw new Error("Si saleUnit es KG, wholesalePricePerKg debe ser mayor a 0");
    }
  }

  if (saleUnit === SaleUnit.UNIT) {
    const price = toNumberOrNull(data.price);
    const clientPrice = toNumberOrNull(data.clientPrice);
    const wholesalePrice = toNumberOrNull(data.wholesalePrice);

    if (price === null) {
      throw new Error("Si saleUnit es UNIT, price es requerido");
    }

    if (clientPrice === null) {
      throw new Error("Si saleUnit es UNIT, clientPrice es requerido");
    }

    if (wholesalePrice === null) {
      throw new Error("Si saleUnit es UNIT, wholesalePrice es requerido");
    }

    if (!isValidPositiveNumber(price)) {
      throw new Error("Si saleUnit es UNIT, price debe ser mayor a 0");
    }

    if (!isValidPositiveNumber(clientPrice)) {
      throw new Error("Si saleUnit es UNIT, clientPrice debe ser mayor a 0");
    }

    if (!isValidPositiveNumber(wholesalePrice)) {
      throw new Error("Si saleUnit es UNIT, wholesalePrice debe ser mayor a 0");
    }
  }

  if (type === ProductType.COMPUESTO && saleUnit === SaleUnit.KG) {
    throw new Error("Por ahora los productos COMPUESTOS deben venderse por UNIT");
  }
}

const productInclude = {
  category: true,
  components: {
    include: {
      component: {
        include: {
          category: true,
        },
      },
    },
  },
  usedIn: {
    include: {
      composite: true,
    },
  },
};


export {
  normalizeSku,
  toNumberOrNull,
  toNumberOrZero,
  isValidPositiveNumber,
  isTrue,
  safeDeleteLocalFile,
  normalizeComponents,
  validateCategory,
  validateComponents,
  validatePricesBySaleUnit,
  productInclude,
};
