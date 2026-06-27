/**
 * Configuracion de CAI para remitos.
 * Extraido de arcaConfig.service.ts (doc seccion 4 - modularizacion).
 */
import prisma from "../../prisma";
import { getConfig, toNullableDate, toNullableNumber, type RemitoCaiInput } from "./arcaConfig.helpers";

export async function listRemitoCais() {
  const config = await getConfig();
  if (!config) return [];

  return prisma.remitoCaiConfig.findMany({
    where: { arcaConfigId: config.id },
    orderBy: [{ enabled: "desc" }, { expiresAt: "asc" }],
  });
}

export async function upsertRemitoCai(data: RemitoCaiInput) {
  const config = await getConfig();
  if (!config) throw new Error("Primero tenés que crear la configuración ARCA.");

  const pointOfSale = toNullableNumber(data.pointOfSale);
  if (!pointOfSale) throw new Error("El punto de venta de remito es obligatorio.");
  if (!data.cai) throw new Error("El CAI es obligatorio.");
  if (!data.expiresAt) throw new Error("El vencimiento del CAI es obligatorio.");

  const payload = {
    arcaConfigId: config.id,
    mode: data.mode || "PREPRINTED_FORM",
    pointOfSale,
    cai: String(data.cai),
    expiresAt: toNullableDate(data.expiresAt) || new Date(),
    rangeFrom: toNullableNumber(data.rangeFrom),
    rangeTo: toNullableNumber(data.rangeTo),
    nextNumber: toNullableNumber(data.nextNumber),
    enabled: data.enabled ?? true,
  };

  if (data.id) {
    const existing = await prisma.remitoCaiConfig.findFirst({
      where: { id: data.id, arcaConfigId: config.id },
    });

    if (!existing) throw new Error("CAI de remito no encontrado.");

    return prisma.remitoCaiConfig.update({
      where: { id: data.id },
      data: payload,
    });
  }

  return prisma.remitoCaiConfig.create({ data: payload });
}

export async function deleteRemitoCai(id: string) {
  const config = await getConfig();

  const remitoCai = await prisma.remitoCaiConfig.findFirst({
    where: { id, arcaConfigId: config?.id },
  });

  if (!remitoCai) throw new Error("CAI de remito no encontrado.");

  return prisma.remitoCaiConfig.delete({ where: { id } });
}
