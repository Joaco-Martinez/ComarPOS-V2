/**
 * Alta, edicion, imagen y componentes de productos.
 * Extraido de product.service.ts (doc seccion 4.1 - modularizacion).
 */
import prisma from "../../prisma";
import { ProductType, Product, SaleUnit } from "@prisma/client";
import type { Express } from "express";
import cloudinary from "../../config/cloudinary";
import alertService from "../alert.service";
import { tenantScope } from "../../utils/tenantScope";
import { currentTenantId } from "../../context/tenantContext";
import { planLimitsService } from "../planLimits.service";
import {
  normalizeSku,
  toNumberOrNull,
  toNumberOrZero,
  isTrue,
  safeDeleteLocalFile,
  normalizeComponents,
  validateCategory,
  validateComponents,
  validatePricesBySaleUnit,
  productInclude,
  type CreateProductInput,
  type ProductComponentInput,
} from "./product.helpers";

export async function create(data: CreateProductInput) {
  if (!data.name || !data.name.trim()) {
    return { statusCode: 400, message: "El nombre del producto es requerido" };
  }

  if (!data.sku || !data.sku.trim()) {
    return { statusCode: 400, message: "El SKU es requerido" };
  }

  const sku = normalizeSku(data.sku);

  if (!sku) {
    return { statusCode: 400, message: "El SKU no puede quedar vacío" };
  }

  const limitCheck = await planLimitsService.checkLimit(currentTenantId(), "products");
  if (!limitCheck.ok) {
    safeDeleteLocalFile(data.file?.path);
    return { statusCode: 403, message: limitCheck.message };
  }

  const type: ProductType = (data.type as ProductType) ?? ProductType.SIMPLE;
  const saleUnit: SaleUnit = (data.saleUnit as SaleUnit) ?? SaleUnit.UNIT;

  let imageUrl: string | undefined;
  let imageId: string | undefined;

  try {
    await validateCategory(data.categoryId);

    validatePricesBySaleUnit({
      ...data,
      type,
      saleUnit,
    });

    const rawComponents = normalizeComponents(data);

    if (type === ProductType.COMPUESTO && rawComponents.length === 0) {
      safeDeleteLocalFile(data.file?.path);

      return {
        statusCode: 400,
        message: "Un producto COMPUESTO debe tener al menos un componente",
      };
    }

    if (type === ProductType.SIMPLE && rawComponents.length > 0) {
      safeDeleteLocalFile(data.file?.path);

      return {
        statusCode: 400,
        message: "Un producto SIMPLE no puede tener componentes",
      };
    }

    const components = await validateComponents(null, rawComponents);

    if (data.file) {
      try {
        const result = await cloudinary.uploader.upload(data.file.path, {
          folder: "grupo-vj/products",
          resource_type: "image",
        });

        imageUrl = result.secure_url;
        imageId = result.public_id;
      } catch {
        // Cloudinary sin credenciales reales (CLOUDINARY_* en .env) tira un
        // error crudo tipo "Unknown API key CHANGE_ME" que no le dice nada al
        // usuario. Es un problema de configuracion, no del producto en si -
        // pero no creamos el producto sin la imagen que el usuario eligio a
        // proposito, para no perder silenciosamente lo que pidio subir.
        throw new Error(
          "No se pudo subir la imagen: el servicio de imágenes no está configurado (CLOUDINARY_* en .env). Probá crear el producto sin imagen, o pedile al administrador que lo configure."
        );
      } finally {
        safeDeleteLocalFile(data.file.path);
      }
    }

    const base = {
      name: data.name.trim(),
      description: data.description?.trim() || null,
      type,
      categoryId: data.categoryId || null,
      saleUnit,
      sku,
      isService: isTrue(data.isService),
      purchasePrice: toNumberOrZero(data.purchasePrice),
      ivaRate: data.ivaRate !== undefined ? toNumberOrZero(data.ivaRate) : 21,
      imageUrl,
      imageId,
    };

    const unitData =
      saleUnit === SaleUnit.UNIT
        ? {
            price: toNumberOrZero(data.price),
            // clientPrice ya no se pide en el form (doc "solo 2 precios") -
            // se espeja el precio de lista para que la columna, si algo
            // viejo todavia la lee, nunca quede desincronizada.
            clientPrice: toNumberOrZero(data.price),
            wholesalePrice: toNumberOrZero(data.wholesalePrice),
            pricePerKg: null,
            clientPricePerKg: null,
            wholesalePricePerKg: null,
          }
        : {
            pricePerKg: toNumberOrZero(data.pricePerKg),
            clientPricePerKg: toNumberOrZero(data.pricePerKg),
            wholesalePricePerKg: toNumberOrZero(data.wholesalePricePerKg),
            price: 0,
            clientPrice: 0,
            wholesalePrice: 0,
          };

    const created = await prisma.product.create({
      data: {
        ...base,
        ...unitData,
        tenantId: currentTenantId(),
        ...(type === ProductType.COMPUESTO
          ? {
              components: {
                create: components.map((component) => ({
                  componentId: component.componentId!,
                  quantity: component.quantity,
                  quantityKg: component.quantityKg,
                })),
              },
            }
          : {}),
      },
    });

    // Arranca con stock en 0 en cada ubicacion activa del tenant - el
    // negocio carga cantidades despues desde Stock/Compras/Conteo (ver doc
    // de migracion "ubicaciones de stock dinamicas").
    const locations = await prisma.businessLocation.findMany({
      where: { isActive: true, ...tenantScope() },
      select: { id: true },
    });
    if (locations.length > 0) {
      await prisma.productStock.createMany({
        data: locations.map((loc) => ({
          productId: created.id,
          businessLocationId: loc.id,
          tenantId: currentTenantId(),
        })),
        skipDuplicates: true,
      });
    }

    await alertService.checkProductStock(created.id);

    return prisma.product.findUnique({ where: { id: created.id }, include: productInclude });
  } catch (err: any) {
    safeDeleteLocalFile(data.file?.path);

    if (imageId) {
      await cloudinary.uploader.destroy(imageId).catch(() => undefined);
    }

    if (err?.code === "P2002" && err?.meta?.target?.includes("sku")) {
      return { statusCode: 409, message: "Ya existe un producto con ese SKU" };
    }

    return {
      statusCode: 400,
      message: err?.message ?? "Error al crear producto",
    };
  }
}

