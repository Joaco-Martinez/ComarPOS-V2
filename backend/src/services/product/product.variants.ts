/**
 * Variantes de producto (talle, color, sabor, molienda...). Cada variante es
 * un Product "hijo" (parentId) con su SKU, precio, costo, foto y stock por
 * sucursal; el padre (hasVariants) solo agrupa: no se vende, no tiene stock,
 * no es COMPUESTO ni componente y su SKU es opcional. Asi todo lo que ya
 * funciona por productId (ProductStock, StockMovement, SaleItem, ...) sigue
 * andando sin columnas nuevas.
 *
 * La logica pura (combinaciones, label, SKU, propagacion de precio) vive en
 * product.variants.helpers.ts.
 */
import { randomUUID } from "crypto";
import prisma from "../../prisma";
import { MovementType, Prisma, ProductType, SaleUnit } from "@prisma/client";
import alertService from "../alert.service";
import { tenantScope } from "../../utils/tenantScope";
import { currentTenantId } from "../../context/tenantContext";
import { planLimitsService } from "../planLimits.service";
import { priceListService } from "../priceList.service";
import { normalizeSku, toNumberOrNull, toNumberOrZero, isTrue, productInclude } from "./product.helpers";
import {
  normalizeVariantOptions,
  buildCombinations,
  buildVariantLabel,
  buildVariantName,
  buildVariantSku,
  attributesKey,
  remapAttributes,
  uniqueSku,
  diffVariants,
  inheritedFieldsFromParent,
  priceFieldsFromParent,
  variantSyncData,
  pricesDifferFromParent,
  costDiffersFromParent,
  type VariantOption,
  type VariantAttributes,
} from "./product.variants.helpers";

type Tx = Prisma.TransactionClient;

export type VariantInitialStock = {
  businessLocationId: string;
  quantity?: number | string;
  quantityKg?: number | string;
  minQuantity?: number | string;
  minQuantityKg?: number | string;
};

export type VariantInput = {
  id?: string;
  attributes?: VariantAttributes;
  sku?: string | null;
  price?: number | string | null;
  wholesalePrice?: number | string | null;
  pricePerKg?: number | string | null;
  wholesalePricePerKg?: number | string | null;
  customPrice?: boolean | string;
  purchasePrice?: number | string | null;
  customCost?: boolean | string;
  isActive?: boolean | string;
  initialStock?: VariantInitialStock[];
};

const TX_OPTIONS = { timeout: 60000, maxWait: 15000 } as const;

export const variantsInclude = {
  variants: {
    include: { stock: { include: { businessLocation: true } } },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

export function parseVariantInputs(raw: unknown): VariantInput[] {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error("Las variantes no tienen un formato válido");
    }
  }
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("Las variantes no tienen un formato válido");
  return value as VariantInput[];
}

/** Tira si el producto es un padre con variantes (no se vende ni tiene stock). */
export function assertNotParent(product: { hasVariants?: boolean | null; name: string }) {
  if (product.hasVariants) {
    throw new Error(`Elegí una variante de "${product.name}"`);
  }
}

function readOptions(raw: unknown): VariantOption[] | null {
  if (!raw) return null;
  try {
    return normalizeVariantOptions(raw);
  } catch {
    return null;
  }
}

async function loadTakenSkus(tx: Tx, excludeIds: string[] = []) {
  const rows = await tx.product.findMany({
    where: { ...tenantScope(), sku: { not: null }, ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}) },
    select: { sku: true },
  });
  return new Set(rows.map((r) => String(r.sku).toUpperCase()));
}

// Igual criterio que generateSku() (PRD-000001...), pero generando varios en
// la misma operacion sin chocar entre si.
async function makeSkuGenerator(tx: Tx, taken: Set<string>) {
  let seq = (await tx.product.count({ where: { ...tenantScope() } })) + 1;
  return () => {
    let candidate = `PRD-${String(seq).padStart(6, "0")}`;
    while (taken.has(candidate)) {
      seq += 1;
      candidate = `PRD-${String(seq).padStart(6, "0")}`;
    }
    taken.add(candidate);
    seq += 1;
    return candidate;
  };
}

