/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import ConfirmModal, { type ConfirmState } from '@/components/ConfirmModal';
import SearchableSelect from '@/components/SearchableSelect';
import ClientFormModal from '@/components/ClientFormModal';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { Client, Room, RoomType, RoomStatus, Reservation, ReservationStatus, PaymentMethod, ReceiptType } from '@/types';
import { fmtMoney, normalizeArray, clientName } from '@/lib/helpers';
import { todayInputAR, formatShortDateAR, toDateInputAR } from '@/lib/dateAR';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
import {
  BedDouble, Plus, X, RefreshCcw, Trash2, CreditCard, LogIn, LogOut, Settings2, ChevronLeft, ChevronRight,
} from 'lucide-react';

const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  LIBRE: 'Libre', OCUPADA: 'Ocupada', LIMPIEZA: 'Limpieza', MANTENIMIENTO: 'Mantenimiento', FUERA_DE_SERVICIO: 'Fuera de servicio',
};
const ROOM_STATUS_BADGE: Record<RoomStatus, string> = {
  LIBRE: 'badge-green', OCUPADA: 'badge-blue', LIMPIEZA: 'badge-amber', MANTENIMIENTO: 'badge-gray', FUERA_DE_SERVICIO: 'badge-red',
};
const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  RESERVADA: 'Reservada', CHECKED_IN: 'Check-in hecho', CHECKED_OUT: 'Check-out hecho', CANCELADA: 'Cancelada', NO_SHOW: 'No se presentó',
};
const RESERVATION_STATUS_BADGE: Record<ReservationStatus, string> = {
  RESERVADA: 'badge-amber', CHECKED_IN: 'badge-blue', CHECKED_OUT: 'badge-slate', CANCELADA: 'badge-red', NO_SHOW: 'badge-gray',
};

const PAYMENT_METHODS: PaymentMethod[] = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'QR_MERCADOPAGO', 'QR_NACION', 'CUENTA_CORRIENTE'];
const CALENDAR_DAYS = 14;

function addDaysStr(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateInputAR(d);
}

function nightsBetween(checkIn: string, checkOut: string) {
  const ms = new Date(`${checkOut}T00:00:00`).getTime() - new Date(`${checkIn}T00:00:00`).getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
}

type AvailabilityReservation = {
  id: string;
  checkInDate: string;
  checkOutDate: string;
  status: ReservationStatus;
  guestName: string;
  guestPhone?: string | null;
  totalAmount: number;
  clientId?: string | null;
  client?: Client | null;
};

type AvailabilityRoom = Room & { reservations: AvailabilityReservation[] };

const emptyRoomTypeForm = { name: '', nightlyRate: '', capacity: '2', description: '' };
const emptyRoomForm = { roomTypeId: '', number: '', floor: '', businessLocationId: '', addressStreet: '', addressCity: '', addressProvince: '' };
const emptyReservationForm = { roomId: '', clientId: '', guestName: '', guestPhone: '', checkInDate: '', checkOutDate: '', notes: '', nightlyRate: '' };

