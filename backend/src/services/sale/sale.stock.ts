/**
 * Operaciones de stock: validacion de disponibilidad, descuento y restauracion.
 * Contra ProductStock (producto x ubicacion dinamica) - reemplaza el split
 * fijo Location.LOCAL/DEPOSITO, ver doc de migracion "ubicaciones de stock
 * dinamicas". Extraidas de sale.service.ts (doc seccion 4.1 - modularizacion).
 */
import prisma from "../../prisma";
import { MovementType, SaleUnit, ProductType, NotificationType } from "@prisma/client";
import alertService from "../alert.service";
import { notificationService } from "../notification.service";
import { tenantScope } from "../../utils/tenantScope";
import { currentTenantId } from "../../context/tenantContext";
import { ResolvedSaleItem, StockLine, DELIVERY_SKU, LEGACY_DELIVERY_SKU } from "./sale.types";
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

/**
 * Resuelve de que sucursal sale el stock de la venta, cruzando lo que mando
 * el front (data.stockLocationId) con la sucursal de base del usuario que
 * vende (doc "puntos de venta separados", User.defaultBusinessLocationId).
 *
 * - Si el usuario tiene restrictToDefaultLocation prendido, su sucursal de
 *   base MANDA siempre - si ademas mando un stockLocationId distinto, se
 *   rechaza en vez de pisarlo en silencio (separacion real, no un default
 *   sugerido que se puede saltear con un click en el POS).
 * - Si no esta restringido, lo que mando el front sigue mandando como
 *   siempre; su sucursal de base solo se usa como fallback si no mando nada
 *   (por si el frontend todavia no la preselecciono).
 */
async function resolveStockLocationId(
  userId: string | null | undefined,
  stockLocationId: unknown
): Promise<string> {
  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { defaultBusinessLocationId: true, restrictToDefaultLocation: true },
      })
    : null;

  const requested = typeof stockLocationId === "string" && stockLocationId ? stockLocationId : null;

  if (user?.restrictToDefaultLocation && user.defaultBusinessLocationId) {
    if (requested && requested !== user.defaultBusinessLocationId) {
      throw new Error("Tu usuario solo puede vender desde su sucursal asignada");
    }
    return requireStockLocationId(user.defaultBusinessLocationId);
  }

  return requireStockLocationId(requested ?? user?.defaultBusinessLocationId);
}

async function getStockRowsByProduct(tx: any, productIds: string[], businessLocationId: string) {
  const rows = await tx.productStock.findMany({
    where: { productId: { in: productIds }, businessLocationId },
  });
  return new Map<string, { id: string; quantity: number; quantityKg: number }>(
    rows.map((row: any) => [row.productId, row])
  );
}

/** Uso de una ubicacion de respaldo en una venta (ver allocateStockLines). */
type StockFallbackUse = {
  productId: string;
  productName: string;
  fromLocationId: string;
  fromLocationName: string;
  primaryLocationName: string;
  quantity: number;
  quantityKg: number;
};

type StockAllocation = {
  line: StockLine;
  locationId: string;
  quantity: number;
  quantityKg: number;
  isFallback: boolean;
};

/**
 * Ubicaciones de respaldo del tenant (Configuracion > Stock), en orden de
 * prioridad, sin la ubicacion de la venta y solo las que siguen activas.
 * Vacio si la opcion esta apagada.
 */
async function getFallbackLocations(tx: any, stockLocationId: string) {
  const tenantId = currentTenantId();
  if (!tenantId) return [];

  const tenant = await tx.tenant.findUnique({
    where: { id: tenantId },
    select: { stockFallbackEnabled: true, stockFallbackLocationIds: true },
  });
  if (!tenant?.stockFallbackEnabled) return [];

  const ids: string[] = (tenant.stockFallbackLocationIds ?? []).filter((id: string) => id !== stockLocationId);
  if (ids.length === 0) return [];

  const locations = await tx.businessLocation.findMany({
    where: { id: { in: ids }, isActive: true, ...tenantScope() },
    select: { id: true, name: true },
  });
  const byId = new Map<string, { id: string; name: string }>(locations.map((l: any) => [l.id, l]));
  return ids.map((id) => byId.get(id)).filter((l): l is { id: string; name: string } => !!l);
}