function resolveVariantSku(
  input: VariantInput | undefined,
  parentSku: string | null,
  attributes: VariantAttributes,
  options: VariantOption[],
  taken: Set<string>,
  generate: () => string
) {
  const explicit = input?.sku !== undefined && input?.sku !== null ? normalizeSku(String(input.sku)) : "";

  if (explicit) {
    if (taken.has(explicit.toUpperCase())) {
      throw new Error(`Ya existe un producto con el SKU "${explicit}"`);
    }
    taken.add(explicit.toUpperCase());
    return explicit;
  }

  const fromParent = buildVariantSku(parentSku, attributes, options);
  return fromParent ? uniqueSku(fromParent, taken) : generate();
}

/** Precio/costo de una variante nueva o editada desde la grilla. */
function resolveVariantPricing(parent: any, input: VariantInput | undefined, current?: any) {
  const base = priceFieldsFromParent(parent);
  const isKg = parent.saleUnit === SaleUnit.KG;

  const given = {
    price: toNumberOrNull(input?.price),
    wholesalePrice: toNumberOrNull(input?.wholesalePrice),
    pricePerKg: toNumberOrNull(input?.pricePerKg),
    wholesalePricePerKg: toNumberOrNull(input?.wholesalePricePerKg),
  };

  for (const [key, value] of Object.entries(given)) {
    if (value !== null && value < 0) throw new Error(`El precio (${key}) no puede ser negativo`);
  }

  const wantsCustom =
    input?.customPrice !== undefined
      ? isTrue(input.customPrice)
      : pricesDifferFromParent(parent, {
          price: isKg ? undefined : given.price ?? undefined,
          wholesalePrice: isKg ? undefined : given.wholesalePrice ?? undefined,
          pricePerKg: isKg ? given.pricePerKg ?? undefined : undefined,
          wholesalePricePerKg: isKg ? given.wholesalePricePerKg ?? undefined : undefined,
        }) || Boolean(current?.customPrice && Object.values(given).every((v) => v === null));

  const priceData = wantsCustom
    ? isKg
      ? {
          price: 0,
          clientPrice: 0,
          wholesalePrice: 0,
          pricePerKg: given.pricePerKg ?? current?.pricePerKg ?? base.pricePerKg,
          clientPricePerKg: given.pricePerKg ?? current?.pricePerKg ?? base.pricePerKg,
          wholesalePricePerKg:
            given.wholesalePricePerKg ?? given.pricePerKg ?? current?.wholesalePricePerKg ?? base.wholesalePricePerKg,
        }
      : {
          price: given.price ?? current?.price ?? base.price,
          clientPrice: given.price ?? current?.price ?? base.price,
          wholesalePrice: given.wholesalePrice ?? given.price ?? current?.wholesalePrice ?? base.wholesalePrice,
          pricePerKg: null,
          clientPricePerKg: null,
          wholesalePricePerKg: null,
        }
    : base;

  const cost = toNumberOrNull(input?.purchasePrice);
  if (cost !== null && cost < 0) throw new Error("El costo no puede ser negativo");

  const wantsCustomCost =
    input?.customCost !== undefined
      ? isTrue(input.customCost)
      : cost !== null
        ? costDiffersFromParent(parent, cost)
        : Boolean(current?.customCost);

  const purchasePrice = wantsCustomCost
    ? cost ?? current?.purchasePrice ?? parent.purchasePrice ?? 0
    : parent.purchasePrice ?? 0;

  return { ...priceData, customPrice: wantsCustom, purchasePrice, customCost: wantsCustomCost };
}

function findInputFor(inputs: VariantInput[], attributes: VariantAttributes, options: VariantOption[]) {
  const key = attributesKey(attributes, options);
  return inputs.find((i) => {
    if (!i.attributes) return false;
    const remapped = remapAttributes(i.attributes, null, options);
    return remapped ? attributesKey(remapped, options) === key : false;
  });
}