export async function updateImage(productId: string, file: Express.Multer.File) {
  const product = await prisma.product.findFirst({
    where: { id: productId, ...tenantScope() },
  });

  if (!product) {
    safeDeleteLocalFile(file?.path);
    throw new Error("Producto no encontrado");
  }

  let newImageId: string | undefined;

  try {
    const result = await cloudinary.uploader.upload(file.path, {
      folder: "grupo-vj/products",
      resource_type: "image",
    });

    newImageId = result.public_id;

    safeDeleteLocalFile(file.path);

    if (product.imageId) {
      await cloudinary.uploader.destroy(product.imageId).catch(() => undefined);
    }

    return prisma.product.update({
      where: { id: productId },
      data: {
        imageUrl: result.secure_url,
        imageId: result.public_id,
      },
      include: productInclude,
    });
  } catch {
    safeDeleteLocalFile(file?.path);

    if (newImageId) {
      await cloudinary.uploader.destroy(newImageId).catch(() => undefined);
    }

    // Mismo caso que en create(): sin credenciales reales de Cloudinary el
    // error crudo (ej. "Unknown API key CHANGE_ME") no dice nada util.
    throw new Error(
      "No se pudo subir la imagen: el servicio de imágenes no está configurado (CLOUDINARY_* en .env)."
    );
  }
}