export default function HoteleriaPage() {
  const [tab, setTab] = useState<'habitaciones' | 'reservas'>('habitaciones');

  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [businessLocations, setBusinessLocations] = useState<{ id: string; name: string }[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [newClientQuery, setNewClientQuery] = useState<string | null>(null);

  // --- Habitaciones ---
  const [roomModal, setRoomModal] = useState<'create' | 'edit' | null>(null);
  const [roomForm, setRoomForm] = useState(emptyRoomForm);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [roomTypesModalOpen, setRoomTypesModalOpen] = useState(false);
  const [roomTypeForm, setRoomTypeForm] = useState(emptyRoomTypeForm);
  const [editingRoomTypeId, setEditingRoomTypeId] = useState<string | null>(null);

  // --- Reservas / calendario ---
  const [rangeStart, setRangeStart] = useState(todayInputAR());
  const [availability, setAvailability] = useState<AvailabilityRoom[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);

  const [reservationModal, setReservationModal] = useState<'create' | 'detail' | null>(null);
  const [reservationForm, setReservationForm] = useState(emptyReservationForm);
  const [selected, setSelected] = useState<Reservation | null>(null);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({ paymentMethod: 'EFECTIVO' as PaymentMethod, receiptType: 'TICKET' as ReceiptType, businessLocationId: '' });

  const days = useMemo(() => Array.from({ length: CALENDAR_DAYS }, (_, i) => addDaysStr(rangeStart, i)), [rangeStart]);

  const loadRoomTypes = async () => {
    const { data } = await api.get('/room-types');
    setRoomTypes(normalizeArray<RoomType>(data));
  };

  const loadRooms = async () => {
    const { data } = await api.get('/rooms');
    setRooms(normalizeArray<Room>(data));
  };

  const loadAvailability = async () => {
    setCalendarLoading(true);
    try {
      const { data } = await api.get('/reservations/availability', {
        params: { from: rangeStart, to: addDaysStr(rangeStart, CALENDAR_DAYS) },
      });
      setAvailability(normalizeArray<AvailabilityRoom>(data));
    } finally { setCalendarLoading(false); }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [rtRes, rRes, locRes, clRes] = await Promise.all([
          api.get('/room-types'),
          api.get('/rooms'),
          api.get('/business-locations').catch(() => null),
          api.get('/clients', { params: { limit: 500 } }).catch(() => null),
        ]);
        setRoomTypes(normalizeArray<RoomType>(rtRes.data));
        setRooms(normalizeArray<Room>(rRes.data));
        if (locRes) setBusinessLocations(normalizeArray<any>(locRes.data));
        if (clRes) setClients(normalizeArray<Client>(clRes.data));
      } finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => { if (tab === 'reservas') loadAvailability(); }, [tab, rangeStart]);

  const clientOptions = useMemo(
    () => clients.map((c) => ({ value: c.id, label: `${clientName(c)}${c.dni ? ` — ${c.dni}` : ''}` })),
    [clients]
  );
  const roomTypeOptions = useMemo(
    () => roomTypes.filter((rt) => rt.isActive).map((rt) => ({ value: rt.id, label: `${rt.name} (${fmtMoney(rt.nightlyRate)}/noche)` })),
    [roomTypes]
  );
  const roomOptions = useMemo(
    () => rooms.filter((r) => r.isActive).map((r) => ({ value: r.id, label: `${r.number} — ${r.roomType?.name ?? ''}` })),
    [rooms]
  );

  // ===== Tipos de habitación =====

  const resetRoomTypeForm = () => { setRoomTypeForm(emptyRoomTypeForm); setEditingRoomTypeId(null); };

  const editRoomType = (rt: RoomType) => {
    setEditingRoomTypeId(rt.id);
    setRoomTypeForm({ name: rt.name, nightlyRate: String(rt.nightlyRate), capacity: String(rt.capacity), description: rt.description ?? '' });
  };

  const submitRoomType = async () => {
    if (!roomTypeForm.name.trim()) return toast.error('El nombre es obligatorio');
    const nightlyRate = Number(roomTypeForm.nightlyRate);
    if (!Number.isFinite(nightlyRate) || nightlyRate < 0) return toast.error('Tarifa inválida');

    setSaving(true);
    try {
      const payload = {
        name: roomTypeForm.name,
        nightlyRate,
        capacity: Number(roomTypeForm.capacity) || 1,
        description: roomTypeForm.description || undefined,
      };
      if (editingRoomTypeId) {
        await api.patch(`/room-types/${editingRoomTypeId}`, payload);
        toast.success('Tipo de habitación actualizado');
      } else {
        await api.post('/room-types', payload);
        toast.success('Tipo de habitación creado');
      }
      resetRoomTypeForm();
      await Promise.all([loadRoomTypes(), loadRooms()]);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al guardar el tipo de habitación');
    } finally { setSaving(false); }
  };

  const removeRoomType = (rt: RoomType) => {
    setConfirmState({
      title: 'Eliminar tipo de habitación',
      message: `¿Eliminar "${rt.name}"? Solo se puede borrar si no tiene habitaciones asociadas.`,
      onConfirm: async () => {
        try {
          await api.delete(`/room-types/${rt.id}`);
          toast.success('Tipo de habitación eliminado');
          await loadRoomTypes();
        } catch (err: any) {
          toast.error(err?.response?.data?.message ?? 'Error al eliminar');
        }
      },
    });
  };

  // ===== Habitaciones =====

  const openCreateRoom = () => { setRoomForm(emptyRoomForm); setEditingRoom(null); setRoomModal('create'); };

  const openEditRoom = (room: Room) => {
    setEditingRoom(room);
    setRoomForm({
      roomTypeId: room.roomTypeId,
      number: room.number,
      floor: room.floor ?? '',
      businessLocationId: room.businessLocationId ?? '',
      addressStreet: room.addressStreet ?? '',
      addressCity: room.addressCity ?? '',
      addressProvince: room.addressProvince ?? '',
    });
    setRoomModal('edit');
  };

  const submitRoom = async () => {
    if (!roomForm.number.trim()) return toast.error('El número/nombre de la habitación es obligatorio');
    if (!roomForm.roomTypeId) return toast.error('Elegí el tipo de habitación');

    setSaving(true);
    try {
      const payload = {
        roomTypeId: roomForm.roomTypeId,
        number: roomForm.number,
        floor: roomForm.floor || undefined,
        businessLocationId: roomForm.businessLocationId || undefined,
        addressStreet: roomForm.addressStreet || undefined,
        addressCity: roomForm.addressCity || undefined,
        addressProvince: roomForm.addressProvince || undefined,
      };
      if (roomModal === 'edit' && editingRoom) {
        const { data } = await api.patch(`/rooms/${editingRoom.id}`, payload);
        setEditingRoom(data);
        toast.success('Habitación actualizada');
      } else {
        await api.post('/rooms', payload);
        toast.success('Habitación creada');
        setRoomModal(null);
      }
      await loadRooms();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al guardar la habitación');
    } finally { setSaving(false); }
  };

  const uploadRoomImage = async (file: File) => {
    if (!editingRoom) return;
    setUploadingImage(true);
    try {
      const body = new FormData();
      body.append('image', file);
      const { data } = await api.post(`/rooms/${editingRoom.id}/image`, body);
      setEditingRoom(data);
      await loadRooms();
      toast.success('Foto actualizada');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al subir la foto');
    } finally { setUploadingImage(false); }
  };

  const setRoomStatus = async (room: Room, status: RoomStatus) => {
    try {
      await api.patch(`/rooms/${room.id}/status`, { status });
      toast.success(`Habitación ${room.number} → ${ROOM_STATUS_LABEL[status]}`);
      await loadRooms();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al cambiar el estado');
    }
  };

  const removeRoom = (room: Room) => {
    setConfirmState({
      title: 'Eliminar habitación',
      message: `¿Eliminar la habitación "${room.number}"? Solo se puede borrar si no tiene reservas asociadas.`,
      onConfirm: async () => {
        try {
          await api.delete(`/rooms/${room.id}`);
          toast.success('Habitación eliminada');
          setRoomModal(null);
          await loadRooms();
        } catch (err: any) {
          toast.error(err?.response?.data?.message ?? 'Error al eliminar');
        }
      },
    });
  };

  // ===== Reservas =====

  const openCreateReservation = (roomId?: string, checkInDate?: string) => {
    const room = roomId ? rooms.find((r) => r.id === roomId) : undefined;
    setReservationForm({
      ...emptyReservationForm,
      roomId: roomId ?? '',
      checkInDate: checkInDate ?? todayInputAR(),
      checkOutDate: addDaysStr(checkInDate ?? todayInputAR(), 1),
      nightlyRate: room ? String(room.roomType.nightlyRate) : '',
    });
    setReservationModal('create');
  };

  const createReservation = async () => {
    if (!reservationForm.roomId) return toast.error('Elegí una habitación');
    if (!reservationForm.guestName.trim()) return toast.error('El nombre del huésped es obligatorio');
    if (!reservationForm.checkInDate || !reservationForm.checkOutDate) return toast.error('Completá las fechas');

    setSaving(true);
    try {
      await api.post('/reservations', {
        roomId: reservationForm.roomId,
        clientId: reservationForm.clientId || undefined,
        guestName: reservationForm.guestName,
        guestPhone: reservationForm.guestPhone || undefined,
        checkInDate: reservationForm.checkInDate,
        checkOutDate: reservationForm.checkOutDate,
        notes: reservationForm.notes || undefined,
        nightlyRate: reservationForm.nightlyRate !== '' ? Number(reservationForm.nightlyRate) : undefined,
      });
      toast.success('Reserva creada');
      setReservationModal(null);
      await Promise.all([loadAvailability(), loadRooms()]);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al crear la reserva');
    } finally { setSaving(false); }
  };

  const openReservationDetail = async (id: string) => {
    try {
      const { data } = await api.get(`/reservations/${id}`);
      setSelected(data);
      setReservationModal('detail');
    } catch { toast.error('Error al cargar el detalle'); }
  };

  const refreshSelected = async (id: string) => {
    const { data } = await api.get(`/reservations/${id}`);
    setSelected(data);
    return data as Reservation;
  };

  const doCheckIn = async () => {
    if (!selected) return;
    try {
      await api.post(`/reservations/${selected.id}/check-in`);
      toast.success('Check-in realizado');
      await refreshSelected(selected.id);
      await Promise.all([loadAvailability(), loadRooms()]);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al hacer check-in');
    }
  };

  const openCheckout = () => {
    if (!selected) return;
    setCheckoutForm({
      paymentMethod: 'EFECTIVO',
      receiptType: 'TICKET',
      businessLocationId: selected.businessLocationId || businessLocations[0]?.id || '',
    });
    setCheckoutOpen(true);
  };

  const submitCheckout = async () => {
    if (!selected) return;
    if (!checkoutForm.businessLocationId) return toast.error('Elegí la sucursal/depósito del cobro');
    setSaving(true);
    try {
      await api.post(`/reservations/${selected.id}/checkout`, {
        paymentMethod: checkoutForm.paymentMethod,
        receiptType: checkoutForm.receiptType,
        businessLocationId: checkoutForm.businessLocationId,
        stockLocationId: checkoutForm.businessLocationId,
      });
      toast.success('Estadía cobrada — ya figura en Ventas');
      setCheckoutOpen(false);
      await refreshSelected(selected.id);
      await Promise.all([loadAvailability(), loadRooms()]);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al cobrar');
    } finally { setSaving(false); }
  };

  const askCancelReservation = () => {
    if (!selected) return;
    setConfirmState({
      title: 'Cancelar reserva',
      message: '¿Cancelar esta reserva? La habitación queda libre para ese rango de fechas.',
      onConfirm: async () => {
        try {
          await api.patch(`/reservations/${selected.id}/status`, { status: 'CANCELADA' });
          toast.success('Reserva cancelada');
          setReservationModal(null);
          await Promise.all([loadAvailability(), loadRooms()]);
        } catch (err: any) {
          toast.error(err?.response?.data?.message ?? 'Error al cancelar');
        }
      },
    });
  };

  const askDeleteReservation = () => {
    if (!selected) return;
    setConfirmState({
      title: 'Eliminar reserva',
      message: '¿Eliminar este registro por completo? Esta acción no se puede deshacer.',
      onConfirm: async () => {
        try {
          await api.delete(`/reservations/${selected.id}`);
          toast.success('Reserva eliminada');
          setReservationModal(null);
          await loadAvailability();
        } catch (err: any) {
          toast.error(err?.response?.data?.message ?? 'Error al eliminar');
        }
      },
    });
  };

  const reservationForDay = (room: AvailabilityRoom, day: string) =>
    room.reservations.find((r) => toDateInputAR(r.checkInDate) <= day && day < toDateInputAR(r.checkOutDate));

  // "Hoy: llegan / se van" -- derivado del mismo availability que ya carga
  // la grilla, sin pegarle a otro endpoint. Como rangeStart arranca en
  // todayInputAR(), hoy siempre esta en la ventana visible al entrar.
  const today = todayInputAR();
  const arrivalsToday = useMemo(
    () => availability.flatMap((room) =>
      room.reservations.filter((r) => r.status === 'RESERVADA' && toDateInputAR(r.checkInDate) === today).map((r) => ({ room, r }))
    ),
    [availability, today]
  );
  const departuresToday = useMemo(
    () => availability.flatMap((room) =>
      room.reservations.filter((r) => r.status === 'CHECKED_IN' && toDateInputAR(r.checkOutDate) === today).map((r) => ({ room, r }))
    ),
    [availability, today]
  );

  return (
    <AppLayout
      title="Hotelería"
      subtitle={tab === 'habitaciones' ? `${rooms.length} habitaciones` : `${availability.length} habitaciones en el calendario`}
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn btn-sm ${tab === 'habitaciones' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('habitaciones')}>Habitaciones</button>
          <button className={`btn btn-sm ${tab === 'reservas' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('reservas')}>Reservas</button>
        </div>
      }
    >
      {tab === 'habitaciones' ? (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={loadRooms}><RefreshCcw size={13} /></button>
            <button className="btn btn-secondary btn-sm" onClick={() => { resetRoomTypeForm(); setRoomTypesModalOpen(true); }} style={{ gap: 6 }}>
              <Settings2 size={13} /> Tipos de habitación
            </button>
            <button className="btn btn-primary btn-sm" onClick={openCreateRoom} style={{ gap: 6, marginLeft: 'auto' }}>
              <Plus size={13} /> Nueva habitación
            </button>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
            ) : (
              <ResponsiveTable
                data={rooms}
                keyFor={(r) => r.id}
                onRowClick={openEditRoom}
                emptyIcon={BedDouble}
                emptyMessage="Sin habitaciones cargadas"
                columns={[
                  { key: 'numero', header: 'Habitación', render: (r) => (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {r.imageUrl && <img src={r.imageUrl} alt={r.number} style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />}
                      <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>{r.number}{r.floor ? ` (piso ${r.floor})` : ''}</span>
                    </span>
                  ) },
                  { key: 'tipo', header: 'Tipo', render: (r) => <span style={{ fontSize: 13, color: 'var(--text2)' }}>{r.roomType?.name}</span> },
                  { key: 'tarifa', header: 'Tarifa/noche', style: { textAlign: 'right' }, render: (r) => <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{fmtMoney(r.roomType?.nightlyRate ?? 0)}</span> },
                  { key: 'sucursal', header: 'Sucursal', render: (r) => <span style={{ fontSize: 12, color: 'var(--text3)' }}>{r.businessLocation?.name ?? '—'}</span> },
                  { key: 'estado', header: 'Estado', render: (r) => <span className={`badge ${ROOM_STATUS_BADGE[r.status]}`}>{ROOM_STATUS_LABEL[r.status]}</span> },
                ] as ResponsiveTableColumn<Room>[]}
                renderMobileCard={(r) => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div className="mobile-card-head">
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.number}</span>
                      <span className={`badge ${ROOM_STATUS_BADGE[r.status]}`}>{ROOM_STATUS_LABEL[r.status]}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span>{r.roomType?.name}</span>
                      <span style={{ fontFamily: 'var(--mono)' }}>{fmtMoney(r.roomType?.nightlyRate ?? 0)}</span>
                    </div>
                  </div>
                )}
              />
            )}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setRangeStart(addDaysStr(rangeStart, -CALENDAR_DAYS))}><ChevronLeft size={14} /></button>
            <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} style={{ width: 150 }} />
            <button className="btn btn-ghost btn-sm" onClick={() => setRangeStart(addDaysStr(rangeStart, CALENDAR_DAYS))}><ChevronRight size={14} /></button>
            <button className="btn btn-secondary btn-sm" onClick={() => setRangeStart(todayInputAR())}>Hoy</button>
            <button className="btn btn-ghost btn-sm" onClick={loadAvailability}><RefreshCcw size={13} /></button>
            <button className="btn btn-primary btn-sm" onClick={() => openCreateReservation()} style={{ gap: 6, marginLeft: 'auto' }}>
              <Plus size={13} /> Nueva reserva
            </button>
          </div>

          {(arrivalsToday.length > 0 || departuresToday.length > 0) && (
            <div className="grid-responsive" style={{ gap: 10, marginBottom: 16 }}>
              <div className="card" style={{ padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <LogIn size={13} /> Llegan hoy ({arrivalsToday.length})
                </div>
                {arrivalsToday.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Sin llegadas pendientes hoy.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {arrivalsToday.map(({ room, r }) => (
                      <button key={r.id} onClick={() => openReservationDetail(r.id)} className="btn btn-ghost btn-sm" style={{ justifyContent: 'space-between', width: '100%' }}>
                        <span>{r.guestName}</span>
                        <span style={{ color: 'var(--text3)', fontSize: 11 }}>Hab. {room.number}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="card" style={{ padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <LogOut size={13} /> Se van hoy ({departuresToday.length})
                </div>
                {departuresToday.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Sin salidas pendientes hoy.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {departuresToday.map(({ room, r }) => (
                      <button key={r.id} onClick={() => openReservationDetail(r.id)} className="btn btn-ghost btn-sm" style={{ justifyContent: 'space-between', width: '100%' }}>
                        <span>{r.guestName}</span>
                        <span style={{ color: 'var(--text3)', fontSize: 11 }}>Hab. {room.number}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="card table-wrap" style={{ padding: 0 }}>
            {calendarLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
            ) : availability.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}><p>Cargá habitaciones primero para ver el calendario.</p></div>
            ) : (
              <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: 'var(--surface)', padding: '8px 10px', textAlign: 'left', minWidth: 120, borderBottom: '1px solid var(--border)' }}>Habitación</th>
                    {days.map((d) => (
                      <th key={d} style={{ padding: '8px 6px', textAlign: 'center', minWidth: 64, borderBottom: '1px solid var(--border)', color: 'var(--text3)', fontWeight: 500 }}>
                        {formatShortDateAR(d)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {availability.map((room) => (
                    <tr key={room.id}>
                      <td style={{ position: 'sticky', left: 0, background: 'var(--surface)', padding: '8px 10px', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--text)' }}>
                        {room.number}
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>{room.roomType?.name}</div>
                      </td>
                      {days.map((day) => {
                        const res = reservationForDay(room, day);
                        return (
                          <td
                            key={day}
                            onClick={() => res ? openReservationDetail(res.id) : openCreateReservation(room.id, day)}
                            title={res ? `${res.guestName} (${RESERVATION_STATUS_LABEL[res.status]})` : 'Disponible — click para reservar'}
                            style={{
                              padding: '8px 6px', borderBottom: '1px solid var(--border)', textAlign: 'center', cursor: 'pointer',
                              background: res ? (res.status === 'CHECKED_IN' ? 'var(--info-bg, #1d4ed822)' : 'var(--warning-bg, #f59e0b22)') : 'transparent',
                              fontSize: 10, color: res ? 'var(--text)' : 'var(--text3)',
                            }}
                          >
                            {res ? res.guestName.split(' ')[0] : ''}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Modal: tipos de habitación */}
      {roomTypesModalOpen && (
        <div className="modal-overlay" onClick={() => setRoomTypesModalOpen(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Tipos de habitación</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setRoomTypesModalOpen(false)}><X size={15} /></button>
            </div>

            <div className="modal-body">
              {/* Lista tipo flex en vez de <table> -- con solo 3 datos cortos + 2
                  botones por fila no hace falta una grilla rigida que en
                  mobile termina recortando la columna de acciones; esto envuelve
                  solo, sin scroll horizontal. */}
              <div style={{ marginBottom: 14 }}>
                {roomTypes.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>Sin tipos de habitación todavía</div>
                ) : (
                  roomTypes.map((rt) => (
                    <div key={rt.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 2px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{rt.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{fmtMoney(rt.nightlyRate)}/noche · cap. {rt.capacity}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => editRoomType(rt)}>Editar</button>
                        <button className="btn btn-ghost btn-xs" onClick={() => removeRoomType(rt)} style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>
                  {editingRoomTypeId ? 'Editar tipo' : 'Nuevo tipo de habitación'}
                </div>
                <div className="form-group">
                  <label className="form-label">Nombre</label>
                  <input value={roomTypeForm.name} onChange={(e) => setRoomTypeForm((f) => ({ ...f, name: e.target.value }))} placeholder="Individual, Doble, Suite..." style={{ width: '100%' }} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Tarifa/noche</label>
                    <input type="number" min={0} value={roomTypeForm.nightlyRate} onChange={(e) => setRoomTypeForm((f) => ({ ...f, nightlyRate: e.target.value }))} style={{ width: '100%' }} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Capacidad</label>
                    <input type="number" min={1} value={roomTypeForm.capacity} onChange={(e) => setRoomTypeForm((f) => ({ ...f, capacity: e.target.value }))} style={{ width: '100%' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  {editingRoomTypeId && <button className="btn btn-ghost btn-sm" onClick={resetRoomTypeForm}>Cancelar</button>}
                  <button className="btn btn-primary btn-sm" onClick={submitRoomType} disabled={saving}>
                    {editingRoomTypeId ? 'Guardar' : 'Agregar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: crear/editar habitación */}
      {roomModal && (
        <div className="modal-overlay" onClick={() => setRoomModal(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{roomModal === 'edit' ? 'Editar habitación' : 'Nueva habitación'}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setRoomModal(null)}><X size={15} /></button>
            </div>

            <div className="modal-body">
              {roomModal === 'edit' && editingRoom && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                  {(Object.keys(ROOM_STATUS_LABEL) as RoomStatus[]).map((s) => (
                    <button
                      key={s}
                      className={`btn btn-xs ${editingRoom.status === s ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setRoomStatus(editingRoom, s)}
                    >
                      {ROOM_STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Tipo de habitación</label>
                <SearchableSelect value={roomForm.roomTypeId} onChange={(v) => setRoomForm((f) => ({ ...f, roomTypeId: v }))} options={roomTypeOptions} placeholder="Elegir tipo..." />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Número / nombre</label>
                  <input value={roomForm.number} onChange={(e) => setRoomForm((f) => ({ ...f, number: e.target.value }))} placeholder="101" style={{ width: '100%' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Piso</label>
                  <input value={roomForm.floor} onChange={(e) => setRoomForm((f) => ({ ...f, floor: e.target.value }))} style={{ width: '100%' }} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Sucursal</label>
                <select value={roomForm.businessLocationId} onChange={(e) => setRoomForm((f) => ({ ...f, businessLocationId: e.target.value }))} style={{ width: '100%' }}>
                  <option value="">Sin asignar</option>
                  {businessLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Dirección propia (opcional — para una cabaña sin sucursal)
                </div>
                <div className="form-group">
                  <input value={roomForm.addressStreet} onChange={(e) => setRoomForm((f) => ({ ...f, addressStreet: e.target.value }))} placeholder="Calle y número" style={{ width: '100%' }} />
                </div>
                <div className="form-row" style={{ marginBottom: 0 }}>
                  <input value={roomForm.addressCity} onChange={(e) => setRoomForm((f) => ({ ...f, addressCity: e.target.value }))} placeholder="Ciudad" style={{ width: '100%' }} />
                  <input value={roomForm.addressProvince} onChange={(e) => setRoomForm((f) => ({ ...f, addressProvince: e.target.value }))} placeholder="Provincia" style={{ width: '100%' }} />
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Foto</div>
                {roomModal === 'edit' && editingRoom ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: uploadingImage ? 'default' : 'pointer' }}>
                    <div style={{ width: 64, height: 64, borderRadius: 8, background: 'var(--surface2)', border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                      {uploadingImage ? (
                        <span className="spinner" style={{ width: 18, height: 18 }} />
                      ) : editingRoom.imageUrl ? (
                        <img src={editingRoom.imageUrl} alt={editingRoom.number} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <BedDouble size={20} style={{ color: 'var(--text3)' }} />
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--accent)' }}>{editingRoom.imageUrl ? 'Cambiar foto' : 'Subir foto'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={uploadingImage}
                      style={{ display: 'none' }}
                      onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadRoomImage(file); e.target.value = ''; }}
                    />
                  </label>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Guardá la habitación primero para poder subirle una foto.</div>
                )}
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              {roomModal === 'edit' && editingRoom ? (
                <button className="btn btn-ghost btn-sm" onClick={() => removeRoom(editingRoom)} style={{ color: 'var(--danger)' }}><Trash2 size={13} /></button>
              ) : <span />}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setRoomModal(null)}>Cancelar</button>
                <button className="btn btn-primary btn-sm" onClick={submitRoom} disabled={saving}>
                  {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: nueva reserva */}
      {reservationModal === 'create' && (
        <div className="modal-overlay" onClick={() => setReservationModal(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <BedDouble size={16} style={{ color: 'var(--accent)' }} /> Nueva reserva
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setReservationModal(null)}><X size={15} /></button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Habitación *</label>
                <SearchableSelect
                  value={reservationForm.roomId}
                  onChange={(v) => {
                    const room = rooms.find((r) => r.id === v);
                    setReservationForm((f) => ({ ...f, roomId: v, nightlyRate: room ? String(room.roomType.nightlyRate) : f.nightlyRate }));
                  }}
                  options={roomOptions}
                  placeholder="Elegir habitación..."
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Check-in *</label>
                  <input type="date" min={todayInputAR()} value={reservationForm.checkInDate} onChange={(e) => setReservationForm((f) => ({ ...f, checkInDate: e.target.value }))} style={{ width: '100%' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Check-out *</label>
                  <input type="date" min={reservationForm.checkInDate || todayInputAR()} value={reservationForm.checkOutDate} onChange={(e) => setReservationForm((f) => ({ ...f, checkOutDate: e.target.value }))} style={{ width: '100%' }} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Tarifa/noche</label>
                <input type="number" min={0} value={reservationForm.nightlyRate} onChange={(e) => setReservationForm((f) => ({ ...f, nightlyRate: e.target.value }))} placeholder="Se autocompleta con la tarifa del tipo de habitación" style={{ width: '100%' }} />
              </div>

              <div className="form-group">
                <label className="form-label">Cliente (opcional)</label>
                <SearchableSelect
                  value={reservationForm.clientId}
                  onChange={(v) => setReservationForm((f) => ({ ...f, clientId: v }))}
                  options={clientOptions}
                  placeholder="Sin cliente asignado"
                  onCreateNew={(q) => setNewClientQuery(q)}
                  createNewLabel={(q) => q ? `Crear cliente "${q}"` : 'Crear cliente nuevo'}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Nombre del huésped *</label>
                  <input value={reservationForm.guestName} onChange={(e) => setReservationForm((f) => ({ ...f, guestName: e.target.value }))} style={{ width: '100%' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input value={reservationForm.guestPhone} onChange={(e) => setReservationForm((f) => ({ ...f, guestPhone: e.target.value }))} style={{ width: '100%' }} />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Notas</label>
                <textarea value={reservationForm.notes} onChange={(e) => setReservationForm((f) => ({ ...f, notes: e.target.value }))} rows={2} style={{ width: '100%', resize: 'vertical' }} />
              </div>

              {reservationForm.checkInDate && reservationForm.checkOutDate && (
                <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text3)' }}>
                  {nightsBetween(reservationForm.checkInDate, reservationForm.checkOutDate)} noche(s)
                  {reservationForm.nightlyRate !== '' && Number.isFinite(Number(reservationForm.nightlyRate)) && (
                    <> · total estimado: <strong style={{ color: 'var(--text)' }}>{fmtMoney(nightsBetween(reservationForm.checkInDate, reservationForm.checkOutDate) * Number(reservationForm.nightlyRate))}</strong></>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setReservationModal(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={createReservation} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Reservar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: detalle de reserva */}
      {reservationModal === 'detail' && selected && (
        <div className="modal-overlay" onClick={() => setReservationModal(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <BedDouble size={16} style={{ color: 'var(--accent)' }} />
                  {selected.guestName}
                  <span className={`badge ${RESERVATION_STATUS_BADGE[selected.status]}`}>{RESERVATION_STATUS_LABEL[selected.status]}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>
                  Hab. {selected.room?.number} ({selected.room?.roomType?.name}) · {formatShortDateAR(selected.checkInDate)} → {formatShortDateAR(selected.checkOutDate)}
                  {selected.client ? ` · ${clientName(selected.client)}` : ''}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setReservationModal(null)}><X size={15} /></button>
            </div>

            <div className="modal-body">
              <div className="grid-responsive" style={{ gap: 10, marginBottom: 14 }}>
                {[
                  ['Teléfono', selected.guestPhone || '—'],
                  ['Noches', String(nightsBetween(toDateInputAR(selected.checkInDate), toDateInputAR(selected.checkOutDate)))],
                  ['Tarifa/noche', fmtMoney(selected.nightlyRateSnapshot)],
                  ['Total', fmtMoney(selected.totalAmount)],
                ].map(([k, v]) => (
                  <div key={k}><div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{k}</div><div style={{ fontSize: 13, color: 'var(--text)' }}>{v}</div></div>
                ))}
              </div>

              {selected.notes && (
                <div className="form-group">
                  <label className="form-label">Notas</label>
                  <div style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px' }}>{selected.notes}</div>
                </div>
              )}

              {selected.saleId && selected.sale && (
                <div style={{ fontSize: 12, color: 'var(--text2)', background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px', marginBottom: 16 }}>
                  Cobrada por <strong style={{ fontFamily: 'var(--mono)' }}>{fmtMoney(selected.sale.total)}</strong> ({selected.sale.receiptType === 'FACTURA' ? 'factura' : 'ticket'}) — gestioná la factura AFIP desde Facturación si todavía está pendiente.
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selected.status === 'RESERVADA' && (
                  <button className="btn btn-secondary btn-sm" onClick={doCheckIn} style={{ gap: 6 }}><LogIn size={13} /> Check-in</button>
                )}
                {(selected.status === 'CHECKED_IN' || selected.status === 'RESERVADA') && !selected.saleId && (
                  <button className="btn btn-primary btn-sm" onClick={openCheckout} style={{ gap: 6 }}><CreditCard size={13} /> Cobrar</button>
                )}
                {(selected.status === 'RESERVADA' || selected.status === 'CHECKED_IN') && (
                  <button className="btn btn-danger btn-sm" onClick={askCancelReservation} style={{ gap: 6 }}><LogOut size={13} /> Cancelar reserva</button>
                )}
                {!selected.saleId && (
                  <button className="btn btn-ghost btn-sm" onClick={askDeleteReservation} style={{ color: 'var(--danger)' }}><Trash2 size={13} /></button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: cobrar estadía */}
      {checkoutOpen && selected && (
        <div className="modal-overlay" onClick={() => setCheckoutOpen(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Cobrar estadía</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setCheckoutOpen(false)}><X size={15} /></button>
            </div>

            <div className="modal-body">
              <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '10px 12px', marginBottom: 14, fontSize: 13 }}>
                Total a cobrar: <strong style={{ fontFamily: 'var(--mono)' }}>{fmtMoney(selected.totalAmount)}</strong>
              </div>

              <div className="form-group">
                <label className="form-label">Sucursal / depósito</label>
                <select value={checkoutForm.businessLocationId} onChange={(e) => setCheckoutForm((f) => ({ ...f, businessLocationId: e.target.value }))} style={{ width: '100%' }}>
                  <option value="">Seleccionar...</option>
                  {businessLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Método de pago</label>
                  <select value={checkoutForm.paymentMethod} onChange={(e) => setCheckoutForm((f) => ({ ...f, paymentMethod: e.target.value as PaymentMethod }))} style={{ width: '100%' }}>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Comprobante</label>
                  <select value={checkoutForm.receiptType} onChange={(e) => setCheckoutForm((f) => ({ ...f, receiptType: e.target.value as ReceiptType }))} style={{ width: '100%' }}>
                    <option value="TICKET">Ticket</option>
                    <option value="FACTURA">Factura</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setCheckoutOpen(false)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={submitCheckout} disabled={saving} style={{ gap: 6 }}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <><CreditCard size={13} /> Confirmar cobro</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <ClientFormModal
        open={newClientQuery !== null}
        onClose={() => setNewClientQuery(null)}
        initialQuery={newClientQuery ?? ''}
        onCreated={(client) => {
          setClients((prev) => [client, ...prev]);
          setReservationForm((f) => ({ ...f, clientId: client.id }));
          setNewClientQuery(null);
          toast.success('Cliente creado');
        }}
      />

      <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
    </AppLayout>
  );
}