/**
 * Crea las variantes indicadas de un padre (ya creado), cada una con su
 * fila de stock en cada sucursal activa (con stock inicial si vino) y su
 * movimiento de INGRESS por el stock inicial. Devuelve los ids creados.
 */
async function createVariantsTx(
  tx: Tx,
  parent: any,
  options: VariantOption[],
  combos: VariantAttributes[],
  inputs: VariantInput[],
  userId?: string,
  takenSkus?: Set<string>
) {
  if (combos.length === 0) return [] as string[];

  const tenantId = currentTenantId();
  const taken = takenSkus ?? (await loadTakenSkus(tx));
  const generate = await makeSkuGenerator(tx, taken);

  const locations = await tx.businessLocation.findMany({
    where: { isActive: true, ...tenantScope() },
    select: { id: true },
  });

  const rows: Prisma.ProductCreateManyInput[] = [];
  const stockRows: Prisma.ProductStockCreateManyInput[] = [];
  const movements: Prisma.StockMovementCreateManyInput[] = [];

  for (const attributes of combos) {
    const input = findInputFor(inputs, attributes, options);
    const id = randomUUID();
    const label = buildVariantLabel(attributes, options);

    rows.push({
      id,
      tenantId,
      parentId: parent.id,
      type: ProductType.SIMPLE,
      variantAttributes: attributes,
      variantLabel: label,
      name: buildVariantName(parent.name, label),
      sku: resolveVariantSku(input, parent.sku ?? null, attributes, options, taken, generate),
      isActive: input?.isActive !== undefined ? isTrue(input.isActive) : true,
      ...inheritedFieldsFromParent(parent),
      ...resolveVariantPricing(parent, input),
    });

    const initialByLocation = new Map<string, VariantInitialStock>();
    for (const entry of input?.initialStock ?? []) {
      if (entry?.businessLocationId) initialByLocation.set(entry.businessLocationId, entry);
    }

    for (const loc of locations) {
      const initial = initialByLocation.get(loc.id);
      const quantity = Math.max(0, toNumberOrZero(initial?.quantity));
      const quantityKg = Math.max(0, toNumberOrZero(initial?.quantityKg));

      stockRows.push({
        productId: id,
        businessLocationId: loc.id,
        tenantId,
        quantity: parent.saleUnit === SaleUnit.KG ? 0 : quantity,
        quantityKg: parent.saleUnit === SaleUnit.KG ? quantityKg : 0,
        minQuantity: toNumberOrNull(initial?.minQuantity),
        minQuantityKg: toNumberOrNull(initial?.minQuantityKg),
      });

      const movedQty = parent.saleUnit === SaleUnit.KG ? quantityKg : quantity;
      if (userId && movedQty > 0) {
        movements.push({
          productId: id,
          userId,
          type: MovementType.INGRESS,
          toLocationId: loc.id,
          quantity: parent.saleUnit === SaleUnit.KG ? null : quantity,
          quantityKg: parent.saleUnit === SaleUnit.KG ? quantityKg : null,
          reason: "Stock inicial (alta de variante)",
          tenantId,
        });
      }
    }
  }

  await tx.product.createMany({ data: rows });
  if (stockRows.length) await tx.productStock.createMany({ data: stockRows, skipDuplicates: true });
  if (movements.length) await tx.stockMovement.createMany({ data: movements });

  return rows.map((r) => r.id as string);
}

async function syncDefaultPriceListForVariants(variantIds: string[]) {
  if (variantIds.length === 0) return;
  const variants = await prisma.product.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, price: true, pricePerKg: true },
  });
  for (const v of variants) {
    await priceListService.syncDefaultPriceListItem(currentTenantId(), v);
  }
}

async function checkAlerts(variantIds: string[]) {
  for (const id of variantIds) {
    await alertService.checkProductStock(id);
  }
}

