/**
 * Tipos de habitacion del modulo de Hoteleria: nombre + tarifa por noche +
 * capacidad. Ver reservation.service.ts para como se usa nightlyRate al
 * reservar (se congela en Reservation.nightlyRateSnapshot).
 */
import prisma from "../prisma";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { AppError } from "../utils/asyncHandler";

function cleanString(value?: string | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

async function findOrThrow(id: string) {
  const roomType = await prisma.roomType.findFirst({ where: { id, ...tenantScope() } });
  if (!roomType) throw new AppError("ROOM_TYPE_NOT_FOUND", "Tipo de habitación no encontrado", 404);
  return roomType;
}

export const roomTypeService = {
  async getAll(params: { includeInactive?: boolean } = {}) {
    const where: any = { ...tenantScope() };
    if (!params.includeInactive) where.isActive = true;
    return prisma.roomType.findMany({ where, orderBy: { name: "asc" } });
  },

  async getById(id: string) {
    return findOrThrow(id);
  },

  async create(data: { name: string; nightlyRate: number; capacity?: number; description?: string | null }) {
    const name = cleanString(data.name);
    if (!name) throw new AppError("VALIDATION_ERROR", "El nombre del tipo de habitación es obligatorio", 400);

    const nightlyRate = Number(data.nightlyRate);
    if (!Number.isFinite(nightlyRate) || nightlyRate < 0) {
      throw new AppError("VALIDATION_ERROR", "La tarifa por noche es inválida", 400);
    }

    const capacity = data.capacity !== undefined ? Math.max(1, Math.trunc(Number(data.capacity))) : 2;

    return prisma.roomType.create({
      data: {
        tenantId: currentTenantId(),
        name,
        nightlyRate,
        capacity,
        description: cleanString(data.description),
      },
    });
  },

  async update(
    id: string,
    data: Partial<{ name: string; nightlyRate: number; capacity: number; description: string | null; isActive: boolean }>
  ) {
    await findOrThrow(id);

    const updateData: any = {};
    if (data.name !== undefined) {
      const name = cleanString(data.name);
      if (!name) throw new AppError("VALIDATION_ERROR", "El nombre del tipo de habitación es obligatorio", 400);
      updateData.name = name;
    }
    if (data.nightlyRate !== undefined) {
      const nightlyRate = Number(data.nightlyRate);
      if (!Number.isFinite(nightlyRate) || nightlyRate < 0) {
        throw new AppError("VALIDATION_ERROR", "La tarifa por noche es inválida", 400);
      }
      updateData.nightlyRate = nightlyRate;
    }
    if (data.capacity !== undefined) updateData.capacity = Math.max(1, Math.trunc(Number(data.capacity)));
    if (data.description !== undefined) updateData.description = cleanString(data.description);
    if (data.isActive !== undefined) updateData.isActive = !!data.isActive;

    return prisma.roomType.update({ where: { id }, data: updateData });
  },

  async remove(id: string) {
    await findOrThrow(id);
    const roomsCount = await prisma.room.count({ where: { roomTypeId: id } });
    if (roomsCount > 0) {
      throw new AppError("ROOM_TYPE_IN_USE", "No se puede eliminar un tipo de habitación con habitaciones asociadas", 409);
    }
    await prisma.roomType.delete({ where: { id } });
    return { ok: true };
  },
};
