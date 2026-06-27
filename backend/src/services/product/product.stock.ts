/**
 * Transferencias e ingresos de stock (por unidad y por KG).
 * Extraido de product.service.ts (doc seccion 4.1 - modularizacion).
 */
import prisma from "../../prisma";
import { ProductType, Location, MovementType, SaleUnit } from "@prisma/client";
import alertService from "../alert.service";
import { tenantScope } from "../../utils/tenantScope";
import { currentTenantId } from "../../context/tenantContext";

export async function transferStock(productId: string, from: Location, quantity: number, userId: string) {
  if (!userId) throw new Error("Falta userId en la operación de transferencia");

  const qty = Number(quantity);

  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Cantidad inválida");
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, ...tenantScope() },
  });

  if (!product) throw new Error("Producto no encontrado");

  if (product.saleUnit !== SaleUnit.UNIT) {
    throw new Error("Este producto no se maneja por unidades");
  }

  if (product.type === ProductType.COMPUESTO) {
    throw new Error("No se transfiere stock directo de productos compuestos. Transferí sus componentes");
  }

  const to = from === Location.DEPOSITO ? Location.LOCAL : Location.DEPOSITO;

  if (from === Location.DEPOSITO && product.stockDeposito < qty) {
    throw new Error("Stock insuficiente en depósito");
  }

  if (from === Location.LOCAL && product.stockLocal < qty) {
    throw new Error("Stock insuficiente en local");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const productUpdated = await tx.product.update({
      where: { id: productId },
      data:
        from === Location.DEPOSITO
          ? {
              stockDeposito: { decrement: qty },
              stockLocal: { increment: qty },
            }
          : {
              stockLocal: { decrement: qty },
              stockDeposito: { increment: qty },
            },
    });

    await tx.stockMovement.create({
      data: {
        type: MovementType.TRANSFER,
        from,
        to,
        quantity: qty,
        tenantId: currentTenantId(),
        productId,
        userId,
      },
    });

    return productUpdated;
  });

  await alertService.checkProductStock(updated.id);

  return updated;
}

export async function transferStockKg(productId: string, from: Location, quantityKg: number, userId: string) {
  if (!userId) throw new Error("Falta userId en la operación de transferencia");

  const product = await prisma.product.findFirst({
    where: { id: productId, ...tenantScope() },
  });

  if (!product) throw new Error("Producto no encontrado");

  if (product.saleUnit !== SaleUnit.KG) {
    throw new Error("Este producto no es por KG");
  }

  if (product.type === ProductType.COMPUESTO) {
    throw new Error("No se transfiere stock directo de productos compuestos. Transferí sus componentes");
  }

  const qty = Number(quantityKg);

  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Cantidad KG inválida");
  }

  const to = from === Location.DEPOSITO ? Location.LOCAL : Location.DEPOSITO;

  if (from === Location.DEPOSITO && (product.stockDepositoKg ?? 0) < qty) {
    throw new Error("Stock insuficiente en depósito KG");
  }

  if (from === Location.LOCAL && (product.stockLocalKg ?? 0) < qty) {
    throw new Error("Stock insuficiente en local KG");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const productUpdated = await tx.product.update({
      where: { id: productId },
      data:
        from === Location.DEPOSITO
          ? {
              stockDepositoKg: { decrement: qty },
              stockLocalKg: { increment: qty },
            }
          : {
              stockLocalKg: { decrement: qty },
              stockDepositoKg: { increment: qty },
            },
    });

    await tx.stockMovement.create({
      data: {
        type: MovementType.TRANSFER,
        from,
        to,
        quantityKg: qty,
        tenantId: currentTenantId(),
        productId,
        userId,
      },
    });

    return productUpdated;
  });

  await alertService.checkProductStock(updated.id);

  return updated;
}

export async function addStockKg(productId: string, to: Location, quantityKg: number, userId: string) {
  if (!userId) throw new Error("Falta userId en la operación de ingreso");

  const product = await prisma.product.findFirst({
    where: { id: productId, ...tenantScope() },
  });

  if (!product) throw new Error("Producto no encontrado");

  if (product.saleUnit !== SaleUnit.KG) {
    throw new Error("Este producto no es por KG");
  }

  if (product.type === ProductType.COMPUESTO) {
    throw new Error("No se agrega stock directo a productos compuestos. Agregá stock a sus componentes");
  }

  const qty = Number(quantityKg);

  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Cantidad KG inválida");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const productUpdated = await tx.product.update({
      where: { id: productId },
      data: {
        stockLocalKg: to === Location.LOCAL ? { increment: qty } : undefined,
        stockDepositoKg: to === Location.DEPOSITO ? { increment: qty } : undefined,
      },
    });

    await tx.stockMovement.create({
      data: {
        productId,
        userId,
        type: MovementType.INGRESS,
        from: null,
        to,
        quantityKg: qty,
        tenantId: currentTenantId(),
      },
    });

    return productUpdated;
  });

  await alertService.checkProductStock(updated.id);

  return updated;
}

export async function addStock(productId: string, to: Location, quantity: number, userId: string) {
  if (!userId) throw new Error("Falta userId en la operación de ingreso");

  const qty = Number(quantity);

  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Cantidad inválida");
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, ...tenantScope() },
  });

  if (!product) throw new Error("Producto no encontrado");

  if (product.saleUnit !== SaleUnit.UNIT) {
    throw new Error("Este producto no se maneja por unidades");
  }

  if (product.type === ProductType.COMPUESTO) {
    throw new Error("No se agrega stock directo a productos compuestos. Agregá stock a sus componentes");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const productUpdated = await tx.product.update({
      where: { id: productId },
      data: {
        stockLocal: to === Location.LOCAL ? { increment: qty } : undefined,
        stockDeposito: to === Location.DEPOSITO ? { increment: qty } : undefined,
      },
    });

    await tx.stockMovement.create({
      data: {
        productId,
        userId,
        type: MovementType.INGRESS,
        from: null,
        to,
        quantity: qty,
        tenantId: currentTenantId(),
      },
    });

    return productUpdated;
  });

  await alertService.checkProductStock(updated.id);

  return updated;
}
