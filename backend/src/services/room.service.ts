/**
 * Habitaciones fisicas del modulo de Hoteleria. El estado (RoomStatus) es
 * la fuente de verdad de "libre/ocupada/limpieza/mantenimiento" que se
 * muestra en la grilla -- reservation.service.ts lo actualiza automatico en
 * checkIn/checkout, y este servicio permite el cambio manual (ej. limpieza
 * terminada -> libre, o mandar a mantenimiento).
 */
import prisma from "../prisma";
import { RoomStatus } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { AppError } from "../utils/asyncHandler";

const ROOM_INCLUDE = {
  roomType: true,
  businessLocation: { select: { id: true, name: true } },
};

function cleanString(value?: string | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

async function findOrThrow(id: string) {
  const room = await prisma.room.findFirst({ where: { id, ...tenantScope() }, include: ROOM_INCLUDE });
  if (!room) throw new AppError("ROOM_NOT_FOUND", "Habitación no encontrada", 404);
  return room;
}

export const roomService = {
  async getAll(params: { businessLocationId?: string; roomTypeId?: string; status?: string; includeInactive?: boolean } = {}) {
    const where: any = { ...tenantScope() };
    if (!params.includeInactive) where.isActive = true;
    if (params.businessLocationId) where.businessLocationId = params.businessLocationId;
    if (params.roomTypeId) where.roomTypeId = params.roomTypeId;
    if (params.status) where.status = params.status;

    return prisma.room.findMany({ where, include: ROOM_INCLUDE, orderBy: { number: "asc" } });
  },

  async getById(id: string) {
    return findOrThrow(id);
  },

  async create(data: {
    roomTypeId: string;
    number: string;
    floor?: string | null;
    businessLocationId?: string | null;
    notes?: string | null;
  }) {
    const number = cleanString(data.number);
    if (!number) throw new AppError("VALIDATION_ERROR", "El número/nombre de la habitación es obligatorio", 400);
    if (!data.roomTypeId) throw new AppError("VALIDATION_ERROR", "El tipo de habitación es obligatorio", 400);

    const roomType = await prisma.roomType.findFirst({ where: { id: data.roomTypeId, ...tenantScope() } });
    if (!roomType) throw new AppError("ROOM_TYPE_NOT_FOUND", "Tipo de habitación no encontrado", 404);

    if (data.businessLocationId) {
      const location = await prisma.businessLocation.findFirst({ where: { id: data.businessLocationId, ...tenantScope() } });
      if (!location) throw new AppError("LOCATION_NOT_FOUND", "Sucursal no encontrada", 404);
    }

    const room = await prisma.room.create({
      data: {
        tenantId: currentTenantId(),
        roomTypeId: data.roomTypeId,
        number,
        floor: cleanString(data.floor),
        businessLocationId: data.businessLocationId || null,
        notes: cleanString(data.notes),
      },
      include: ROOM_INCLUDE,
    });

    return room;
  },

  async update(
    id: string,
    data: Partial<{
      roomTypeId: string;
      number: string;
      floor: string | null;
      businessLocationId: string | null;
      notes: string | null;
      isActive: boolean;
    }>
  ) {
    await findOrThrow(id);

    const updateData: any = {};
    if (data.roomTypeId !== undefined) {
      const roomType = await prisma.roomType.findFirst({ where: { id: data.roomTypeId, ...tenantScope() } });
      if (!roomType) throw new AppError("ROOM_TYPE_NOT_FOUND", "Tipo de habitación no encontrado", 404);
      updateData.roomTypeId = data.roomTypeId;
    }
    if (data.number !== undefined) {
      const number = cleanString(data.number);
      if (!number) throw new AppError("VALIDATION_ERROR", "El número/nombre de la habitación es obligatorio", 400);
      updateData.number = number;
    }
    if (data.floor !== undefined) updateData.floor = cleanString(data.floor);
    if (data.businessLocationId !== undefined) updateData.businessLocationId = data.businessLocationId || null;
    if (data.notes !== undefined) updateData.notes = cleanString(data.notes);
    if (data.isActive !== undefined) updateData.isActive = !!data.isActive;

    await prisma.room.update({ where: { id }, data: updateData });
    return findOrThrow(id);
  },

  async setStatus(id: string, status: string) {
    const room = await findOrThrow(id);
    const next = status as RoomStatus;
    if (!Object.values(RoomStatus).includes(next)) {
      throw new AppError("VALIDATION_ERROR", "Estado de habitación inválido", 400);
    }

    if (next === RoomStatus.LIBRE || next === RoomStatus.MANTENIMIENTO || next === RoomStatus.FUERA_DE_SERVICIO) {
      const activeReservation = await prisma.reservation.findFirst({
        where: { roomId: id, status: "CHECKED_IN" },
      });
      if (activeReservation) {
        throw new AppError(
          "ROOM_HAS_ACTIVE_GUEST",
          "No se puede cambiar el estado: la habitación tiene un huésped con check-in activo",
          409
        );
      }
    }

    await prisma.room.update({ where: { id }, data: { status: next } });
    return findOrThrow(id);
  },

  async remove(id: string) {
    await findOrThrow(id);
    const reservationsCount = await prisma.reservation.count({ where: { roomId: id } });
    if (reservationsCount > 0) {
      throw new AppError("ROOM_IN_USE", "No se puede eliminar una habitación con reservas asociadas", 409);
    }
    await prisma.room.delete({ where: { id } });
    return { ok: true };
  },
};
