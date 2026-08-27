/**
 * Reservas del modulo de Hoteleria: crear con validacion de solapamiento de
 * fechas por habitacion, check-in/check-out, y cobro (checkout) que genera
 * una Sale normal -- mismo patron que repairOrder.service.ts#checkout, reusa
 * sale.service.ts en vez de reimplementar pagos/AFIP/cuenta corriente.
 */
import prisma from "../prisma";
import { PaymentMethod, ReceiptType, ReservationStatus, RoomStatus, SaleStatus } from "@prisma/client";
import { tenantScope } from "../utils/tenantScope";
import { currentTenantId } from "../context/tenantContext";
import { AppError } from "../utils/asyncHandler";
import { saleService } from "./sale.service";

const HOSPEDAJE_SKU = "HOSPEDAJE";

const ACTIVE_STATUSES: ReservationStatus[] = [ReservationStatus.RESERVADA, ReservationStatus.CHECKED_IN];

const ALLOWED_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  RESERVADA: [ReservationStatus.CHECKED_IN, ReservationStatus.CANCELADA, ReservationStatus.NO_SHOW],
  CHECKED_IN: [ReservationStatus.CANCELADA],
  CHECKED_OUT: [],
  CANCELADA: [],
  NO_SHOW: [],
};

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function cleanString(value?: string | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function nightsBetween(checkIn: Date, checkOut: Date) {
  const ms = checkOut.getTime() - checkIn.getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
}

const RESERVATION_INCLUDE = {
  room: { include: { roomType: true, businessLocation: { select: { id: true, name: true } } } },
  client: true,
  user: { select: { id: true, name: true } },
  sale: { select: { id: true, total: true, status: true, invoiceStatus: true, receiptType: true, createdAt: true } },
};

async function findOrThrow(id: string) {
  const reservation = await prisma.reservation.findFirst({ where: { id, ...tenantScope() }, include: RESERVATION_INCLUDE });
  if (!reservation) throw new AppError("RESERVATION_NOT_FOUND", "Reserva no encontrada", 404);
  return reservation;
}

// El "hospedaje" se carga en la Sale final como un Product mas (igual
// patron que DELIVERY_SKU en delivery.service.ts / SERVICIO-TECNICO en
// repairOrder.service.ts): precio manual = tarifa por noche, cantidad =
// noches. Un solo producto (no por alicuota) porque la tarifa de hospedaje
// usa siempre el IVA por defecto del producto.
async function ensureHospedajeProduct() {
  const scope = tenantScope();
  const existing = await prisma.product.findFirst({ where: { sku: HOSPEDAJE_SKU, ...scope } });
  if (existing) return existing;

  return prisma.product.create({
    data: {
      name: "Hospedaje",
      sku: HOSPEDAJE_SKU,
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

async function assertRoomAvailable(roomId: string, checkInDate: Date, checkOutDate: Date, excludeReservationId?: string) {
  const overlapping = await prisma.reservation.findFirst({
    where: {
      roomId,
      status: { in: ACTIVE_STATUSES },
      checkInDate: { lt: checkOutDate },
      checkOutDate: { gt: checkInDate },
      ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
    },
  });
  if (overlapping) {
    throw new AppError("ROOM_NOT_AVAILABLE", "La habitación ya está reservada en ese rango de fechas", 409);
  }
}

export const reservationService = {
  async getAll(params: { status?: string; roomId?: string; search?: string; from?: string; to?: string } = {}) {
    const where: any = { ...tenantScope() };
    if (params.status) where.status = params.status;
    if (params.roomId) where.roomId = params.roomId;
    if (params.from) where.checkOutDate = { gt: new Date(params.from) };
    if (params.to) where.checkInDate = { ...(where.checkInDate ?? {}), lt: new Date(params.to) };

    const q = cleanString(params.search);
    if (q) {
      where.OR = [
        { guestName: { contains: q, mode: "insensitive" } },
        { guestPhone: { contains: q, mode: "insensitive" } },
        { room: { is: { number: { contains: q, mode: "insensitive" } } } },
        { client: { is: { OR: [{ nombre: { contains: q, mode: "insensitive" } }, { apellido: { contains: q, mode: "insensitive" } }] } } },
      ];
    }

    return prisma.reservation.findMany({ where, include: RESERVATION_INCLUDE, orderBy: { checkInDate: "asc" } });
  },

  async getById(id: string) {
    return findOrThrow(id);
  },

  // Trae, para el rango [from, to), todas las habitaciones (filtradas) con
  // sus reservas activas que solapan ese rango -- el frontend arma la
  // grilla habitacion x dia a partir de esto.
  async getAvailability(params: { businessLocationId?: string; roomTypeId?: string; from: string; to: string }) {
    const from = new Date(params.from);
    const to = new Date(params.to);

    const roomWhere: any = { ...tenantScope(), isActive: true };
    if (params.businessLocationId) roomWhere.businessLocationId = params.businessLocationId;
    if (params.roomTypeId) roomWhere.roomTypeId = params.roomTypeId;

    const rooms = await prisma.room.findMany({
      where: roomWhere,
      include: {
        roomType: true,
        reservations: {
          where: {
            status: { in: ACTIVE_STATUSES },
            checkInDate: { lt: to },
            checkOutDate: { gt: from },
          },
          include: { client: true },
          orderBy: { checkInDate: "asc" },
        },
      },
      orderBy: { number: "asc" },
    });

    return rooms;
  },

  async create(data: {
    roomId: string;
    clientId?: string | null;
    userId?: string | null;
    businessLocationId?: string | null;
    guestName: string;
    guestPhone?: string | null;
    checkInDate: Date;
    checkOutDate: Date;
    notes?: string | null;
    // Pisa la tarifa del RoomType para esta reserva puntual (ej. descuento
    // negociado, temporada, etc.) -- si no se manda, se usa
    // room.roomType.nightlyRate como hasta ahora.
    nightlyRate?: number | null;
  }) {
    const guestName = cleanString(data.guestName);
    if (!guestName) throw new AppError("VALIDATION_ERROR", "El nombre del huésped es obligatorio", 400);
    if (!data.roomId) throw new AppError("VALIDATION_ERROR", "La habitación es obligatoria", 400);

    const checkInDate = new Date(data.checkInDate);
    const checkOutDate = new Date(data.checkOutDate);
    if (!(checkInDate instanceof Date) || isNaN(checkInDate.getTime()) || !(checkOutDate instanceof Date) || isNaN(checkOutDate.getTime())) {
      throw new AppError("VALIDATION_ERROR", "Las fechas de check-in/check-out son inválidas", 400);
    }
    if (checkOutDate <= checkInDate) {
      throw new AppError("VALIDATION_ERROR", "El check-out tiene que ser posterior al check-in", 400);
    }

    const room = await prisma.room.findFirst({ where: { id: data.roomId, ...tenantScope() }, include: { roomType: true } });
    if (!room) throw new AppError("ROOM_NOT_FOUND", "Habitación no encontrada", 404);
    if (!room.isActive) throw new AppError("ROOM_INACTIVE", "La habitación no está activa", 409);

    if (data.clientId) {
      const client = await prisma.client.findFirst({ where: { id: data.clientId, ...tenantScope() } });
      if (!client) throw new AppError("CLIENT_NOT_FOUND", "Cliente no encontrado", 404);
    }

    if (data.businessLocationId) {
      const location = await prisma.businessLocation.findFirst({ where: { id: data.businessLocationId, ...tenantScope() } });
      if (!location) throw new AppError("LOCATION_NOT_FOUND", "Sucursal no encontrada", 404);
    }

    if (data.nightlyRate !== undefined && data.nightlyRate !== null) {
      if (!Number.isFinite(data.nightlyRate) || data.nightlyRate < 0) {
        throw new AppError("VALIDATION_ERROR", "La tarifa por noche es inválida", 400);
      }
    }

    await assertRoomAvailable(data.roomId, checkInDate, checkOutDate);

    const nights = nightsBetween(checkInDate, checkOutDate);
    const nightlyRateSnapshot =
      data.nightlyRate !== undefined && data.nightlyRate !== null ? data.nightlyRate : room.roomType.nightlyRate;
    const totalAmount = round2(nights * nightlyRateSnapshot);

    const reservation = await prisma.reservation.create({
      data: {
        tenantId: currentTenantId(),
        roomId: data.roomId,
        clientId: data.clientId || null,
        userId: data.userId || null,
        businessLocationId: data.businessLocationId || room.businessLocationId || null,
        guestName,
        guestPhone: cleanString(data.guestPhone),
        checkInDate,
        checkOutDate,
        nightlyRateSnapshot,
        totalAmount,
        notes: cleanString(data.notes),
        status: ReservationStatus.RESERVADA,
      },
      include: RESERVATION_INCLUDE,
    });

    return reservation;
  },

  async update(
    id: string,
    data: Partial<{
      clientId: string | null;
      guestName: string;
      guestPhone: string | null;
      checkInDate: Date;
      checkOutDate: Date;
      notes: string | null;
    }>
  ) {
    const reservation = await findOrThrow(id);
    if (!ACTIVE_STATUSES.includes(reservation.status)) {
      throw new AppError("RESERVATION_LOCKED", "No se puede modificar una reserva cerrada o cancelada", 409);
    }

    const nextCheckIn = data.checkInDate !== undefined ? new Date(data.checkInDate) : reservation.checkInDate;
    const nextCheckOut = data.checkOutDate !== undefined ? new Date(data.checkOutDate) : reservation.checkOutDate;
    if (nextCheckOut <= nextCheckIn) {
      throw new AppError("VALIDATION_ERROR", "El check-out tiene que ser posterior al check-in", 400);
    }
    if (data.checkInDate !== undefined || data.checkOutDate !== undefined) {
      await assertRoomAvailable(reservation.roomId, nextCheckIn, nextCheckOut, id);
    }

    if (data.clientId) {
      const client = await prisma.client.findFirst({ where: { id: data.clientId, ...tenantScope() } });
      if (!client) throw new AppError("CLIENT_NOT_FOUND", "Cliente no encontrado", 404);
    }

    const updateData: any = {};
    if (data.clientId !== undefined) updateData.clientId = data.clientId || null;
    if (data.guestName !== undefined) {
      const guestName = cleanString(data.guestName);
      if (!guestName) throw new AppError("VALIDATION_ERROR", "El nombre del huésped es obligatorio", 400);
      updateData.guestName = guestName;
    }
    if (data.guestPhone !== undefined) updateData.guestPhone = cleanString(data.guestPhone);
    if (data.notes !== undefined) updateData.notes = cleanString(data.notes);
    if (data.checkInDate !== undefined) updateData.checkInDate = nextCheckIn;
    if (data.checkOutDate !== undefined) updateData.checkOutDate = nextCheckOut;
    if (data.checkInDate !== undefined || data.checkOutDate !== undefined) {
      const nights = nightsBetween(nextCheckIn, nextCheckOut);
      updateData.totalAmount = round2(nights * Number(reservation.nightlyRateSnapshot));
    }

    await prisma.reservation.update({ where: { id }, data: updateData });
    return findOrThrow(id);
  },

  async setStatus(id: string, status: string) {
    const reservation = await findOrThrow(id);
    const next = status as ReservationStatus;
    if (!Object.values(ReservationStatus).includes(next)) {
      throw new AppError("VALIDATION_ERROR", "Estado de reserva inválido", 400);
    }

    const allowed = ALLOWED_TRANSITIONS[reservation.status] ?? [];
    if (!allowed.includes(next)) {
      throw new AppError("INVALID_TRANSITION", `No se puede pasar de ${reservation.status} a ${next}`, 409);
    }

    if (next === ReservationStatus.CANCELADA && reservation.status === ReservationStatus.CHECKED_IN) {
      // Se cancela una estadia en curso: libera la habitacion.
      await prisma.room.update({ where: { id: reservation.roomId }, data: { status: RoomStatus.LIBRE } });
    }

    await prisma.reservation.update({ where: { id }, data: { status: next } });
    return findOrThrow(id);
  },

  async checkIn(id: string) {
    const reservation = await findOrThrow(id);
    if (reservation.status !== ReservationStatus.RESERVADA) {
      throw new AppError("INVALID_TRANSITION", "Solo se puede hacer check-in de una reserva pendiente", 409);
    }
    if (reservation.room.status === RoomStatus.MANTENIMIENTO || reservation.room.status === RoomStatus.FUERA_DE_SERVICIO) {
      throw new AppError("ROOM_UNAVAILABLE", "La habitación no está disponible (mantenimiento / fuera de servicio)", 409);
    }

    await prisma.$transaction([
      prisma.reservation.update({
        where: { id },
        data: { status: ReservationStatus.CHECKED_IN, actualCheckInAt: new Date() },
      }),
      prisma.room.update({ where: { id: reservation.roomId }, data: { status: RoomStatus.OCUPADA } }),
    ]);

    return findOrThrow(id);
  },

  // --- Cobro: convierte la reserva en una Sale normal y cierra la estadia ---

  async checkout(
    id: string,
    data: {
      paymentMethod: string;
      receiptType: string;
      payments?: { method: string; amount: number; reference?: string; notes?: string }[];
      businessLocationId?: string;
      stockLocationId?: string;
      discountType?: "PERCENTAGE" | "FIXED";
      discountValue?: number;
    },
    userId?: string
  ) {
    const reservation = await findOrThrow(id);

    if (reservation.saleId) throw new AppError("ALREADY_CHARGED", "Esta reserva ya fue cobrada", 409);
    if (reservation.status !== ReservationStatus.CHECKED_IN && reservation.status !== ReservationStatus.RESERVADA) {
      throw new AppError("INVALID_TRANSITION", "La reserva tiene que estar activa para poder cobrarla", 409);
    }

    const hospedaje = await ensureHospedajeProduct();
    const nights = nightsBetween(reservation.checkInDate, reservation.checkOutDate);

    const { sale } = await saleService.create({
      userId,
      clientId: reservation.clientId ?? undefined,
      businessLocationId: data.businessLocationId ?? reservation.businessLocationId ?? undefined,
      stockLocationId: data.stockLocationId,
      discountType: data.discountType,
      discountValue: data.discountValue,
      paymentMethod: data.paymentMethod as PaymentMethod,
      receiptType: data.receiptType as ReceiptType,
      status: SaleStatus.COMPLETED,
      payments: data.payments as any,
      items: [
        {
          productId: hospedaje.id,
          quantity: nights,
          price: round2(Number(reservation.nightlyRateSnapshot)),
          priceType: "MANUAL",
        },
      ],
    });

    await prisma.$transaction([
      prisma.reservation.update({
        where: { id },
        data: { saleId: sale.id, status: ReservationStatus.CHECKED_OUT, actualCheckOutAt: new Date() },
      }),
      prisma.room.update({ where: { id: reservation.roomId }, data: { status: RoomStatus.LIMPIEZA } }),
    ]);

    return findOrThrow(id);
  },

  async remove(id: string) {
    const reservation = await findOrThrow(id);
    if (reservation.saleId) throw new AppError("CANNOT_DELETE", "No se puede eliminar una reserva ya cobrada", 409);
    await prisma.reservation.delete({ where: { id } });
    return { ok: true };
  },
};