/**
 * Reparte cada linea de stock entre la ubicacion de la venta y, si no
 * alcanza y el tenant tiene stock de respaldo prendido, las ubicaciones de
 * respaldo en orden. Sin respaldo, todo sale de la ubicacion de la venta
 * (comportamiento de siempre). Tira si entre todas no alcanza.
 */
async function allocateStockLines(tx: any, stockLines: StockLine[], stockLocationId: string) {
  const allocations: StockAllocation[] = [];
  const fallbackUses: StockFallbackUse[] = [];
  if (stockLines.length === 0) return { allocations, fallbackUses };

  const location = await tx.businessLocation.findFirst({
    where: { id: stockLocationId, ...tenantScope() },
  });
  if (!location) throw new Error("La ubicación de stock indicada no existe");

  const products = await tx.product.findMany({
    where: { id: { in: stockLines.map((l) => l.productId) }, ...tenantScope() },
    select: { id: true, name: true },
  });
  const productById = new Map(products.map((p: any) => [p.id, p]));

  const productIds = stockLines.map((l) => l.productId);
  const fallbackLocations = await getFallbackLocations(tx, stockLocationId);
  const sources = [
    { id: location.id as string, name: location.name as string, isFallback: false },
    ...fallbackLocations.map((l) => ({ ...l, isFallback: true })),
  ];
  const stockBySource = new Map<string, Map<string, { quantity: number; quantityKg: number }>>();
  for (const source of sources) {
    stockBySource.set(source.id, await getStockRowsByProduct(tx, productIds, source.id));
  }

  for (const line of stockLines) {
    const product: any = productById.get(line.productId);
    if (!product) throw new Error("Producto no encontrado para validar stock");

    let pendingUnits = line.quantity;
    let pendingKg = line.quantityKg;
    let availableUnitsTotal = 0;
    let availableKgTotal = 0;

    for (const source of sources) {
      const row = stockBySource.get(source.id)?.get(line.productId);
      const availableUnits = Math.max(0, Number(row?.quantity ?? 0));
      const availableKg = Math.max(0, Number(row?.quantityKg ?? 0));
      availableUnitsTotal += availableUnits;
      availableKgTotal += availableKg;

      const takeUnits = Math.min(pendingUnits, availableUnits);
      const takeKg = Math.min(pendingKg, availableKg);
      if (takeUnits <= 0 && takeKg <= 0) continue;

      pendingUnits -= takeUnits;
      pendingKg -= takeKg;
      allocations.push({ line, locationId: source.id, quantity: takeUnits, quantityKg: takeKg, isFallback: source.isFallback });

      if (source.isFallback) {
        fallbackUses.push({
          productId: line.productId,
          productName: product.name,
          fromLocationId: source.id,
          fromLocationName: source.name,
          primaryLocationName: location.name,
          quantity: takeUnits,
          quantityKg: takeKg,
        });
      }
    }

    const where = fallbackLocations.length > 0
      ? `"${location.name}" ni en el stock de respaldo`
      : `"${location.name}"`;

    if (pendingUnits > 0) {
      throw new Error(
        `Stock insuficiente en ${where} para ${product.name}. Necesitás ${line.quantity}, disponible ${availableUnitsTotal}`
      );
    }

    if (pendingKg > 1e-9) {
      throw new Error(
        `Stock KG insuficiente en ${where} para ${product.name}. Necesitás ${line.quantityKg}, disponible ${availableKgTotal}`
      );
    }
  }

  return { allocations, fallbackUses };
}

async function validateStockAvailability(
  tx: any,
  stockLines: StockLine[],
  stockLocationId: string
) {
  await allocateStockLines(tx, stockLines, stockLocationId);
}

/**
 * Descuenta el stock de la venta. Devuelve lo que se tomo de ubicaciones de
 * respaldo (vacio si alcanzo con la de la venta) para avisar con
 * notifyStockFallback() una vez confirmada la transaccion.
 */
