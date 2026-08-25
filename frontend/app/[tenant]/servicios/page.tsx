/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import ConfirmModal, { type ConfirmState } from '@/components/ConfirmModal';
import SearchableSelect from '@/components/SearchableSelect';
import api from '@/lib/api';
import type { Client, Product, RepairOrder, RepairOrderStatus, PaymentMethod, ReceiptType } from '@/types';
import { fmtDate, fmtMoney, normalizeArray, num, clientName } from '@/lib/helpers';
import { todayInputAR } from '@/lib/dateAR';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
import {
  Wrench, Plus, X, Eye, RefreshCcw, Trash2, Share2, CreditCard, Copy, Check, Download,
} from 'lucide-react';

const STATUS_LABEL: Record<RepairOrderStatus, string> = {
  RECEIVED: 'Recibido', BUDGETED: 'Presupuestado', APPROVED: 'Aprobado', REJECTED: 'Rechazado',
  IN_PROGRESS: 'En reparación', READY: 'Listo para retirar', DELIVERED: 'Entregado', CANCELLED: 'Cancelado',
};
const STATUS_BADGE: Record<RepairOrderStatus, string> = {
  RECEIVED: 'badge-gray', BUDGETED: 'badge-amber', APPROVED: 'badge-cyan', REJECTED: 'badge-red',
  IN_PROGRESS: 'badge-blue', READY: 'badge-green', DELIVERED: 'badge-slate', CANCELLED: 'badge-red',
};
// Espeja backend/src/services/repairOrder.service.ts#ALLOWED_TRANSITIONS -- solo
// para mostrar los botones correctos; el backend es quien valida de verdad.
const NEXT_STATUS: Record<RepairOrderStatus, { next: RepairOrderStatus; label: string }[]> = {
  RECEIVED: [{ next: 'IN_PROGRESS', label: 'Iniciar diagnóstico' }],
  BUDGETED: [],
  APPROVED: [{ next: 'IN_PROGRESS', label: 'Iniciar reparación' }],
  REJECTED: [{ next: 'BUDGETED', label: 'Volver a presupuestar' }],
  IN_PROGRESS: [{ next: 'READY', label: 'Marcar listo para retirar' }],
  READY: [{ next: 'IN_PROGRESS', label: 'Volver a reparación' }],
  DELIVERED: [],
  CANCELLED: [],
};
const CHECKOUT_STATUSES = new Set<RepairOrderStatus>(['APPROVED', 'IN_PROGRESS', 'READY']);
const LOCKED_STATUSES = new Set<RepairOrderStatus>(['DELIVERED', 'CANCELLED']);

const PAYMENT_METHODS: PaymentMethod[] = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'QR_MERCADOPAGO', 'QR_NACION', 'CUENTA_CORRIENTE'];

const emptyForm = {
  clientId: '', deviceType: '', deviceBrand: '', deviceModel: '', deviceSerial: '',
  deviceAccessories: '', deviceConditionNotes: '', reportedIssue: '', estimatedDeliveryDate: '', notes: '',
};