/**
 * true si la variante tiene algo que la ate a la historia del negocio
 * (ventas, compras, movimientos, stock...). Una variante asi no se borra:
 * se desactiva.
 */
async function hasHistory(tx: Tx, productId: string) {
  const where = { productId };
  const counts = await Promise.all([
    tx.saleItem.count({ where }),
    tx.stockMovement.count({ where }),
    tx.purchaseItem.count({ where }),
    tx.purchaseOrderItem.count({ where }),
    tx.returnItem.count({ where }),
    tx.stockCountItem.count({ where }),
    tx.orderItem.count({ where }),
    tx.remitoItem.count({ where }),
    tx.repairOrderItem.count({ where }),
    tx.boxContent.count({ where }),
    tx.productComponent.count({ where: { componentId: productId } }),
    tx.productStock.count({ where: { productId, OR: [{ quantity: { gt: 0 } }, { quantityKg: { gt: 0 } }] } }),
  ]);
  return counts.some((c) => c > 0);
}

async function removeOrDeactivateVariant(tx: Tx, variantId: string) {
  if (await hasHistory(tx, variantId)) {
    await tx.product.update({ where: { id: variantId }, data: { isActive: false } });
    return "deactivated" as const;
  }

  await tx.productStock.deleteMany({ where: { productId: variantId } });
  await tx.priceListItem.deleteMany({ where: { productId: variantId } });
  await tx.alert.deleteMany({ where: { productId: variantId } });
  await tx.productStats.deleteMany({ where: { productId: variantId } });
  await tx.product.delete({ where: { id: variantId } });
  return "deleted" as const;
}

/**
 * Alta de un producto con variantes: crea el padre (sin stock, sin fila en
 * la lista de precios default) y todas las combinaciones, en una sola
 * transaccion. `parentData` ya viene armado por create() (product.write.ts).
 */
export async function createParentWithVariants(params: {
  parentData: Prisma.ProductUncheckedCreateInput;
  variantOptions: unknown;
  variants: unknown;
  userId?: string;
}) {
  const options = normalizeVariantOptions(params.variantOptions);
  const inputs = parseVariantInputs(params.variants);

  if (params.parentData.type === ProductType.COMPUESTO) {
    throw new Error("Un producto con variantes no puede ser COMPUESTO");
  }

  // Si el front mando la lista de combinaciones, se crean esas; si no mando
  // lista, se crean todas.
  const allCombos = buildCombinations(options);
  const explicitList = params.variants !== undefined && params.variants !== null && params.variants !== "";
  const combos = explicitList
    ? allCombos.filter((c) => Boolean(findInputFor(inputs, c, options)))
    : allCombos;

  if (combos.length === 0) {
    throw new Error("Elegí al menos una combinación de variantes");
  }

  const parentId = await prisma.$transaction(async (tx) => {
    const taken = await loadTakenSkus(tx);
    const parentSku = params.parentData.sku ? String(params.parentData.sku) : null;
    if (parentSku && taken.has(parentSku.toUpperCase())) {
      throw new Error("Ya existe un producto con ese SKU");
    }
    if (parentSku) taken.add(parentSku.toUpperCase());

    const parent = await tx.product.create({
      data: {
        ...params.parentData,
        type: ProductType.SIMPLE,
        sku: parentSku,
        hasVariants: true,
        variantOptions: options,
      },
    });

    const ids = await createVariantsTx(tx, parent, options, combos, inputs, params.userId, taken);
    return { parentId: parent.id, ids };
  }, TX_OPTIONS);

  await syncDefaultPriceListForVariants(parentId.ids);
  await checkAlerts(parentId.ids);

  return prisma.product.findUnique({
    where: { id: parentId.parentId },
    include: { ...productInclude, ...variantsInclude },
  });
}

/**
 * Sincroniza las combinaciones de un padre con sus opciones (nuevas o las
 * que ya tiene): crea las que faltan, desactiva las que sobran con historial
 * y borra las que no tienen ninguno. Tambien aplica ediciones por variante
 * que vengan en `variants` (sku, precio, costo, activo).
 */
