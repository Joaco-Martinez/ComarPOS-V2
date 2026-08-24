/**
 * Operaciones de stock: validacion de disponibilidad, descuento y restauracion.
 * Contra ProductStock (producto x ubicacion dinamica) - reemplaza el split
 * fijo Location.LOCAL/DEPOSITO, ver doc de migracion "ubicaciones de stock
 * dinamicas". Extraidas de sale.service.ts (doc seccion 4.1 - modularizacion).
 */
import prisma from "../../prisma";
import { MovementType, SaleUnit, ProductType } from "@prisma/client";
import alertService from "../alert.service";
import { tenantScope } from "../../utils/tenantScope";
import { currentTenantId } from "../../context/tenantContext";
import { ResolvedSaleItem, StockLine } from "./sale.types";
import { shouldDiscountStock } from "./sale.pricing";

function addStockLine(map: Map<string, StockLine>, line: StockLine) {
  const existing = map.get(line.productId);

  if (!existing) {
    map.set(line.productId, {
      productId: line.productId,
      quantity: line.quantity,
      quantityKg: line.quantityKg,
      reason: line.reason,
    });

    return;
  }

  existing.quantity += line.quantity;
  existing.quantityKg += line.quantityKg;
}

function buildStockLines(items: ResolvedSaleItem[]) {
  const stockMap = new Map<string, StockLine>();

  for (const item of items) {
    if (!shouldDiscountStock(item)) {
      continue;
    }

    const soldQty =
      item.saleUnit === SaleUnit.KG ? item.quantityKg ?? 0 : item.quantity;

    if (item.productType !== ProductType.COMPUESTO) {
      addStockLine(stockMap, {
        productId: item.productId,
        quantity: item.saleUnit === SaleUnit.UNIT ? item.quantity : 0,
        quantityKg: item.saleUnit === SaleUnit.KG ? item.quantityKg ?? 0 : 0,
        reason: `Venta de ${item.productName}`,
      });

      continue;
    }

    for (const component of item.components) {
      addStockLine(stockMap, {
        productId: component.productId,
        quantity: component.quantity ? component.quantity * soldQty : 0,
        quantityKg: component.quantityKg ? component.quantityKg * soldQty : 0,
        reason: `Componente de ${item.productName}`,
      });
    }
  }

  return Array.from(stockMap.values()).filter(
    (line) => line.quantity > 0 || line.quantityKg > 0
  );
}

/** Valida que la ubicación exista y pertenezca al tenant. Tira si no. */
async function requireStockLocationId(stockLocationId: unknown): Promise<string> {
  if (typeof stockLocationId !== "string" || !stockLocationId) {
    throw new Error("Falta la ubicación de stock de la venta");
  }
  const location = await prisma.businessLocation.findFirst({
    where: { id: stockLocationId, ...tenantScope() },
  });
  if (!location) throw new Error("La ubicación de stock indicada no existe");
  return location.id;
}

async function getStockRowsByProduct(tx: any, productIds: string[], businessLocationId: string) {
  const rows = await tx.productStock.findMany({
    where: { productId: { in: productIds }, businessLocationId },
  });
  return new Map<string, { id: string; quantity: number; quantityKg: number }>(
    rows.map((row: any) => [row.productId, row])
  );
}

async function validateStockAvailability(
  tx: any,
  stockLines: StockLine[],
  stockLocationId: string
) {
  if (stockLines.length === 0) return;

  const location = await tx.businessLocation.findFirst({
    where: { id: stockLocationId, ...tenantScope() },
  });
  if (!location) throw new Error("La ubicación de stock indicada no existe");

  const products = await tx.product.findMany({
    where: { id: { in: stockLines.map((l) => l.productId) }, ...tenantScope() },
    select: { id: true, name: true },
  });
  const productById = new Map(products.map((p: any) => [p.id, p]));

  const stockByProduct = await getStockRowsByProduct(
    tx,
    stockLines.map((l) => l.productId),
    stockLocationId
  );

  for (const line of stockLines) {
    const product: any = productById.get(line.productId);
    if (!product) throw new Error("Producto no encontrado para validar stock");

    const stockRow = stockByProduct.get(line.productId);
    const availableUnits = Number(stockRow?.quantity ?? 0);
    const availableKg = Number(stockRow?.quantityKg ?? 0);

    if (line.quantity > 0 && availableUnits < line.quantity) {
      throw new Error(
        `Stock insuficiente en "${location.name}" para ${product.name}. Necesitás ${line.quantity}, disponible ${availableUnits}`
      );
    }

    if (line.quantityKg > 0 && availableKg < line.quantityKg) {
      throw new Error(
        `Stock KG insuficiente en "${location.name}" para ${product.name}. Necesitás ${line.quantityKg}, disponible ${availableKg}`
      );
    }
  }
}

