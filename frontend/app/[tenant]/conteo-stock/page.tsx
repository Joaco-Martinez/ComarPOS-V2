/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useRef, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import SkuScannerModal from '@/components/SkuScannerModal';
import ConfirmModal, { type ConfirmState } from '@/components/ConfirmModal';
import api from '@/lib/api';
import type { BusinessLocation } from '@/types';
import { fmtDate, normalizeArray, num } from '@/lib/helpers';
import { ClipboardCheck, BarChart2, Play, CheckCircle, XCircle, ArrowLeft, RefreshCcw, ScanBarcode, X } from 'lucide-react';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';

type CountStatus = 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

const statusBadge: Record<CountStatus, string> = {
  IN_PROGRESS: 'badge-amber',
  COMPLETED: 'badge-green',
  CANCELLED: 'badge-red',
};
const statusLabel: Record<CountStatus, string> = {
  IN_PROGRESS: 'En progreso',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

export default function ConteoStockPage() {
  const [counts, setCounts] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [dirtyItems, setDirtyItems] = useState<Record<string, string>>({});
  const [scannerOpen, setScannerOpen] = useState(false);
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [startLocationId, setStartLocationId] = useState('');
  const [startModal, setStartModal] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const handleScannedSku = (rawSku: string) => {
    const sku = rawSku.trim().toLowerCase();
    const items: any[] = selected?.items ?? [];
    const found = items.find((it) => it.product?.sku && String(it.product.sku).trim().toLowerCase() === sku);
    if (!found) {
      showToast(`No encontré ningún producto con SKU: ${rawSku}`);
      return;
    }
    setScannerOpen(false);
    const input = inputRefs.current[found.productId];
    input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input?.focus();
    input?.select();
  };

  const load = async () => {
    setLoading(true);
    try {
      const [cr, loc] = await Promise.all([
        api.get('/stock-counts'),
        api.get('/business-locations', { params: { onlyActive: true } }),
      ]);
      setCounts(normalizeArray<any>(cr.data));
      const locs = normalizeArray<BusinessLocation>(loc.data);
      setLocations(locs);
      setStartLocationId((prev) => prev || locs.find((l) => l.isDefault)?.id || locs[0]?.id || '');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openDetail = async (count: any) => {
    setLoadingDetail(true);
    try {
      const { data } = await api.get(`/stock-counts/${count.id}`);
      setSelected(data);
      setDirtyItems({});
    } catch { showToast('Error al cargar detalle'); }
    finally { setLoadingDetail(false); }
  };

  const startCount = async () => {
    if (!startLocationId) { showToast('Elegí una ubicación para contar'); return; }
    setStarting(true);
    try {
      const { data } = await api.post('/stock-counts', { businessLocationId: startLocationId });
      showToast('Conteo iniciado');
      setStartModal(false);
      load();
      openDetail(data);
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al iniciar conteo');
    } finally { setStarting(false); }
  };

  const updateItem = async (productId: string, value: string) => {
    if (!selected) return;
    setDirtyItems((d) => ({ ...d, [productId]: value }));
    try {
      await api.put(`/stock-counts/${selected.id}/items/${productId}`, { countedStock: Number(value) });
    } catch { showToast('Error al actualizar ítem'); }
  };

  const complete = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post(`/stock-counts/${selected.id}/complete`);
      showToast('Conteo completado y ajustes aplicados');
      setSelected(null);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error');
    } finally { setSaving(false); }
  };

  const cancel = async () => {
    if (!selected) return;
    try {
      await api.post(`/stock-counts/${selected.id}/cancel`);
      showToast('Conteo cancelado');
      setSelected(null);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error');
    }
  };

  const totalDiff = (items: any[]) =>
    items.reduce((a, it) => a + (num(it.countedStock) - num(it.systemStock)), 0);

  // Detail view
  if (loadingDetail) {
    return (
      <AppLayout title="Conteo de Stock" subtitle="Cargando...">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><div className="spinner" /></div>
      </AppLayout>
    );
  }

  if (selected) {
    const items: any[] = selected.items ?? [];
    const diff = totalDiff(items);
    return (
      <AppLayout
        title={`Conteo #${selected.id?.slice(-6).toUpperCase()}`}
        subtitle={`${fmtDate(selected.startedAt ?? selected.createdAt)} — ${statusLabel[selected.status as CountStatus] ?? selected.status}`}
        actions={
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)} style={{ gap: 6 }}>
            <ArrowLeft size={13} /> Volver
          </button>
        }
      >
        {toast && (
          <div style={{ position: 'fixed', top: 'calc(var(--app-header-height, 56px) + 14px)', right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)' }}>{toast}</div>
        )}

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Productos', value: String(items.length), color: 'var(--accent)' },
            { label: 'Diferencia total', value: (diff > 0 ? '+' : '') + diff.toFixed(0), color: diff === 0 ? 'var(--text2)' : diff > 0 ? 'var(--success)' : 'var(--accent3)' },
            { label: 'Estado', value: statusLabel[selected.status as CountStatus] ?? selected.status, color: 'var(--text)' },
          ].map((s) => (
            <div key={s.label} className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)', color: s.color, marginTop: 4 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        {selected.status === 'IN_PROGRESS' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setConfirmState({
                title: 'Completar conteo',
                message: '¿Completar el conteo? Esto aplicará los ajustes de stock.',
                onConfirm: complete,
              })}
              disabled={saving}
              style={{ gap: 6 }}
            >
              <CheckCircle size={13} /> {saving ? 'Aplicando...' : 'Completar conteo'}
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setConfirmState({
                title: 'Cancelar conteo',
                message: '¿Cancelar este conteo? No se aplicará ningún cambio.',
                onConfirm: cancel,
              })}
              style={{ gap: 6 }}
            >
              <XCircle size={13} /> Cancelar
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setScannerOpen(true)} style={{ gap: 6 }}>
              <ScanBarcode size={13} /> Escanear
            </button>
          </div>
        )}

        <SkuScannerModal
          open={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onDetected={handleScannedSku}
          hint="Cuando lo detecte, salta directo a cargar la cantidad contada."
        />

        {/* Items table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Producto', 'SKU', 'En sistema', 'Contado', 'Diferencia'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it: any) => {
                  const counted = dirtyItems[it.productId] !== undefined ? Number(dirtyItems[it.productId]) : num(it.countedStock);
                  const system = num(it.systemStock);
                  const d = counted - system;
                  return (
                    <tr key={it.productId} style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,89,231,0.04)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                      <td style={{ padding: '8px 14px', color: 'var(--text)' }}>{it.product?.name ?? it.product?.nombre ?? it.productId}</td>
                      <td style={{ padding: '8px 14px', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>{it.product?.sku ?? '—'}</td>
                      <td style={{ padding: '8px 14px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>{system}</td>
                      <td style={{ padding: '8px 14px' }}>
                        {selected.status === 'IN_PROGRESS' ? (
                          <input
                            ref={(el) => { inputRefs.current[it.productId] = el; }}
                            type="number"
                            min={0}
                            value={dirtyItems[it.productId] ?? (it.countedStock ?? '')}
                            placeholder={String(system)}
                            onChange={(e) => setDirtyItems((d) => ({ ...d, [it.productId]: e.target.value }))}
                            onBlur={(e) => updateItem(it.productId, e.target.value)}
                            style={{ width: 80, fontSize: 13 }}
                          />
                        ) : (
                          <span style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{counted}</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 14px', fontFamily: 'var(--mono)', fontWeight: 700, color: d === 0 ? 'var(--text3)' : d > 0 ? 'var(--success)' : '#EF4444' }}>
                        {d > 0 ? `+${d}` : d === 0 ? '—' : d}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
      </AppLayout>
    );
  }

  // List view
  return (
    <AppLayout
      title="Conteo de Stock"
      subtitle="Auditoría y ajuste de inventario"
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => load()} className="btn btn-ghost btn-sm"><RefreshCcw size={13} /></button>
          <button onClick={() => setStartModal(true)} disabled={starting || locations.length === 0} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
            <Play size={13} /> {starting ? 'Iniciando...' : 'Iniciar conteo'}
          </button>
        </div>
      }
    >
      {toast && (
        <div style={{ position: 'fixed', top: 'calc(var(--app-header-height, 56px) + 14px)', right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)' }}>{toast}</div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : (
          <ResponsiveTable
            data={counts}
            keyFor={(c: any) => c.id}
            onRowClick={(c: any) => openDetail(c)}
            emptyIcon={BarChart2}
            emptyMessage="No hay conteos registrados. Inicia el primero."
            columns={[
              { key: 'id', header: '#', render: (c: any) => <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{c.id?.slice(-6).toUpperCase()}</span> },
              { key: 'fecha', header: 'Fecha inicio', render: (c: any) => <span style={{ color: 'var(--text2)' }}>{fmtDate(c.startedAt ?? c.createdAt)}</span> },
              { key: 'ubicacion', header: 'Ubicación', render: (c: any) => <span style={{ color: 'var(--text2)' }}>{c.businessLocation?.name ?? '—'}</span> },
              {
                key: 'estado', header: 'Estado', render: (c: any) => (
                  <span className={`badge ${statusBadge[c.status as CountStatus] ?? 'badge-amber'}`}>{statusLabel[c.status as CountStatus] ?? c.status}</span>
                ),
              },
              { key: 'productos', header: 'Productos', render: (c: any) => <span style={{ color: 'var(--text2)', fontFamily: 'var(--mono)' }}>{(c.items ?? []).length}</span> },
              {
                key: 'diferencia', header: 'Diferencia total', render: (c: any) => {
                  const items = c.items ?? [];
                  const diff = totalDiff(items);
                  return (
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: diff === 0 ? 'var(--text3)' : diff > 0 ? 'var(--success)' : '#EF4444' }}>
                      {items.length > 0 ? (diff > 0 ? `+${diff.toFixed(0)}` : diff.toFixed(0)) : '—'}
                    </span>
                  );
                },
              },
              { key: 'responsable', header: 'Responsable', render: (c: any) => <span style={{ color: 'var(--text2)' }}>{c.createdBy?.name ?? c.user?.name ?? '—'}</span> },
              {
                key: 'acciones', header: 'Acciones', render: (c: any) => (
                  <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); openDetail(c); }}>
                    <ClipboardCheck size={13} />
                  </button>
                ),
              },
            ] as ResponsiveTableColumn<any>[]}
            renderMobileCard={(c: any) => {
              const items = c.items ?? [];
              const diff = totalDiff(items);
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="mobile-card-head">
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{fmtDate(c.startedAt ?? c.createdAt)}</span>
                    <span className={`badge ${statusBadge[c.status as CountStatus] ?? 'badge-amber'}`}>{statusLabel[c.status as CountStatus] ?? c.status}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>#{c.id?.slice(-6).toUpperCase()}</div>
                  <div className="mobile-card-row">
                    <span>{items.length} productos</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: diff === 0 ? 'var(--text3)' : diff > 0 ? 'var(--success)' : '#EF4444' }}>
                      {items.length > 0 ? (diff > 0 ? `+${diff.toFixed(0)}` : diff.toFixed(0)) : '—'}
                    </span>
                  </div>
                  <div className="mobile-card-row">
                    <span>{c.createdBy?.name ?? c.user?.name ?? '—'}</span>
                  </div>
                </div>
              );
            }}
          />
        )}
      </div>

      {startModal && (
        <div className="modal-overlay" onClick={() => setStartModal(false)}>
          <div className="modal" style={{ maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: 14 }}>Iniciar conteo de stock</span>
              <button onClick={() => setStartModal(false)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Ubicación a contar</label>
                <select value={startLocationId} onChange={(e) => setStartLocationId(e.target.value)}>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Se van a cargar todos los productos activos con su stock actual en esa ubicación.</div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setStartModal(false)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={startCount} disabled={starting} className="btn btn-primary btn-sm">
                {starting ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Iniciar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
