/**
 * Puntos de venta ARCA.
 * Extraido de arcaConfig.service.ts (doc seccion 4 - modularizacion).
 */
import prisma from "../../prisma";
import { getConfig, toNullableNumber, parseEnabledCbteTypes, type PointOfSaleInput } from "./arcaConfig.helpers";

export async function listPointsOfSale() {
  const config = await getConfig();
  if (!config) return [];

  return prisma.arcaPointOfSale.findMany({
    where: { arcaConfigId: config.id },
    orderBy: [{ isDefault: "desc" }, { number: "asc" }],
  });
}

export async function upsertPointOfSale(data: PointOfSaleInput) {
  const config = await getConfig();
  if (!config) throw new Error("Primero tenés que crear la configuración ARCA.");

  const number = toNullableNumber(data.number ?? data.pointOfSale);
  if (!number || number <= 0) throw new Error("El punto de venta debe ser un número válido.");

  const isDefault = data.isDefault ?? true;

  if (isDefault) {
    await prisma.arcaPointOfSale.updateMany({
      where: { arcaConfigId: config.id },
      data: { isDefault: false },
    });

    await prisma.arcaConfig.update({
      where: { id: config.id },
      data: { defaultPointOfSale: number },
    });
  }

  return prisma.arcaPointOfSale.upsert({
    where: {
      arcaConfigId_number: {
        arcaConfigId: config.id,
        number,
      },
    },
    update: {
      description: data.description ?? undefined,
      enabled: data.enabled ?? undefined,
      isDefault,
      enabledCbteTypes:
        data.enabledCbteTypes !== undefined
          ? parseEnabledCbteTypes(data.enabledCbteTypes)
          : undefined,
    },
    create: {
      arcaConfigId: config.id,
      number,
      description: data.description || "Punto de venta ARCA",
      enabled: data.enabled ?? true,
      isDefault,
      enabledCbteTypes: parseEnabledCbteTypes(data.enabledCbteTypes),
    },
  });
}

export async function deletePointOfSale(id: string) {
  const config = await getConfig();

  const point = await prisma.arcaPointOfSale.findFirst({
    where: { id, arcaConfigId: config?.id },
  });

  if (!point) throw new Error("Punto de venta no encontrado.");

  return prisma.arcaPointOfSale.delete({ where: { id } });
}
