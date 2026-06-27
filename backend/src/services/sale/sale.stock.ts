/**
 * Operaciones de stock: validacion de disponibilidad, descuento y restauracion.
 * Extraidas de sale.service.ts (doc seccion 4.1 - modularizacion).
 */
import prisma from "../../prisma";
import { MovementType, SaleUnit, ProductType } from "@prisma/client";
import alertService from "../alert.service";
import { tenantScope } from "../../utils/tenantScope";
import { currentTenantId } from "../../context/tenantContext";
import { ResolvedSaleItem, StockLine, StockLocation } from "./sale.types";import {
  getStockFieldNames,
  getLocationLabel,
  shouldDiscountStock,
  round2,
} from "./sale.pricing";


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

async function validateStockAvailability(
  tx: any,
  stockLines: StockLine[],
  stockLocation: StockLocation
) {
  for (const line of stockLines) {
    const product = await tx.product.findFirst({
      where: { id: line.productId, ...tenantScope() },
      select: {
        id: true,
        name: true,
        saleUnit: true,
        stockLocal: true,
        stockDeposito: true,
        stockLocalKg: true,
        stockDepositoKg: true,
      },
    });

    if (!product) {
      throw new Error("Producto no encontrado para validar stock");
    }

    const fields = getStockFieldNames(stockLocation);
    const availableUnits = Number(product[fields.unit] ?? 0);
    const availableKg = Number(product[fields.kg] ?? 0);
    const locationLabel = getLocationLabel(stockLocation);

    if (line.quantity > 0 && availableUnits < line.quantity) {
      throw new Error(
        `Stock insuficiente en ${locationLabel} para ${product.name}. Necesitás ${line.quantity}, disponible ${availableUnits}`
      );
    }

    if (line.quantityKg > 0 && availableKg < line.quantityKg) {
      throw new Error(
        `Stock KG insuficiente en ${locationLabel} para ${product.name}. Necesitás ${line.quantityKg}, disponible ${availableKg}`
      );
    }
  }
}

async function discountStockLines(
  tx: any,
  stockLines: StockLine[],
  userId: string | undefined,
  saleId: string,
  stockLocation: StockLocation,
  pendingAlerts: string[]
) {
  for (const line of stockLines) {
    const data: any = {};
    const fields = getStockFieldNames(stockLocation);

    if (line.quantity > 0) {
      data[fields.unit] = { decrement: line.quantity };
    }

    if (line.quantityKg > 0) {
      data[fields.kg] = { decrement: line.quantityKg };
    }

    const updatedProduct = await tx.product.update({
      where: { id: line.productId },
      data,
      select: {
        id: true,
      },
    });

    const movementData: any = {
      type: MovementType.SALE,
      from: stockLocation,
      to: null,
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

    pendingAlerts.push(updatedProduct.id);
  }
}

async function restoreStockLines(
  tx: any,
  stockLines: StockLine[],
  userId: string | undefined,
  saleId: string,
  stockLocation: StockLocation,
  pendingAlerts: string[]
) {
  for (const line of stockLines) {
    const data: any = {};
    const fields = getStockFieldNames(stockLocation);

    if (line.quantity > 0) {
      data[fields.unit] = {
        increment: line.quantity,
      };
    }

    if (line.quantityKg > 0) {
      data[fields.kg] = {
        increment: line.quantityKg,
      };
    }

    const updatedProduct = await tx.product.update({
      where: {
        id: line.productId,
      },
      data,
      select: {
        id: true,
      },
    });

    pendingAlerts.push(updatedProduct.id);

    const movementData: any = {
      type: MovementType.SALE_CANCEL,
      from: null,
      to: stockLocation,
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
  validateStockAvailability,
  discountStockLines,
  restoreStockLines,
  queueStockAlerts,
};