export async function syncVariants(
  parentId: string,
  payload: { variantOptions?: unknown; variants?: unknown },
  userId?: string
) {
  const parent = await prisma.product.findFirst({
    where: { id: parentId, ...tenantScope() },
    include: { variants: true },
  });

  if (!parent) throw new Error("Producto no encontrado");
  if (!parent.hasVariants) throw new Error(`"${parent.name}" no es un producto con variantes`);

  const previousOptions = readOptions(parent.variantOptions);
  const options =
    payload.variantOptions !== undefined
      ? normalizeVariantOptions(payload.variantOptions)
      : previousOptions ?? normalizeVariantOptions(parent.variantOptions);
  const inputs = parseVariantInputs(payload.variants);

  const { keep, create, remove } = diffVariants(parent.variants, previousOptions, options);

  // Si mandaron la lista de variantes (aunque venga vacia), solo se crean
  // las combinaciones nuevas que vienen en ella; sin lista, se crean todas.
  const explicitList = payload.variants !== undefined && payload.variants !== null;
  const toCreate = explicitList
    ? create.filter((c) => Boolean(findInputFor(inputs.filter((i) => !i.id), c, options)))
    : create;

  const result = await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id: parent.id }, data: { variantOptions: options } });

    const taken = await loadTakenSkus(tx);

    for (const { variant, attributes } of keep) {
      const input = inputs.find((i) => i.id === variant.id);
      const label = buildVariantLabel(attributes, options);
      const data: Prisma.ProductUncheckedUpdateInput = {
        variantAttributes: attributes,
        variantLabel: label,
        ...variantSyncData(parent, { ...variant, variantLabel: label }),
      };

      if (input) {
        if (input.sku !== undefined && input.sku !== null) {
          const sku = normalizeSku(String(input.sku));
          if (!sku) throw new Error("El SKU de la variante no puede quedar vacío");
          if (sku.toUpperCase() !== String(variant.sku ?? "").toUpperCase()) {
            if (taken.has(sku.toUpperCase())) throw new Error(`Ya existe un producto con el SKU "${sku}"`);
            taken.add(sku.toUpperCase());
            data.sku = sku;
          }
        }
        if (input.isActive !== undefined) data.isActive = isTrue(input.isActive);
        Object.assign(data, resolveVariantPricing(parent, input, variant));
      }

      await tx.product.update({ where: { id: variant.id }, data });
    }

    const removed = { deleted: 0, deactivated: 0 };
    for (const variant of remove) {
      const outcome = await removeOrDeactivateVariant(tx, variant.id);
      removed[outcome] += 1;
    }

    const createdIds = await createVariantsTx(
      tx,
      parent,
      options,
      toCreate,
      inputs.filter((i) => !i.id),
      userId,
      taken
    );

    return { createdIds, removed };
  }, TX_OPTIONS);

  await syncDefaultPriceListForVariants([...keep.map((k) => k.variant.id), ...result.createdIds]);
  await checkAlerts(result.createdIds);

  const product = await prisma.product.findUnique({
    where: { id: parent.id },
    include: { ...productInclude, ...variantsInclude },
  });

  return { product, created: result.createdIds.length, ...result.removed };
}

/**
 * Convierte un producto existente en uno con variantes (decision de negocio
 * 2):
 * - "first_variant": se crea un padre nuevo con los datos del producto y el
 *   producto original pasa a ser una variante (conserva id, SKU, stock,
 *   ventas y movimientos). `attributes` dice que combinacion es.
 * - "fresh": el original queda como esta (o se desactiva si se pide) y se
 *   crea un padre nuevo con variantes nuevas sin stock.
 */