async function discountStockLines(
  tx: any,
  stockLines: StockLine[],
  userId: string | undefined,
  saleId: string,
  stockLocationId: string,
  pendingAlerts: string[]
): Promise<StockFallbackUse[]> {
  const { allocations, fallbackUses } = await allocateStockLines(tx, stockLines, stockLocationId);
  const primaryLocationName = fallbackUses[0]?.primaryLocationName;

  for (const { line, locationId, quantity, quantityKg, isFallback } of allocations) {
    await tx.productStock.upsert({
      where: { productId_businessLocationId: { productId: line.productId, businessLocationId: locationId } },
      update: {
        ...(quantity > 0 ? { quantity: { decrement: quantity } } : {}),
        ...(quantityKg > 0 ? { quantityKg: { decrement: quantityKg } } : {}),
      },
      create: {
        productId: line.productId,
        businessLocationId: locationId,
        quantity: quantity > 0 ? -quantity : 0,
        quantityKg: quantityKg > 0 ? -quantityKg : 0,
        tenantId: currentTenantId(),
      },
    });

    const movementData: any = {
      type: MovementType.SALE,
      fromLocationId: locationId,
      quantity: quantity > 0 ? quantity : null,
      quantityKg: quantityKg > 0 ? quantityKg : null,
      reason: isFallback
        ? `${line.reason} (stock de respaldo, sin stock en "${primaryLocationName}")`
        : line.reason,
      reference: saleId,
      isStockFallback: isFallback,
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

  return fallbackUses;
}

/**
 * Lo que esta venta todavia tiene "prestado" de ubicaciones distintas a la
 * suya (stock de respaldo): SALE desde esa ubicacion menos SALE_CANCEL hacia
 * ella, por producto. Al restaurar se devuelve primero ahi, asi el stock
 * vuelve a donde salio en vez de inflar la ubicacion de la venta.
 */
async function getOutstandingFallbackStock(tx: any, saleId: string, productIds: string[], stockLocationId: string) {
  const movements = await tx.stockMovement.findMany({
    where: {
      reference: saleId,
      productId: { in: productIds },
      type: { in: [MovementType.SALE, MovementType.SALE_CANCEL] },
      ...tenantScope(),
    },
    select: { productId: true, type: true, fromLocationId: true, toLocationId: true, quantity: true, quantityKg: true },
    orderBy: { createdAt: "asc" },
  });

  // productId -> locationId -> cantidad todavia prestada
  const outstanding = new Map<string, Map<string, { quantity: number; quantityKg: number }>>();
  for (const m of movements) {
    const isSale = m.type === MovementType.SALE;
    const locationId = isSale ? m.fromLocationId : m.toLocationId;
    if (!locationId || locationId === stockLocationId) continue;

    if (!outstanding.has(m.productId)) outstanding.set(m.productId, new Map());
    const byLocation = outstanding.get(m.productId)!;
    const current = byLocation.get(locationId) ?? { quantity: 0, quantityKg: 0 };
    const sign = isSale ? 1 : -1;
    current.quantity += sign * Number(m.quantity ?? 0);
    current.quantityKg += sign * Number(m.quantityKg ?? 0);
    byLocation.set(locationId, current);
  }
  return outstanding;
}

async function restoreStockLines(
  tx: any,
  stockLines: StockLine[],
  userId: string | undefined,
  saleId: string,
  stockLocationId: string,
  pendingAlerts: string[]
) {
  const outstanding = stockLines.length > 0
    ? await getOutstandingFallbackStock(tx, saleId, stockLines.map((l) => l.productId), stockLocationId)
    : new Map<string, Map<string, { quantity: number; quantityKg: number }>>();

  for (const line of stockLines) {
    let pendingUnits = line.quantity;
    let pendingKg = line.quantityKg;
    const targets: { locationId: string; quantity: number; quantityKg: number }[] = [];

    for (const [locationId, owed] of outstanding.get(line.productId) ?? new Map()) {
      const units = Math.min(pendingUnits, Math.max(0, owed.quantity));
      const kg = Math.min(pendingKg, Math.max(0, owed.quantityKg));
      if (units <= 0 && kg <= 0) continue;
      targets.push({ locationId, quantity: units, quantityKg: kg });
      owed.quantity -= units;
      owed.quantityKg -= kg;
      pendingUnits -= units;
      pendingKg -= kg;
    }

    if (pendingUnits > 0 || pendingKg > 0) {
      targets.push({ locationId: stockLocationId, quantity: pendingUnits, quantityKg: pendingKg });
    }

    for (const target of targets) {
      await tx.productStock.upsert({
        where: { productId_businessLocationId: { productId: line.productId, businessLocationId: target.locationId } },
        update: {
          ...(target.quantity > 0 ? { quantity: { increment: target.quantity } } : {}),
          ...(target.quantityKg > 0 ? { quantityKg: { increment: target.quantityKg } } : {}),
        },
        create: {
          productId: line.productId,
          businessLocationId: target.locationId,
          quantity: target.quantity > 0 ? target.quantity : 0,
          quantityKg: target.quantityKg > 0 ? target.quantityKg : 0,
          tenantId: currentTenantId(),
        },
      });

      const movementData: any = {
        type: MovementType.SALE_CANCEL,
        toLocationId: target.locationId,
        quantity: target.quantity > 0 ? target.quantity : null,
        quantityKg: target.quantityKg > 0 ? target.quantityKg : null,
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

    pendingAlerts.push(line.productId);
  }
}

/**
 * Avisa a los ADMIN (campanita + push) que una venta tuvo que tomar stock de
 * una ubicacion de respaldo. Fire-and-forget, despues de confirmada la
 * transaccion: si falla el aviso la venta ya quedo hecha y registrada en los
 * movimientos de stock (isStockFallback).
 */
function notifyStockFallback(saleId: string, uses: StockFallbackUse[]) {
  if (uses.length === 0) return;

  const fmt = (u: StockFallbackUse) => {
    const qty = u.quantityKg > 0 ? `${u.quantityKg} kg` : `${u.quantity}`;
    return `${qty} x ${u.productName} desde "${u.fromLocationName}"`;
  };
  const body = `Sin stock en "${uses[0].primaryLocationName}": se descontó ${uses.map(fmt).join(", ")}.`;
  const tenantId = currentTenantId();

  void (async () => {
    try {
      const admins = await prisma.user.findMany({
        where: { role: "ADMIN", tenantId, isActive: true },
        select: { id: true },
      });
      if (admins.length === 0) return;
      await notificationService.broadcast({
        userIds: admins.map((a) => a.id),
        type: NotificationType.STOCK_FALLBACK,
        title: "Venta con stock de respaldo",
        body,
        data: { href: "/configuracion/stock", saleId },
      });
    } catch (error) {
      console.error("Error avisando uso de stock de respaldo:", error);
    }
  })();
}

/**
 * Producto "Costo de envío" (SKU fijo DELIVERY_SKU) que representa un cargo
 * de envío cargado a mano por el vendedor -- no hay calculo automatico por
 * distancia (eso se saco, doc remocion del modulo "envio"), es un monto
 * libre que el vendedor tipea si el cliente pide que se lo cobren aparte.
 * Se auto-crea la primera vez que hace falta, mismo patron que el producto
 * "mano de obra" de servicios (repairOrder.service.ts).
 */
async function ensureDeliveryProduct() {
  const scope = tenantScope();
  const existing = await prisma.product.findFirst({ where: { sku: DELIVERY_SKU, ...scope } });
  if (existing) return existing;

  // Tenants creados antes de que los SKUs quedaran sin guiones tienen el
  // producto como "ENVIO-FLETE2": se renombra al encontrarlo en vez de crear
  // otro (ver scripts/normalizeSkus.ts, que no toca los SKUs internos).
  const legacy = await prisma.product.findFirst({ where: { sku: LEGACY_DELIVERY_SKU, ...scope } });
  if (legacy) return prisma.product.update({ where: { id: legacy.id }, data: { sku: DELIVERY_SKU } });

  return prisma.product.create({
    data: {
      name: "Costo de envío",
      sku: DELIVERY_SKU,
      type: "SIMPLE",
      saleUnit: "UNIT",
      isService: true,
      price: 0,
      clientPrice: 0,
      wholesalePrice: 0,
      tenantId: currentTenantId(),
    },
  });
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

export type { StockFallbackUse };

export {
  addStockLine,
  buildStockLines,
  requireStockLocationId,
  resolveStockLocationId,
  validateStockAvailability,
  discountStockLines,
  restoreStockLines,
  notifyStockFallback,
  queueStockAlerts,
  ensureDeliveryProduct,
};
