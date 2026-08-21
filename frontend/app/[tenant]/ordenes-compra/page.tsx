/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import { fmtDate, fmtMoney, normalizeArray, num } from '@/lib/helpers';
import { todayInputAR } from '@/lib/dateAR';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
import { ClipboardList, Truck, Package, Plus, X, Eye, CheckCircle, Trash2, RefreshCcw } from 'lucide-react';

type Status = 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';

const statusBadge: Record<Status, string> = {
  DRAFT: 'badge-amber',
  SENT: 'badge-cyan',
  PARTIAL: 'badge-cyan',
  RECEIVED: 'badge-green',
  CANCELLED: 'badge-red',
};
const statusLabel: Record<Status, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  PARTIAL: 'Parcial',
  RECEIVED: 'Recibida',
  CANCELLED: 'Cancelada',
};

export default function OrdenesCompraPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [modal, setModal] = useState<'create' | 'detail' | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [toast, setToast] = useState('');

  // Create form
  const [form, setForm] = useState({ supplierId: '', expectedDate: '', notes: '' });
  const [items, setItems] = useState<{ productId: string; quantityOrdered: string; unitCost: string }[]>([]);
  const [saving, setSaving] = useState(false);

  // Receive form
  const [receiveItems, setReceiveItems] = useState<Record<string, string>>({});

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { limit: 100 };
      if (statusFilter) params.status = statusFilter;
      const [ordRes, supRes, prodRes] = await Promise.all([
        api.get('/purchase-orders', { params }),
        api.get('/suppliers', { params: { isActive: true } }),
        api.get('/products', { params: { limit: 500, isActive: true } }),
      ]);
      setOrders(normalizeArray<any>(ordRes.data));
      setSuppliers(normalizeArray<any>(supRes.data));
      setProducts(normalizeArray<any>(prodRes.data));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const openDetail = async (ord: any) => {
    try {
      const { data } = await api.get(`/purchase-orders/${ord.id}`);
      setSelected(data);
      const initial: Record<string, string> = {};
      (data.items ?? []).forEach((it: any) => { initial[it.productId] = ''; });
      setReceiveItems(initial);
      setModal('detail');
    } catch { showToast('Error al cargar detalle'); }
  };

  const addItem = () => setItems((p) => [...p, { productId: '', quantityOrdered: '1', unitCost: '' }]);
  const removeItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, k: string, v: string) =>
    setItems((p) => { const n = [...p]; n[i] = { ...n[i], [k]: v }; return n; });

  const create = async () => {
    if (!items.length || items.some((it) => !it.productId)) return;
    setSaving(true);
    try {
      await api.post('/purchase-orders', {
        supplierId: form.supplierId || undefined,
        expectedDate: form.expectedDate || undefined,
        notes: form.notes || undefined,
        items: items.map((it) => ({
          productId: it.productId,
          quantity: Number(it.quantityOrdered),
          unitCost: it.unitCost ? Number(it.unitCost) : undefined,
        })),
      });
      showToast('Orden creada');
      setModal(null);
      setForm({ supplierId: '', expectedDate: '', notes: '' });
      setItems([]);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al crear');
    } finally { setSaving(false); }
  };

  const changeStatus = async (id: string, status: Status) => {
    try {
      await api.patch(`/purchase-orders/${id}/status`, { status });
      showToast(`Estado actualizado a ${statusLabel[status]}`);
      load();
      if (selected?.id === id) setSelected((s: any) => s ? { ...s, status } : s);
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error');
    }
  };

  const receive = async () => {
    if (!selected) return;
    const payload = Object.entries(receiveItems)
      .filter(([, qty]) => qty !== '' && Number(qty) > 0)
      .map(([productId, qty]) => ({ productId, receivedQuantity: Number(qty) }));
    if (!payload.length) return;
    setSaving(true);
    try {
      await api.post(`/purchase-orders/${selected.id}/receive`, { items: payload });
      showToast('Recepción registrada');
      setModal(null);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error');
    } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!confirm('¿Eliminar esta orden?')) return;
    try {
      await api.delete(`/purchase-orders/${id}`);
      showToast('Orden eliminada');
      load();
    } catch { showToast('Error al eliminar'); }
  };

  const estimatedTotal = (ord: any) =>
    (ord.items ?? []).reduce((a: number, it: any) => a + num(it.unitCost) * num(it.quantityOrdered), 0);

  return (
    <AppLayout
      title="Órdenes de Compra"
      subtitle={`${orders.length} órdenes`}
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => load()} className="btn btn-ghost btn-sm"><RefreshCcw size={13} /></button>
          <button onClick={() => { setForm({ supplierId: '', expectedDate: '', notes: '' }); setItems([]); setModal('create'); }} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
            <Plus size={13} /> Nueva Orden
          </button>
        </div>
      }
    >
      {toast && (
        <div style={{ position: 'fixed', top: 70, right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)' }}>{toast}</div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ fontSize: 13 }}>
          <option value="">Todos los estados</option>
          {(Object.keys(statusLabel) as Status[]).map((s) => (
            <option key={s} value={s}>{statusLabel[s]}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : (
          <ResponsiveTable
            data={orders}
            keyFor={(ord) => ord.id}
            emptyIcon={ClipboardList}
            emptyMessage="No hay órdenes"
            columns={[
              { key: 'numero', header: '#', render: (ord) => <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{ord.id?.slice(-6).toUpperCase()}</span> },
              {
                key: 'proveedor', header: 'Proveedor', render: (ord) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)' }}>
                    <Truck size={13} style={{ color: 'var(--text3)' }} />
                    {ord.supplier?.name ?? ord.supplier?.nombre ?? '—'}
                  </div>
                ),
              },
              { key: 'fecha', header: 'Fecha esperada', render: (ord) => <span style={{ color: 'var(--text2)' }}>{ord.expectedDate ? fmtDate(ord.expectedDate) : '—'}</span> },
              { key: 'estado', header: 'Estado', render: (ord) => <span className={`badge ${statusBadge[ord.status as Status] ?? 'badge-amber'}`}>{statusLabel[ord.status as Status] ?? ord.status}</span> },
              { key: 'items', header: 'Items', render: (ord) => <span style={{ color: 'var(--text2)' }}>{(ord.items ?? []).length}</span> },
              { key: 'total', header: 'Total estimado', render: (ord) => <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmtMoney(estimatedTotal(ord))}</span> },
              {
                key: 'acciones', header: 'Acciones', render: (ord) => (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openDetail(ord)} title="Ver detalle"><Eye size={13} /></button>
                    {ord.status !== 'CANCELLED' && ord.status !== 'RECEIVED' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => changeStatus(ord.id, 'SENT')} title="Marcar como enviada" style={{ color: 'var(--accent2)' }}><ClipboardList size={13} /></button>
                    )}
                    <button className="btn btn-danger btn-sm" onClick={() => del(ord.id)} title="Eliminar"><Trash2 size={13} /></button>
                  </div>
                ),
              },
            ] as ResponsiveTableColumn<any>[]}
            renderMobileCard={(ord) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="mobile-card-head">
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>#{ord.id?.slice(-6).toUpperCase()}</span>
                  <span className={`badge ${statusBadge[ord.status as Status] ?? 'badge-amber'}`}>{statusLabel[ord.status as Status] ?? ord.status}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  <Truck size={13} style={{ color: 'var(--text3)' }} />
                  {ord.supplier?.name ?? ord.supplier?.nombre ?? '—'}
                </div>
                <div className="mobile-card-row">
                  <span>Fecha esperada</span>
                  <span>{ord.expectedDate ? fmtDate(ord.expectedDate) : '—'}</span>
                </div>
                <div className="mobile-card-row">
                  <span>Items</span>
                  <span>{(ord.items ?? []).length}</span>
                </div>
                <div className="mobile-card-row">
                  <span>Total estimado</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmtMoney(estimatedTotal(ord))}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openDetail(ord)} title="Ver detalle"><Eye size={13} /> Detalle</button>
                  {ord.status !== 'CANCELLED' && ord.status !== 'RECEIVED' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => changeStatus(ord.id, 'SENT')} title="Marcar como enviada" style={{ color: 'var(--accent2)' }}><ClipboardList size={13} /></button>
                  )}
                  <button className="btn btn-danger btn-sm" onClick={() => del(ord.id)} title="Eliminar"><Trash2 size={13} /></button>
                </div>
              </div>
            )}
          />
        )}
      </div>

      {/* Create Modal */}
      {modal === 'create' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" style={{ padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <ClipboardList size={16} style={{ color: 'var(--accent)' }} /> Nueva Orden de Compra
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={15} /></button>
            </div>

            <div className="grid-responsive" style={{ gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Proveedor</label>
                <select value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))} style={{ width: '100%', fontSize: 13 }}>
                  <option value="">Sin proveedor</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name ?? s.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Fecha esperada</label>
                <input type="date" value={form.expectedDate} onChange={(e) => setForm((f) => ({ ...f, expectedDate: e.target.value }))} style={{ width: '100%', fontSize: 13 }} />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Notas</label>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} style={{ width: '100%', fontSize: 13, resize: 'vertical' }} />
            </div>

            {/* Items */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="section-title" style={{ fontSize: 12 }}>Productos</span>
                <button className="btn btn-secondary btn-sm" onClick={addItem} style={{ gap: 5 }}><Plus size={12} /> Agregar</button>
              </div>
              {items.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 12, textAlign: 'center', padding: 12 }}>Sin productos. Agregue al menos uno.</div>}
              <div className="line-item-scroll">
                {items.map((it, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 32px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <select value={it.productId} onChange={(e) => updateItem(i, 'productId', e.target.value)} style={{ fontSize: 13 }}>
                      <option value="">Producto...</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.nombre}</option>)}
                    </select>
                    <input type="number" min={1} placeholder="Cant." value={it.quantityOrdered} onChange={(e) => updateItem(i, 'quantityOrdered', e.target.value)} style={{ fontSize: 13 }} />
                    <input type="number" min={0} placeholder="Costo u." value={it.unitCost} onChange={(e) => updateItem(i, 'unitCost', e.target.value)} style={{ fontSize: 13 }} />
                    <button className="btn btn-ghost btn-sm" onClick={() => removeItem(i)}><X size={13} /></button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={create} disabled={saving || !items.length}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Crear Orden'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {modal === 'detail' && selected && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" style={{ padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Package size={16} style={{ color: 'var(--accent)' }} />
                  Orden #{selected.id?.slice(-6).toUpperCase()}
                  <span className={`badge ${statusBadge[selected.status as Status] ?? 'badge-amber'}`}>{statusLabel[selected.status as Status] ?? selected.status}</span>
                </div>
                {selected.supplier && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{selected.supplier.name ?? selected.supplier.nombre}</div>}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={15} /></button>
            </div>

            {/* Status actions */}
            {selected.status !== 'RECEIVED' && selected.status !== 'CANCELLED' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {selected.status === 'DRAFT' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => changeStatus(selected.id, 'SENT')}>Marcar como Enviada</button>
                )}
                {(selected.status === 'SENT' || selected.status === 'PARTIAL') && (
                  <button className="btn btn-secondary btn-sm" onClick={() => changeStatus(selected.id, 'RECEIVED')}>Marcar Recibida completa</button>
                )}
                <button className="btn btn-danger btn-sm" onClick={() => { changeStatus(selected.id, 'CANCELLED'); setModal(null); }}>Cancelar Orden</button>
              </div>
            )}

            {/* Items table */}
            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Producto', 'Solicitado', 'Recibido', 'Costo u.', 'Subtotal', 'Recibir ahora'].map((h) => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(selected.items ?? []).map((it: any) => (
                    <tr key={it.productId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', color: 'var(--text)' }}>{it.product?.name ?? it.product?.nombre ?? it.productId}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>{it.quantityOrdered}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>{it.quantityReceived ?? 0}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>{it.unitCost ? fmtMoney(it.unitCost) : '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{it.unitCost ? fmtMoney(num(it.unitCost) * num(it.quantityOrdered)) : '—'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        {selected.status !== 'RECEIVED' && selected.status !== 'CANCELLED' && (
                          <input
                            type="number" min={0} max={it.quantityOrdered}
                            placeholder="0"
                            value={receiveItems[it.productId] ?? ''}
                            onChange={(e) => setReceiveItems((r) => ({ ...r, [it.productId]: e.target.value }))}
                            style={{ width: 70, fontSize: 13 }}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selected.status !== 'RECEIVED' && selected.status !== 'CANCELLED' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setModal(null)}>Cerrar</button>
                <button className="btn btn-primary btn-sm" onClick={receive} disabled={saving} style={{ gap: 6 }}>
                  <CheckCircle size={13} /> {saving ? 'Guardando...' : 'Confirmar recepción'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
