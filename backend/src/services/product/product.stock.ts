/**
 * Transferencias e ingresos de stock (por unidad y por KG), contra
 * ProductStock (una fila por producto x ubicacion). Reemplaza el split
 * fijo Location.LOCAL/DEPOSITO - ver doc de migracion "ubicaciones de
 * stock dinamicas". Extraido de product.service.ts (doc seccion 4.1).
 */
import prisma from "../../prisma";
import { Prisma, ProductType, MovementType, SaleUnit } from "@prisma/client";
import alertService from "../alert.service";
import { tenantScope } from "../../utils/tenantScope";
import { currentTenantId } from "../../context/tenantContext";

const stockInclude = { stock: { include: { businessLocation: true } } } as const;

async function requireProduct(productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, ...tenantScope() } });
  if (!product) throw new Error("Producto no encontrado");
  return product;
}

async function requireLocation(businessLocationId: string, label: string) {
  const location = await prisma.businessLocation.findFirst({ where: { id: businessLocationId, ...tenantScope() } });
  if (!location) throw new Error(`Ubicación de ${label} no encontrada`);
  return location;
}

async function getOrCreateStockRow(tx: Prisma.TransactionClient, productId: string, businessLocationId: string) {
  const existing = await tx.productStock.findUnique({
    where: { productId_businessLocationId: { productId, businessLocationId } },
  });
  if (existing) return existing;
  return tx.productStock.create({
    data: { productId, businessLocationId, tenantId: currentTenantId() },
  });
}

export async function transferStock(
  productId: string,
  fromLocationId: string,
  toLocationId: string,
  quantity: number,
  userId: string,
  reason?: string | null
) {
  if (!userId) throw new Error("Falta userId en la operación de transferencia");
  if (!fromLocationId || !toLocationId) throw new Error("Faltan las ubicaciones de origen y destino");
  if (fromLocationId === toLocationId) throw new Error("El origen y el destino tienen que ser distintos");

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Cantidad inválida");

  const product = await requireProduct(productId);
  if (product.saleUnit !== SaleUnit.UNIT) throw new Error("Este producto no se maneja por unidades");
  if (product.type === ProductType.COMPUESTO) {
    throw new Error("No se transfiere stock directo de productos compuestos. Transferí sus componentes");
  }

  const fromLocation = await requireLocation(fromLocationId, "origen");
  await requireLocation(toLocationId, "destino");

  await prisma.$transaction(async (tx) => {
    const fromStock = await getOrCreateStockRow(tx, productId, fromLocationId);
    if (fromStock.quantity < qty) {
      throw new Error(`Stock insuficiente en "${fromLocation.name}"`);
    }

    await tx.productStock.update({ where: { id: fromStock.id }, data: { quantity: { decrement: qty } } });
    await tx.productStock.upsert({
      where: { productId_businessLocationId: { productId, businessLocationId: toLocationId } },
      update: { quantity: { increment: qty } },
      create: { productId, businessLocationId: toLocationId, quantity: qty, tenantId: currentTenantId() },
    });

    await tx.stockMovement.create({
      data: {
        type: MovementType.TRANSFER,
        fromLocationId,
        toLocationId,
        quantity: qty,
        reason: reason ?? null,
        tenantId: currentTenantId(),
        productId,
        userId,
      },
    });
  }, { timeout: 15000, maxWait: 15000 });

  await alertService.checkProductStock(productId);

  return prisma.product.findFirst({ where: { id: productId }, include: stockInclude });
}

export async function transferStockKg(
  productId: string,
  fromLocationId: string,
  toLocationId: string,
  quantityKg: number,
  userId: string,
  reason?: string | null
) {
  if (!userId) throw new Error("Falta userId en la operación de transferencia");
  if (!fromLocationId || !toLocationId) throw new Error("Faltan las ubicaciones de origen y destino");
  if (fromLocationId === toLocationId) throw new Error("El origen y el destino tienen que ser distintos");

  const qty = Number(quantityKg);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Cantidad KG inválida");

  const product = await requireProduct(productId);
  if (product.saleUnit !== SaleUnit.KG) throw new Error("Este producto no es por KG");
  if (product.type === ProductType.COMPUESTO) {
    throw new Error("No se transfiere stock directo de productos compuestos. Transferí sus componentes");
  }

  const fromLocation = await requireLocation(fromLocationId, "origen");
  await requireLocation(toLocationId, "destino");

  await prisma.$transaction(async (tx) => {
    const fromStock = await getOrCreateStockRow(tx, productId, fromLocationId);
    if (fromStock.quantityKg < qty) {
      throw new Error(`Stock insuficiente en "${fromLocation.name}" (KG)`);
    }

    await tx.productStock.update({ where: { id: fromStock.id }, data: { quantityKg: { decrement: qty } } });
    await tx.productStock.upsert({
      where: { productId_businessLocationId: { productId, businessLocationId: toLocationId } },
      update: { quantityKg: { increment: qty } },
      create: { productId, businessLocationId: toLocationId, quantityKg: qty, tenantId: currentTenantId() },
    });

    await tx.stockMovement.create({
      data: {
        type: MovementType.TRANSFER,
        fromLocationId,
        toLocationId,
        quantityKg: qty,
        reason: reason ?? null,
        tenantId: currentTenantId(),
        productId,
        userId,
      },
    });
  }, { timeout: 15000, maxWait: 15000 });

  await alertService.checkProductStock(productId);

  return prisma.product.findFirst({ where: { id: productId }, include: stockInclude });
}