export async function convertToVariants(
  productId: string,
  payload: {
    mode?: string;
    variantOptions?: unknown;
    attributes?: VariantAttributes | string;
    deactivateOriginal?: boolean | string;
    parentSku?: string | null;
    variants?: unknown;
  },
  userId?: string
) {
  const mode = payload.mode === "fresh" ? "fresh" : payload.mode === "first_variant" ? "first_variant" : null;
  if (!mode) throw new Error('Indicá cómo convertir el producto: "first_variant" o "fresh"');

  const original = await prisma.product.findFirst({ where: { id: productId, ...tenantScope() } });
  if (!original) throw new Error("Producto no encontrado");
  if (original.hasVariants) throw new Error(`"${original.name}" ya tiene variantes`);
  if (original.parentId) throw new Error("Una variante no puede tener variantes propias");
  if (original.type === ProductType.COMPUESTO) {
    throw new Error("Un producto COMPUESTO no se puede convertir a producto con variantes");
  }

  const options = normalizeVariantOptions(payload.variantOptions);
  const inputs = parseVariantInputs(payload.variants);
  const parentSku = payload.parentSku ? normalizeSku(String(payload.parentSku)) : null;

  if (mode === "fresh") {
    const limitCheck = await planLimitsService.checkLimit(currentTenantId(), "products");
    if (!limitCheck.ok) throw new Error(limitCheck.message);
  }

  let originalAttributes: VariantAttributes | null = null;
  if (mode === "first_variant") {
    let rawAttrs: unknown = payload.attributes;
    if (typeof rawAttrs === "string") {
      try {
        rawAttrs = JSON.parse(rawAttrs);
      } catch {
        rawAttrs = null;
      }
    }
    originalAttributes = remapAttributes((rawAttrs as VariantAttributes) ?? null, null, options);
    if (!originalAttributes) {
      throw new Error("Indicá qué valor de cada opción le corresponde al producto actual");
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const taken = await loadTakenSkus(tx);
    if (parentSku) {
      if (taken.has(parentSku.toUpperCase())) throw new Error("Ya existe un producto con ese SKU");
      taken.add(parentSku.toUpperCase());
    }

    const parent = await tx.product.create({
      data: {
        tenantId: currentTenantId(),
        name: original.name,
        description: original.description,
        type: ProductType.SIMPLE,
        categoryId: original.categoryId,
        supplierId: original.supplierId,
        saleUnit: original.saleUnit,
        isService: original.isService,
        unlimitedStock: original.unlimitedStock,
        ivaRate: original.ivaRate,
        price: original.price,
        clientPrice: original.clientPrice,
        wholesalePrice: original.wholesalePrice,
        pricePerKg: original.pricePerKg,
        clientPricePerKg: original.clientPricePerKg,
        wholesalePricePerKg: original.wholesalePricePerKg,
        purchasePrice: original.purchasePrice,
        sku: parentSku,
        // En "first_variant" la foto pasa al padre (la variante sin foto
        // muestra la del padre); en "fresh" no se comparte la misma imagen
        // de Cloudinary entre dos productos, para que reemplazar una no
        // rompa la otra.
        ...(mode === "first_variant" ? { imageUrl: original.imageUrl, imageId: original.imageId } : {}),
        hasVariants: true,
        variantOptions: options,
      },
    });

    let combos = buildCombinations(options);

    if (mode === "first_variant" && originalAttributes) {
      const label = buildVariantLabel(originalAttributes, options);
      await tx.product.update({
        where: { id: original.id },
        data: {
          parentId: parent.id,
          variantAttributes: originalAttributes,
          variantLabel: label,
          name: buildVariantName(parent.name, label),
          imageUrl: null,
          imageId: null,
          customPrice: false,
          customCost: false,
        },
      });

      const originalKey = attributesKey(originalAttributes, options);
      combos = combos.filter((c) => attributesKey(c, options) !== originalKey);
    } else if (isTrue(payload.deactivateOriginal)) {
      await tx.product.update({ where: { id: original.id }, data: { isActive: false } });
    }

    if (inputs.some((i) => i.attributes)) {
      combos = combos.filter((c) => Boolean(findInputFor(inputs, c, options)));
    }

    const ids = await createVariantsTx(tx, parent, options, combos, inputs, userId, taken);
    return { parentId: parent.id, ids };
  }, TX_OPTIONS);

  await syncDefaultPriceListForVariants(result.ids);

  return prisma.product.findUnique({
    where: { id: result.parentId },
    include: { ...productInclude, ...variantsInclude },
  });
}