async function discountStockLines(
  tx: any,
  stockLines: StockLine[],
  userId: string | undefined,
  saleId: string,
  stockLocationId: string,
  pendingAlerts: string[]
) {
  for (const line of stockLines) {
    await tx.productStock.upsert({
      where: { productId_businessLocationId: { productId: line.productId, businessLocationId: stockLocationId } },
      update: {
        ...(line.quantity > 0 ? { quantity: { decrement: line.quantity } } : {}),
        ...(line.quantityKg > 0 ? { quantityKg: { decrement: line.quantityKg } } : {}),
      },
      create: {
        productId: line.productId,
        businessLocationId: stockLocationId,
        quantity: line.quantity > 0 ? -line.quantity : 0,
        quantityKg: line.quantityKg > 0 ? -line.quantityKg : 0,
        tenantId: currentTenantId(),
      },
    });

    const movementData: any = {
      type: MovementType.SALE,
      fromLocationId: stockLocationId,
      quantity: line.quantity > 0 ? line.quantity : null,
      quantityKg: line.quantityKg > 0 ? line.quantityKg : null,
      reason: line.reason,
      reference: saleId,
      tenantId: currentTenantId(),
      productId: line.productId,
    };

    if (userId) {
      movementData.userId = userId;
    }

    await tx.stockMovement.create({
      data: movementData,
    });

    pendingAlerts.push(line.productId);
  }
}

async function restoreStockLines(
  tx: any,
  stockLines: StockLine[],
  userId: string | undefined,
  saleId: string,
  stockLocationId: string,
  pendingAlerts: string[]
) {
  for (const line of stockLines) {
    await tx.productStock.upsert({
      where: { productId_businessLocationId: { productId: line.productId, businessLocationId: stockLocationId } },
      update: {
        ...(line.quantity > 0 ? { quantity: { increment: line.quantity } } : {}),
        ...(line.quantityKg > 0 ? { quantityKg: { increment: line.quantityKg } } : {}),
      },
      create: {
        productId: line.productId,
        businessLocationId: stockLocationId,
        quantity: line.quantity > 0 ? line.quantity : 0,
        quantityKg: line.quantityKg > 0 ? line.quantityKg : 0,
        tenantId: currentTenantId(),
      },
    });

    pendingAlerts.push(line.productId);

    const movementData: any = {
      type: MovementType.SALE_CANCEL,
      toLocationId: stockLocationId,
      quantity: line.quantity > 0 ? line.quantity : null,
      quantityKg: line.quantityKg > 0 ? line.quantityKg : null,
      reason: "Cancelación de venta",
      reference: saleId,
      tenantId: currentTenantId(),
      productId: line.productId,
    };

    if (userId) {
      movementData.userId = userId;
    }

    await tx.stockMovement.create({
      data: movementData,
    });
  }
}

function queueStockAlerts(productIds: string[]) {
  const uniqueProductIds = [...new Set(productIds)];

  if (uniqueProductIds.length === 0) return;

  void Promise.all(
    uniqueProductIds.map(async (productId) => {
      try {
        await alertService.checkProductStock(productId);
      } catch (error) {
        console.error("Error revisando alerta de stock:", error);
      }
    })
  );
}

export {
  addStockLine,
  buildStockLines,
  requireStockLocationId,
  validateStockAvailability,
  discountStockLines,
  restoreStockLines,
  queueStockAlerts,
};