export async function addStock(
  productId: string,
  businessLocationId: string,
  quantity: number,
  userId: string,
  reason?: string | null
) {
  if (!userId) throw new Error("Falta userId en la operación de ingreso");
  if (!businessLocationId) throw new Error("Falta la ubicación de destino");

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Cantidad inválida");

  const product = await requireProduct(productId);
  if (product.saleUnit !== SaleUnit.UNIT) throw new Error("Este producto no se maneja por unidades");
  if (product.type === ProductType.COMPUESTO) {
    throw new Error("No se agrega stock directo a productos compuestos. Agregá stock a sus componentes");
  }

  await requireLocation(businessLocationId, "destino");

  await prisma.$transaction(async (tx) => {
    await tx.productStock.upsert({
      where: { productId_businessLocationId: { productId, businessLocationId } },
      update: { quantity: { increment: qty } },
      create: { productId, businessLocationId, quantity: qty, tenantId: currentTenantId() },
    });

    await tx.stockMovement.create({
      data: {
        productId,
        userId,
        type: MovementType.INGRESS,
        toLocationId: businessLocationId,
        quantity: qty,
        reason: reason ?? null,
        tenantId: currentTenantId(),
      },
    });
  }, { timeout: 15000, maxWait: 15000 });

  await alertService.checkProductStock(productId);

  return prisma.product.findFirst({ where: { id: productId }, include: stockInclude });
}

/**
 * Umbral de alerta de stock bajo, por producto x ubicacion. Vive en
 * ProductStock (ver doc de migracion "ubicaciones de stock dinamicas") -
 * ya no se edita desde el form de producto, se edita acá junto a la
 * cantidad (página Stock).
 */
export async function setStockMin(
  productId: string,
  businessLocationId: string,
  minQuantity: number | null,
  minQuantityKg: number | null
) {
  await requireProduct(productId);
  await requireLocation(businessLocationId, "destino");

  return prisma.productStock.upsert({
    where: { productId_businessLocationId: { productId, businessLocationId } },
    update: { minQuantity, minQuantityKg },
    create: { productId, businessLocationId, minQuantity, minQuantityKg, tenantId: currentTenantId() },
  });
}

export async function addStockKg(
  productId: string,
  businessLocationId: string,
  quantityKg: number,
  userId: string,
  reason?: string | null
) {
  if (!userId) throw new Error("Falta userId en la operación de ingreso");
  if (!businessLocationId) throw new Error("Falta la ubicación de destino");

  const qty = Number(quantityKg);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Cantidad KG inválida");

  const product = await requireProduct(productId);
  if (product.saleUnit !== SaleUnit.KG) throw new Error("Este producto no es por KG");
  if (product.type === ProductType.COMPUESTO) {
    throw new Error("No se agrega stock directo a productos compuestos. Agregá stock a sus componentes");
  }

  await requireLocation(businessLocationId, "destino");

  await prisma.$transaction(async (tx) => {
    await tx.productStock.upsert({
      where: { productId_businessLocationId: { productId, businessLocationId } },
      update: { quantityKg: { increment: qty } },
      create: { productId, businessLocationId, quantityKg: qty, tenantId: currentTenantId() },
    });

    await tx.stockMovement.create({
      data: {
        productId,
        userId,
        type: MovementType.INGRESS,
        toLocationId: businessLocationId,
        quantityKg: qty,
        reason: reason ?? null,
        tenantId: currentTenantId(),
      },
    });
  }, { timeout: 15000, maxWait: 15000 });

  await alertService.checkProductStock(productId);

  return prisma.product.findFirst({ where: { id: productId }, include: stockInclude });
}