/**
 * "Volver al precio general": la variante deja de tener precio/costo propio
 * y copia el del padre.
 */
export async function resetVariantPrice(variantId: string, target: "price" | "cost" | "both" = "both") {
  const variant = await prisma.product.findFirst({
    where: { id: variantId, ...tenantScope() },
    include: { parent: true },
  });

  if (!variant) throw new Error("Producto no encontrado");
  if (!variant.parentId || !variant.parent) throw new Error("Este producto no es una variante");

  const data: Prisma.ProductUncheckedUpdateInput = {};

  if (target === "price" || target === "both") {
    Object.assign(data, priceFieldsFromParent(variant.parent), { customPrice: false });
  }
  if (target === "cost" || target === "both") {
    Object.assign(data, { purchasePrice: variant.parent.purchasePrice ?? 0, customCost: false });
  }

  const updated = await prisma.product.update({ where: { id: variant.id }, data, include: productInclude });
  await priceListService.syncDefaultPriceListItem(currentTenantId(), updated);
  return updated;
}

/**
 * Despues de editar un padre: propaga a todas sus variantes los campos
 * heredados, el nombre y el precio/costo (salvo las personalizadas). Si el
 * padre se desactivo, desactiva tambien todas sus variantes.
 */
export async function propagateParentToVariants(tx: Tx, parentId: string) {
  const parent = await tx.product.findUnique({ where: { id: parentId }, include: { variants: true } });
  if (!parent || !parent.hasVariants) return [] as string[];

  for (const variant of parent.variants) {
    await tx.product.update({
      where: { id: variant.id },
      data: {
        ...variantSyncData(parent, variant),
        ...(parent.isActive ? {} : { isActive: false }),
      },
    });
  }

  return parent.variants.map((v) => v.id);
}

export async function syncDefaultPriceListAfterPropagation(variantIds: string[]) {
  await syncDefaultPriceListForVariants(variantIds);
}

/**
 * Aplica el mismo stock minimo a todas las variantes de un padre en una
 * sucursal (accion "minimo para todas" de la pagina Stock).
 */
export async function setStockMinForAllVariants(
  parentId: string,
  businessLocationId: string,
  minQuantity: number | null,
  minQuantityKg: number | null
) {
  if (minQuantity != null && (!Number.isFinite(minQuantity) || minQuantity < 0)) {
    throw new Error("El stock mínimo no puede ser negativo");
  }
  if (minQuantityKg != null && (!Number.isFinite(minQuantityKg) || minQuantityKg < 0)) {
    throw new Error("El stock mínimo (KG) no puede ser negativo");
  }

  const parent = await prisma.product.findFirst({
    where: { id: parentId, ...tenantScope() },
    include: { variants: { select: { id: true } } },
  });
  if (!parent) throw new Error("Producto no encontrado");
  if (!parent.hasVariants) throw new Error(`"${parent.name}" no es un producto con variantes`);

  const location = await prisma.businessLocation.findFirst({ where: { id: businessLocationId, ...tenantScope() } });
  if (!location) throw new Error("Ubicación de destino no encontrada");

  await prisma.$transaction(
    parent.variants.map((v) =>
      prisma.productStock.upsert({
        where: { productId_businessLocationId: { productId: v.id, businessLocationId } },
        update: { minQuantity, minQuantityKg },
        create: { productId: v.id, businessLocationId, minQuantity, minQuantityKg, tenantId: currentTenantId() },
      })
    )
  );

  await checkAlerts(parent.variants.map((v) => v.id));

  return { updated: parent.variants.length };
}