export async function update(id: string, data: Partial<Product> & any) {
  const existing = await prisma.product.findFirst({
    where: { id, ...tenantScope() },
    include: {
      components: true,
    },
  });

  if (!existing) {
    throw new Error("Producto no encontrado");
  }

  if (data.sku !== undefined) {
    const normalized = normalizeSku(String(data.sku));
    if (!normalized) throw new Error("El SKU no puede quedar vacío");
    data.sku = normalized;
  }

  if (data.categoryId !== undefined && data.categoryId !== null && data.categoryId !== "") {
    await validateCategory(data.categoryId);
  }

  const nextType = (data.type as ProductType | undefined) ?? existing.type;
  const nextSaleUnit = (data.saleUnit as SaleUnit | undefined) ?? existing.saleUnit;

  if (nextType === ProductType.COMPUESTO && nextSaleUnit === SaleUnit.KG) {
    throw new Error("Por ahora los productos COMPUESTOS deben venderse por UNIT");
  }

  const prismaData: any = {};

  const setIfDefined = (key: string, value: any) => {
    if (value !== undefined) prismaData[key] = value;
  };

  setIfDefined("name", data.name !== undefined ? String(data.name).trim() : undefined);

  setIfDefined(
    "description",
    data.description !== undefined ? String(data.description).trim() || null : undefined
  );

  setIfDefined("type", data.type);
  setIfDefined("categoryId", data.categoryId === "" ? null : data.categoryId);
  setIfDefined("sku", data.sku);
  setIfDefined("imageUrl", data.imageUrl);
  setIfDefined("imageId", data.imageId);
  setIfDefined("isActive", data.isActive);
  setIfDefined("isService", data.isService !== undefined ? isTrue(data.isService) : undefined);
  setIfDefined("saleUnit", data.saleUnit);

  setIfDefined("price", data.price !== undefined ? Number(data.price) : undefined);

  // clientPrice ya no se edita (doc "solo 2 precios") - se espeja el precio
  // de lista cada vez que este cambia, para que la columna nunca quede
  // desincronizada por si algo viejo todavia la lee.
  setIfDefined(
    "clientPrice",
    data.price !== undefined ? Number(data.price) : undefined
  );

  setIfDefined(
    "wholesalePrice",
    data.wholesalePrice !== undefined ? Number(data.wholesalePrice) : undefined
  );

  setIfDefined(
    "purchasePrice",
    data.purchasePrice !== undefined ? Number(data.purchasePrice) : undefined
  );

  setIfDefined(
    "ivaRate",
    data.ivaRate !== undefined ? Number(data.ivaRate) : undefined
  );

  setIfDefined(
    "pricePerKg",
    data.pricePerKg !== undefined ? Number(data.pricePerKg) : undefined
  );

  // Igual que clientPrice: se espeja pricePerKg, ya no se edita directo.
  setIfDefined(
    "clientPricePerKg",
    data.pricePerKg !== undefined ? Number(data.pricePerKg) : undefined
  );

  setIfDefined(
    "wholesalePricePerKg",
    data.wholesalePricePerKg !== undefined ? Number(data.wholesalePricePerKg) : undefined
  );

  if (data.saleUnit === SaleUnit.UNIT) {
    prismaData.pricePerKg = null;
    prismaData.clientPricePerKg = null;
    prismaData.wholesalePricePerKg = null;
  }

  if (data.saleUnit === SaleUnit.KG) {
    prismaData.price = 0;
    prismaData.clientPrice = 0;
    prismaData.wholesalePrice = 0;
  }

  try {
    const updated = await prisma.product.update({
      where: { id },
      data: prismaData,
      include: productInclude,
    });

    await alertService.checkProductStock(updated.id);

    return updated;
  } catch (err: any) {
    if (err?.code === "P2002" && err?.meta?.target?.includes("sku")) {
      throw new Error("Ya existe un producto con ese SKU");
    }

    throw err;
  }
}

export async function updateComponents(productId: string, components: ProductComponentInput[]) {
  const product = await prisma.product.findFirst({
    where: { id: productId, ...tenantScope() },
    select: {
      id: true,
      type: true,
      name: true,
      saleUnit: true,
    },
  });

  if (!product) throw new Error("Producto no encontrado");

  if (product.type !== ProductType.COMPUESTO) {
    throw new Error(`El producto "${product.name}" no es de tipo COMPUESTO`);
  }

  const normalizedComponents = await validateComponents(productId, components);

  await prisma.$transaction([
    prisma.productComponent.deleteMany({
      where: { compositeId: productId },
    }),
    prisma.productComponent.createMany({
      data: normalizedComponents.map((component) => ({
        compositeId: productId,
        componentId: component.componentId!,
        quantity: component.quantity,
        quantityKg: component.quantityKg,
      })),
    }),
  ]);

  return prisma.product.findUnique({
    where: { id: productId },
    include: productInclude,
  });
}

export async function deleteProduct(id: string) {
  const existing = await prisma.product.findFirst({
    where: { id, ...tenantScope() },
    select: { id: true },
  });

  if (!existing) throw new Error("Producto no encontrado");

  return prisma.product.update({
    where: { id },
    data: { isActive: false },
  });
}
