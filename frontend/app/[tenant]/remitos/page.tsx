/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import { fmtDate, normalizeArray } from '@/lib/helpers';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
import { FileText, Download, CheckCircle, X, Plus, RefreshCcw } from 'lucide-react';

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'badge-amber',
  DELIVERED: 'badge-green',
  CANCELLED: 'badge-red',
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
};

export default function RemitosPage() {
  const [remitos, setRemitos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState<'create' | 'detail' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [saleId, setSaleId] = useState('');
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/remitos', {
        params: { status: statusFilter || undefined, limit: 100 },
      });
      setRemitos(normalizeArray<any>(data));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const downloadPdf = async (id: string, numero: string) => {
    setDownloading(id);
    try {
      const res = await api.get(`/remitos/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `remito-${numero}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('Error al descargar el PDF');
    } finally {
      setDownloading(null);
    }
  };

  const regeneratePdf = async (id: string) => {
    try {
      await api.post(`/remitos/${id}/regenerate-pdf`);
      showToast('PDF regenerado');
    } catch {
      showToast('Error al regenerar el PDF');
    }
  };

  const markDelivered = async (id: string) => {
    try {
      await api.patch(`/remitos/${id}/delivered`);
      showToast('Marcado como entregado');
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error');
    }
  };

  const cancel = async (id: string) => {
    try {
      await api.patch(`/remitos/${id}/cancel`);
      showToast('Remito cancelado');
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error');
    }
  };

  const createFromSale = async () => {
    if (!saleId.trim()) return;
    setSaving(true);
    try {
      await api.post(`/remitos/from-sale/${saleId.trim()}`);
      showToast('Remito creado');
      setSaleId('');
      setModal(null);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al crear remito');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (remito: any) => {
    setSelected(remito);
    setModal('detail');
    try {
      const { data } = await api.get(`/remitos/${remito.id}`);
      setSelected(data);
    } catch {}
  };

  return (
    <AppLayout
      title="Remitos"
      subtitle="Notas de entrega y remitos de envío"
      actions={
        <button className="btn btn-primary btn-sm" onClick={() => { setSaleId(''); setModal('create'); }}>
          <Plus size={13} /> Crear desde venta
        </button>
      }
    >
      {toast && (
        <div style={{ position: 'fixed', top: 'calc(var(--app-header-height, 56px) + 14px)', right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)', animation: 'fadeIn 0.2s ease' }}>
          {toast}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ fontSize: 13, minWidth: 140 }}
        >
          <option value="">Todos los estados</option>
          <option value="PENDING">Pendiente</option>
          <option value="DELIVERED">Entregado</option>
          <option value="CANCELLED">Cancelado</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <ResponsiveTable
            data={remitos}
            keyFor={(r) => r.id}
            emptyIcon={FileText}
            emptyMessage="No hay remitos para mostrar"
            onRowClick={openDetail}
            columns={[
              { key: 'numero', header: 'Número', render: (r) => <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>#{r.numero ?? r.id?.slice(0, 8)}</span> },
              { key: 'fecha', header: 'Fecha', render: (r) => <span style={{ color: 'var(--text2)' }}>{fmtDate(r.createdAt ?? r.date)}</span> },
              {
                key: 'cliente', header: 'Cliente', render: (r) =>
                  r.sale?.client ? `${r.sale.client.nombre ?? ''} ${r.sale.client.apellido ?? ''}`.trim() || '—' : r.clientName ?? '—',
              },
              { key: 'venta', header: 'Venta', render: (r) => <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>{r.saleId ? r.saleId.slice(0, 8) : '—'}</span> },
              { key: 'estado', header: 'Estado', render: (r) => <span className={`badge ${STATUS_BADGE[r.status] ?? 'badge'}`}>{STATUS_LABEL[r.status] ?? r.status}</span> },
              {
                key: 'acciones', header: 'Acciones', render: (r) => (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn btn-ghost btn-sm"
                      title="Descargar PDF"
                      disabled={downloading === r.id}
                      onClick={() => downloadPdf(r.id, r.numero ?? r.id.slice(0, 8))}
                      style={{ fontSize: 11 }}
                    >
                      {downloading === r.id ? <div className="spinner" style={{ width: 12, height: 12 }} /> : <Download size={12} />}
                      PDF
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      title="Regenerar PDF"
                      onClick={() => regeneratePdf(r.id)}
                      style={{ fontSize: 11 }}
                    >
                      <RefreshCcw size={12} />
                    </button>
                    {r.status === 'PENDING' && (
                      <>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => markDelivered(r.id)}
                          style={{ fontSize: 11 }}
                        >
                          <CheckCircle size={12} /> Entregado
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => cancel(r.id)}
                          style={{ fontSize: 11 }}
                        >
                          <X size={12} /> Cancelar
                        </button>
                      </>
                    )}
                  </div>
                ),
              },
            ] as ResponsiveTableColumn<any>[]}
            renderMobileCard={(r) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="mobile-card-head">
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>#{r.numero ?? r.id?.slice(0, 8)}</span>
                  <span className={`badge ${STATUS_BADGE[r.status] ?? 'badge'}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  {r.sale?.client ? `${r.sale.client.nombre ?? ''} ${r.sale.client.apellido ?? ''}`.trim() || '—' : r.clientName ?? '—'}
                </div>
                <div className="mobile-card-row">
                  <span>Fecha</span>
                  <span>{fmtDate(r.createdAt ?? r.date)}</span>
                </div>
                <div className="mobile-card-row">
                  <span>Venta</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{r.saleId ? r.saleId.slice(0, 8) : '—'}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn btn-ghost btn-sm"
                    title="Descargar PDF"
                    disabled={downloading === r.id}
                    onClick={() => downloadPdf(r.id, r.numero ?? r.id.slice(0, 8))}
                    style={{ fontSize: 11 }}
                  >
                    {downloading === r.id ? <div className="spinner" style={{ width: 12, height: 12 }} /> : <Download size={12} />}
                    PDF
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    title="Regenerar PDF"
                    onClick={() => regeneratePdf(r.id)}
                    style={{ fontSize: 11 }}
                  >
                    <RefreshCcw size={12} />
                  </button>
                  {r.status === 'PENDING' && (
                    <>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => markDelivered(r.id)}
                        style={{ fontSize: 11 }}
                      >
                        <CheckCircle size={12} /> Entregado
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => cancel(r.id)}
                        style={{ fontSize: 11 }}
                      >
                        <X size={12} /> Cancelar
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          />
        </div>
      )}

      {/* Create from Sale Modal */}
      {modal === 'create' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 420, padding: 28 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Crear remito desde venta</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={15} /></button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 6 }}>ID de venta</label>
              <input
                type="text"
                placeholder="Ingresá el ID de la venta"
                value={saleId}
                onChange={(e) => setSaleId(e.target.value)}
                style={{ width: '100%', fontSize: 13 }}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={createFromSale} disabled={saving || !saleId.trim()}>
                {saving ? <div className="spinner" style={{ width: 12, height: 12 }} /> : <Plus size={13} />}
                Crear remito
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {modal === 'detail' && selected && (
        <div className="modal-overlay" onClick={() => { setModal(null); setSelected(null); }}>
          <div className="modal modal-lg" style={{ padding: 28 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                Remito #{selected.numero ?? selected.id?.slice(0, 8)}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => { setModal(null); setSelected(null); }}><X size={15} /></button>
            </div>

            <div className="grid-responsive" style={{ gap: 14, marginBottom: 20 }}>
              {[
                { label: 'Estado', value: <span className={`badge ${STATUS_BADGE[selected.status] ?? ''}`}>{STATUS_LABEL[selected.status] ?? selected.status}</span> },
                { label: 'Fecha', value: fmtDate(selected.createdAt ?? selected.date) },
                { label: 'Cliente', value: selected.sale?.client ? `${selected.sale.client.nombre ?? ''} ${selected.sale.client.apellido ?? ''}`.trim() : selected.clientName ?? '—' },
                { label: 'Venta ID', value: <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{selected.saleId?.slice(0, 8) ?? '—'}</span> },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>

            {selected.sale?.items?.length > 0 && (
              <div>
                <div className="section-title" style={{ fontSize: 12, marginBottom: 10 }}>Items</div>
                <div className="table-wrap">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text3)', fontWeight: 600 }}>Producto</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text3)', fontWeight: 600 }}>Cant.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.sale.items.map((item: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 10px' }}>{item.product?.name ?? item.productName ?? '—'}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{item.quantity ?? item.quantityKg}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => downloadPdf(selected.id, selected.numero ?? selected.id.slice(0, 8))}
                disabled={downloading === selected.id}
              >
                <Download size={13} /> Descargar PDF
              </button>
              {selected.status === 'PENDING' && (
                <>
                  <button className="btn btn-secondary btn-sm" onClick={() => { markDelivered(selected.id); setModal(null); setSelected(null); }}>
                    <CheckCircle size={13} /> Marcar entregado
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => { cancel(selected.id); setModal(null); setSelected(null); }}>
                    <X size={13} /> Cancelar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