export default function ServiciosPage() {
  const [orders, setOrders] = useState<RepairOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [businessLocations, setBusinessLocations] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const [modal, setModal] = useState<'create' | 'detail' | null>(null);
  const [selected, setSelected] = useState<RepairOrder | null>(null);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  const [form, setForm] = useState(emptyForm);

  const [itemMode, setItemMode] = useState<'product' | 'text'>('text');
  const [itemForm, setItemForm] = useState({ productId: '', description: '', quantity: '1', unitPrice: '' });

  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({ paymentMethod: 'EFECTIVO' as PaymentMethod, receiptType: 'TICKET' as ReceiptType, businessLocationId: '' });

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { limit: 100 };
      if (statusFilter) params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get('/repair-orders', { params });
      setOrders(normalizeArray<RepairOrder>(data));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [statusFilter]);
  useEffect(() => { const t = setTimeout(load, 350); return () => clearTimeout(t); }, [search]);

  useEffect(() => {
    (async () => {
      try {
        const [clRes, prRes, locRes] = await Promise.all([
          api.get('/clients', { params: { limit: 500 } }),
          api.get('/products', { params: { limit: 500, isActive: true } }),
          api.get('/business-locations').catch(() => null),
        ]);
        setClients(normalizeArray<Client>(clRes.data));
        setProducts(normalizeArray<Product>(prRes.data));
        if (locRes) setBusinessLocations(normalizeArray<any>(locRes.data));
      } catch { /* selects quedan vacios, no bloquea la pantalla */ }
    })();
  }, []);

  const openCreate = () => { setForm(emptyForm); setModal('create'); };

  const createOrder = async () => {
    if (!form.deviceType.trim() || !form.reportedIssue.trim()) return;
    setSaving(true);
    try {
      await api.post('/repair-orders', {
        ...form,
        clientId: form.clientId || undefined,
        estimatedDeliveryDate: form.estimatedDeliveryDate || undefined,
      });
      showToast('Reparación recibida');
      setModal(null);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al crear la reparación');
    } finally { setSaving(false); }
  };

  const refreshSelected = async (id: string) => {
    const { data } = await api.get(`/repair-orders/${id}`);
    setSelected(data);
    setOrders((prev) => prev.map((o) => (o.id === id ? data : o)));
    return data as RepairOrder;
  };

  const openDetail = async (order: RepairOrder) => {
    setShareLink('');
    setItemMode('text');
    setItemForm({ productId: '', description: '', quantity: '1', unitPrice: '' });
    try {
      const { data } = await api.get(`/repair-orders/${order.id}`);
      setSelected(data);
      setModal('detail');
    } catch { showToast('Error al cargar el detalle'); }
  };

  const saveDiagnosis = async (diagnosis: string) => {
    if (!selected) return;
    try {
      await api.patch(`/repair-orders/${selected.id}`, { diagnosis });
      showToast('Diagnóstico guardado');
      refreshSelected(selected.id);
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al guardar');
    }
  };

  const addItem = async () => {
    if (!selected) return;
    const unitPrice = Number(itemForm.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return showToast('Precio inválido');
    if (itemMode === 'product' && !itemForm.productId) return showToast('Elegí un producto');
    if (itemMode === 'text' && !itemForm.description.trim()) return showToast('Escribí una descripción');

    setSaving(true);
    try {
      await api.post(`/repair-orders/${selected.id}/items`, {
        productId: itemMode === 'product' ? itemForm.productId : undefined,
        description: itemForm.description || undefined,
        quantity: Number(itemForm.quantity) || 1,
        unitPrice,
      });
      setItemForm({ productId: '', description: '', quantity: '1', unitPrice: '' });
      showToast('Ítem agregado');
      refreshSelected(selected.id);
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al agregar el ítem');
    } finally { setSaving(false); }
  };

  const removeItem = async (itemId: string) => {
    if (!selected) return;
    try {
      await api.delete(`/repair-orders/${selected.id}/items/${itemId}`);
      refreshSelected(selected.id);
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al quitar el ítem');
    }
  };

  const changeStatus = async (next: RepairOrderStatus) => {
    if (!selected) return;
    try {
      await api.patch(`/repair-orders/${selected.id}/status`, { status: next });
      showToast(`Estado actualizado a "${STATUS_LABEL[next]}"`);
      refreshSelected(selected.id);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al cambiar el estado');
    }
  };

  const askCancel = () => {
    if (!selected) return;
    setConfirmState({
      title: 'Cancelar reparación',
      message: '¿Cancelar esta reparación? El equipo queda marcado como no reparado.',
      onConfirm: () => changeStatus('CANCELLED'),
    });
  };

  const askDelete = () => {
    if (!selected) return;
    setConfirmState({
      title: 'Eliminar reparación',
      message: '¿Eliminar este registro por completo? Esta acción no se puede deshacer.',
      onConfirm: async () => {
        try {
          await api.delete(`/repair-orders/${selected.id}`);
          showToast('Reparación eliminada');
          setModal(null);
          load();
        } catch (err: any) {
          showToast(err?.response?.data?.message ?? 'Error al eliminar');
        }
      },
    });
  };

  const generateLink = async () => {
    if (!selected) return;
    try {
      const { data } = await api.post(`/repair-orders/${selected.id}/approval-link`);
      const url = `${window.location.origin}/presupuesto/${data.token}`;
      setShareLink(url);
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al generar el link');
    }
  };

  const downloadPdf = async () => {
    if (!selected) return;
    try {
      const res = await api.get(`/repair-orders/${selected.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `presupuesto-reparacion-${selected.id.slice(-8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('No se pudo generar el PDF');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { showToast('No se pudo copiar'); }
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
    if (!checkoutForm.businessLocationId) return showToast('Elegí la sucursal/depósito del cobro');
    setSaving(true);
    try {
      await api.post(`/repair-orders/${selected.id}/checkout`, {
        paymentMethod: checkoutForm.paymentMethod,
        receiptType: checkoutForm.receiptType,
        businessLocationId: checkoutForm.businessLocationId,
        stockLocationId: checkoutForm.businessLocationId,
      });
      showToast('Reparación cobrada — ya figura en Ventas');
      setCheckoutOpen(false);
      refreshSelected(selected.id);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al cobrar');
    } finally { setSaving(false); }
  };

  const productOptions = useMemo(
    () => products.map((p) => ({ value: p.id, label: `${p.name}${p.sku ? ` (${p.sku})` : ''}` })),
    [products]
  );
  const clientOptions = useMemo(
    () => clients.map((c) => ({ value: c.id, label: `${clientName(c)} — ${c.dni}` })),
    [clients]
  );

  const deviceLabel = (o: RepairOrder) => [o.deviceBrand, o.deviceModel].filter(Boolean).join(' ') || o.deviceType;

  return (
    <AppLayout
      title="Servicios"
      subtitle={`${orders.length} reparaciones`}
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} className="btn btn-ghost btn-sm"><RefreshCcw size={13} /></button>
          <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
            <Plus size={13} /> Recibir equipo
          </button>
        </div>
      }
    >
      {toast && (
        <div style={{ position: 'fixed', top: 'calc(var(--app-header-height, 56px) + 14px)', right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)' }}>{toast}</div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ fontSize: 13 }}>
          <option value="">Todos los estados</option>
          {(Object.keys(STATUS_LABEL) as RepairOrderStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente, equipo o falla..." style={{ fontSize: 13, minWidth: 240 }} />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : (
          <ResponsiveTable
            data={orders}
            keyFor={(o) => o.id}
            emptyIcon={Wrench}
            emptyMessage="Sin reparaciones registradas"
            columns={[
              { key: 'fecha', header: 'Fecha', render: (o) => <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtDate(o.createdAt)}</span> },
              { key: 'cliente', header: 'Cliente', render: (o) => <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>{o.client ? clientName(o.client) : 'Sin cliente'}</span> },
              { key: 'equipo', header: 'Equipo', render: (o) => <span style={{ fontSize: 13, color: 'var(--text2)' }}>{deviceLabel(o)}</span> },
              { key: 'falla', header: 'Falla reportada', render: (o) => <span style={{ fontSize: 12, color: 'var(--text3)' }}>{o.reportedIssue}</span> },
              { key: 'estado', header: 'Estado', render: (o) => <span className={`badge ${STATUS_BADGE[o.status]}`}>{STATUS_LABEL[o.status]}</span> },
              { key: 'total', header: 'Presupuesto', style: { textAlign: 'right' }, render: (o) => <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{fmtMoney(o.totalAmount)}</span> },
              { key: 'acciones', header: '', render: (o) => <button onClick={() => openDetail(o)} className="btn btn-ghost btn-xs"><Eye size={12} /></button> },
            ] as ResponsiveTableColumn<RepairOrder>[]}
            renderMobileCard={(o) => (
              <div onClick={() => openDetail(o)} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="mobile-card-head">
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>{fmtDate(o.createdAt)}</span>
                  <span className={`badge ${STATUS_BADGE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{o.client ? clientName(o.client) : 'Sin cliente'} · {deviceLabel(o)}</div>
                <div className="mobile-card-row">
                  <span>{o.reportedIssue}</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{fmtMoney(o.totalAmount)}</span>
                </div>
              </div>
            )}
          />
        )}
      </div>

      {/* Modal: recibir equipo */}
      {modal === 'create' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" style={{ padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Wrench size={16} style={{ color: 'var(--accent)' }} /> Recibir equipo
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={15} /></button>
            </div>

            <div className="form-group">
              <label className="form-label">Cliente</label>
              <SearchableSelect value={form.clientId} onChange={(v) => setForm((f) => ({ ...f, clientId: v }))} options={clientOptions} placeholder="Sin cliente asignado" />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Tipo de equipo *</label>
                <input value={form.deviceType} onChange={(e) => setForm((f) => ({ ...f, deviceType: e.target.value }))} placeholder="Celular, notebook, TV..." style={{ width: '100%' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha estimada de entrega</label>
                <input type="date" min={todayInputAR()} value={form.estimatedDeliveryDate} onChange={(e) => setForm((f) => ({ ...f, estimatedDeliveryDate: e.target.value }))} style={{ width: '100%' }} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Marca</label>
                <input value={form.deviceBrand} onChange={(e) => setForm((f) => ({ ...f, deviceBrand: e.target.value }))} style={{ width: '100%' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Modelo</label>
                <input value={form.deviceModel} onChange={(e) => setForm((f) => ({ ...f, deviceModel: e.target.value }))} style={{ width: '100%' }} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">N° de serie / IMEI</label>
              <input value={form.deviceSerial} onChange={(e) => setForm((f) => ({ ...f, deviceSerial: e.target.value }))} style={{ width: '100%' }} />
            </div>

            <div className="form-group">
              <label className="form-label">Accesorios entregados</label>
              <input value={form.deviceAccessories} onChange={(e) => setForm((f) => ({ ...f, deviceAccessories: e.target.value }))} placeholder="Cargador, funda..." style={{ width: '100%' }} />
            </div>

            <div className="form-group">
              <label className="form-label">Estado físico al recibir</label>
              <textarea value={form.deviceConditionNotes} onChange={(e) => setForm((f) => ({ ...f, deviceConditionNotes: e.target.value }))} rows={2} style={{ width: '100%', resize: 'vertical' }} />
            </div>

            <div className="form-group">
              <label className="form-label">Falla reportada por el cliente *</label>
              <textarea value={form.reportedIssue} onChange={(e) => setForm((f) => ({ ...f, reportedIssue: e.target.value }))} rows={2} style={{ width: '100%', resize: 'vertical' }} />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Notas internas</label>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} style={{ width: '100%', resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={createOrder} disabled={saving || !form.deviceType.trim() || !form.reportedIssue.trim()}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Recibir equipo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: detalle */}
      {modal === 'detail' && selected && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" style={{ padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Wrench size={16} style={{ color: 'var(--accent)' }} />
                  {deviceLabel(selected)}
                  <span className={`badge ${STATUS_BADGE[selected.status]}`}>{STATUS_LABEL[selected.status]}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>
                  {selected.client ? clientName(selected.client) : 'Sin cliente'} · Recibido {fmtDate(selected.receivedAt || selected.createdAt)}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={15} /></button>
            </div>

            {/* Info del equipo */}
            <div className="grid-responsive" style={{ gap: 10, marginBottom: 14 }}>
              {[
                ['N° serie / IMEI', selected.deviceSerial || '—'],
                ['Accesorios', selected.deviceAccessories || '—'],
                ['Estado al recibir', selected.deviceConditionNotes || '—'],
                ['Entrega estimada', selected.estimatedDeliveryDate ? fmtDate(selected.estimatedDeliveryDate) : '—'],
              ].map(([k, v]) => (
                <div key={k}><div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{k}</div><div style={{ fontSize: 13, color: 'var(--text)' }}>{v}</div></div>
              ))}
            </div>

            <div className="form-group">
              <label className="form-label">Falla reportada</label>
              <div style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px' }}>{selected.reportedIssue}</div>
            </div>

            <div className="form-group">
              <label className="form-label">Diagnóstico técnico</label>
              <textarea
                defaultValue={selected.diagnosis || ''}
                key={selected.id + (selected.diagnosis || '')}
                onBlur={(e) => { if (e.target.value !== (selected.diagnosis || '')) saveDiagnosis(e.target.value); }}
                disabled={LOCKED_STATUSES.has(selected.status)}
                rows={2}
                placeholder="Se completa al revisar el equipo..."
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>

            {/* Acciones de estado */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {NEXT_STATUS[selected.status].map((t) => (
                <button key={t.next} className="btn btn-secondary btn-sm" onClick={() => changeStatus(t.next)}>{t.label}</button>
              ))}
              {selected.status === 'BUDGETED' && (
                <>
                  <button className="btn btn-secondary btn-sm" onClick={() => changeStatus('APPROVED')}>Marcar aprobado</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => changeStatus('REJECTED')}>Marcar rechazado</button>
                </>
              )}
              {selected.items.length > 0 && !LOCKED_STATUSES.has(selected.status) && (
                <button className="btn btn-secondary btn-sm" onClick={generateLink} style={{ gap: 6 }}><Share2 size={13} /> Compartir presupuesto</button>
              )}
              {selected.items.length > 0 && (
                <button className="btn btn-secondary btn-sm" onClick={downloadPdf} style={{ gap: 6 }}><Download size={13} /> Descargar PDF</button>
              )}
              {CHECKOUT_STATUSES.has(selected.status) && !selected.saleId && (
                <button className="btn btn-primary btn-sm" onClick={openCheckout} style={{ gap: 6 }}><CreditCard size={13} /> Cobrar</button>
              )}
              {!LOCKED_STATUSES.has(selected.status) && (
                <button className="btn btn-danger btn-sm" onClick={askCancel}>Cancelar reparación</button>
              )}
              {!selected.saleId && (
                <button className="btn btn-ghost btn-sm" onClick={askDelete} style={{ color: 'var(--danger)' }}><Trash2 size={13} /></button>
              )}
            </div>

            {shareLink && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px', marginBottom: 16, fontSize: 12 }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>{shareLink}</span>
                <button className="btn btn-ghost btn-xs" onClick={copyLink}>{copied ? <Check size={13} /> : <Copy size={13} />}</button>
                <a href={`https://wa.me/?text=${encodeURIComponent(`Hola! Te comparto el presupuesto de tu reparación: ${shareLink}`)}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-xs">WhatsApp</a>
              </div>
            )}

            {selected.saleId && selected.sale && (
              <div style={{ fontSize: 12, color: 'var(--text2)', background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px', marginBottom: 16 }}>
                Cobrada por <strong style={{ fontFamily: 'var(--mono)' }}>{fmtMoney(selected.sale.total)}</strong> ({selected.sale.receiptType === 'FACTURA' ? 'factura' : 'ticket'}) — gestioná la factura AFIP desde Facturación si todavía está pendiente.
              </div>
            )}

            {/* Items del presupuesto */}
            <div style={{ marginBottom: 10 }}>
              <span className="section-title" style={{ fontSize: 12 }}>Presupuesto</span>
            </div>
            <div className="table-wrap" style={{ marginBottom: 14 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Descripción', 'Cant.', 'Precio u.', 'Subtotal', ''].map((h) => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((it) => (
                    <tr key={it.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px', color: 'var(--text)' }}>{it.description}{it.productId && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text3)' }}>(repuesto)</span>}</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'var(--mono)' }}>{it.quantity}</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'var(--mono)' }}>{fmtMoney(it.unitPrice)}</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{fmtMoney(it.subtotal)}</td>
                      <td style={{ padding: '8px 10px' }}>
                        {!LOCKED_STATUSES.has(selected.status) && (
                          <button className="btn btn-ghost btn-xs" onClick={() => removeItem(it.id)}><X size={12} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {selected.items.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>Sin ítems todavía</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text2)' }}>Total</td>
                    <td colSpan={2} style={{ padding: '8px 10px', fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--accent)' }}>{fmtMoney(selected.totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {!LOCKED_STATUSES.has(selected.status) && (
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <button className={`btn btn-sm ${itemMode === 'text' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setItemMode('text')}>Mano de obra / otro</button>
                  <button className={`btn btn-sm ${itemMode === 'product' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setItemMode('product')}>Repuesto del catálogo</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: itemMode === 'product' ? '2fr 80px 100px 90px' : '2fr 80px 100px 90px', gap: 8, alignItems: 'end' }}>
                  {itemMode === 'product' ? (
                    <div>
                      <SearchableSelect
                        value={itemForm.productId}
                        onChange={(v) => {
                          const p = products.find((pr) => pr.id === v);
                          setItemForm((f) => ({ ...f, productId: v, unitPrice: p ? String(p.price ?? '') : f.unitPrice }));
                        }}
                        options={productOptions}
                        placeholder="Elegir producto..."
                      />
                    </div>
                  ) : (
                    <input value={itemForm.description} onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))} placeholder="Descripción (ej. cambio de pantalla)" style={{ fontSize: 13 }} />
                  )}
                  <input type="number" min={1} value={itemForm.quantity} onChange={(e) => setItemForm((f) => ({ ...f, quantity: e.target.value }))} placeholder="Cant." style={{ fontSize: 13 }} />
                  <input type="number" min={0} value={itemForm.unitPrice} onChange={(e) => setItemForm((f) => ({ ...f, unitPrice: e.target.value }))} placeholder="Precio" style={{ fontSize: 13 }} />
                  <button className="btn btn-secondary btn-sm" onClick={addItem} disabled={saving} style={{ gap: 5 }}><Plus size={12} /> Agregar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: cobrar */}
      {checkoutOpen && selected && (
        <div className="modal-overlay" onClick={() => setCheckoutOpen(false)}>
          <div className="modal" style={{ padding: 24, maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Cobrar reparación</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setCheckoutOpen(false)}><X size={15} /></button>
            </div>

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
              <div className="form-group">
                <label className="form-label">Comprobante</label>
                <select value={checkoutForm.receiptType} onChange={(e) => setCheckoutForm((f) => ({ ...f, receiptType: e.target.value as ReceiptType }))} style={{ width: '100%' }}>
                  <option value="TICKET">Ticket</option>
                  <option value="FACTURA">Factura</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setCheckoutOpen(false)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={submitCheckout} disabled={saving} style={{ gap: 6 }}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <><CreditCard size={13} /> Confirmar cobro</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
    </AppLayout>
  );
}
