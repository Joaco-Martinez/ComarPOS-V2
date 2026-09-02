/**
 * Helpers internos del servicio de productos.
 * Extraidos de product.service.ts (doc seccion 4.1 - modularizacion).
 */
import prisma from "../../prisma";
import { ProductType, SaleUnit } from "@prisma/client";
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
  unlimitedStock?: boolean | string;

  categoryId?: string;
  category?: string;

  saleUnit?: SaleUnit | "UNIT" | "KG";
  pricePerKg?: number | string;
  clientPricePerKg?: number | string;
  wholesalePricePerKg?: number | string;

  sku: string;

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

  // Solo 2 precios editables (lista y mayorista) - doc "solo 2 precios".
  // clientPrice/clientPricePerKg siguen existiendo en el modelo (por si algo
  // viejo los lee) pero ya no se piden ni se validan; product.write.ts los
  // espeja siempre desde price/pricePerKg.
  // wholesalePrice/wholesalePricePerKg ya no se piden en el form (doc "listas
  // de precios" - el precio mayorista pasa a ser una lista de precios mas, no
  // un campo fijo del producto): product.write.ts los espeja automaticamente
  // desde price/pricePerKg cuando no vienen en el body. Por eso acá solo se
  // exige el precio de lista, y el mayorista se valida unicamente si vino
  // explícito (para no rechazar el alta con "es requerido" por un campo que
  // la UI nunca envía).
  if (saleUnit === SaleUnit.KG) {
    const pricePerKg = toNumberOrNull(data.pricePerKg);

    if (pricePerKg === null) {
      throw new Error("Si saleUnit es KG, pricePerKg es requerido");
    }

    if (!isValidPositiveNumber(pricePerKg)) {
      throw new Error("Si saleUnit es KG, pricePerKg debe ser mayor a 0");
    }

    if (data.wholesalePricePerKg !== undefined && !isValidPositiveNumber(data.wholesalePricePerKg)) {
      throw new Error("Si saleUnit es KG, wholesalePricePerKg debe ser mayor a 0");
    }
  }

  if (saleUnit === SaleUnit.UNIT) {
    const price = toNumberOrNull(data.price);

    if (price === null) {
      throw new Error("Si saleUnit es UNIT, price es requerido");
    }

    if (!isValidPositiveNumber(price)) {
      throw new Error("Si saleUnit es UNIT, price debe ser mayor a 0");
    }

    if (data.wholesalePrice !== undefined && !isValidPositiveNumber(data.wholesalePrice)) {
      throw new Error("Si saleUnit es UNIT, wholesalePrice debe ser mayor a 0");
    }
  }

  if (type === ProductType.COMPUESTO && saleUnit === SaleUnit.KG) {
    throw new Error("Por ahora los productos COMPUESTOS deben venderse por UNIT");
  }
}

const productInclude = {
  category: true,
  stock: { include: { businessLocation: true } },
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
