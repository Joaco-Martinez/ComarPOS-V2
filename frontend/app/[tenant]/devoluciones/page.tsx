/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import type { Return, Sale } from '@/types';
import { fmtDate, fmtMoney, normalizeArray } from '@/lib/helpers';
import { toDateInputAR } from '@/lib/dateAR';
import { RotateCcw, Eye, X, RefreshCcw, Plus, Search } from 'lucide-react';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';

const REFUND_METHODS = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'QR', 'CREDITO_CUENTA'];

export default function DevolucionesPage() {
  const [returns, setReturns] = useState<Return[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Return | null>(null);

  // Create return modal
  const [createModal, setCreateModal] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [saleSearch, setSaleSearch] = useState('');
  const [pickedSale, setPickedSale] = useState<Sale | null>(null);
  const [returnForm, setReturnForm] = useState({ refundMethod: 'EFECTIVO', notes: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/returns', { params: { limit: 100 } });
      setReturns(normalizeArray<Return>(data));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const openCreate = async () => {
    setPickedSale(null);
    setSaleSearch('');
    setReturnForm({ refundMethod: 'EFECTIVO', notes: '' });
    setCreateModal(true);
    setSalesLoading(true);
    try {
      // Fetch completed sales from last 60 days
      const from = new Date();
      from.setDate(from.getDate() - 60);
      const { data } = await api.get('/sales', {
        params: { status: 'COMPLETED', from: toDateInputAR(from), limit: 200 },
      });
      setSales(normalizeArray<Sale>(data));
    } catch { setSales([]); }
    finally { setSalesLoading(false); }
  };

  const processReturn = async () => {
    if (!pickedSale) return;
    setSaving(true);
    try {
      await api.post(`/returns/${pickedSale.id}`, {
        refundMethod: returnForm.refundMethod,
        notes: returnForm.notes || undefined,
      });
      showToast('Devolución registrada');
      setCreateModal(false);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al procesar devolución');
    } finally { setSaving(false); }
  };

  const filteredSales = sales.filter((s) => {
    const q = saleSearch.toLowerCase();
    if (!q) return true;
    const name = s.client ? `${s.client.nombre} ${s.client.apellido}`.toLowerCase() : '';
    return name.includes(q) || s.id.includes(q);
  });

  return (
    <AppLayout
      title="Devoluciones"
      subtitle={`${returns.length} devoluciones registradas`}
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} className="btn btn-ghost btn-sm"><RefreshCcw size={13} /></button>
          <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
            <Plus size={13} /> Nueva devolución
          </button>
        </div>
      }
    >
      {toast && (
        <div style={{ position: 'fixed', top: 70, right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)', animation: 'fadeIn 0.2s ease' }}>{toast}</div>
      )}

      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : (
          <ResponsiveTable
            data={returns}
            keyFor={(r) => r.id}
            emptyIcon={RotateCcw}
            emptyMessage="Sin devoluciones registradas"
            columns={[
              { key: 'fecha', header: 'Fecha', render: (r) => <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtDate(r.createdAt)}</span> },
              { key: 'cliente', header: 'Cliente', render: (r) => <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>{r.client ? `${r.client.nombre} ${r.client.apellido}` : 'Consumidor final'}</span> },
              { key: 'motivo', header: 'Motivo / Notas', render: (r) => <span style={{ fontSize: 12, color: 'var(--text2)' }}>{r.reason ?? '—'}</span> },
              { key: 'productos', header: 'Productos', render: (r) => <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{r.items?.length ?? '—'}</span> },
              {
                key: 'total', header: 'Total', style: { textAlign: 'right' },
                render: (r) => <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--danger)' }}>{fmtMoney(r.total)}</span>,
              },
              {
                key: 'acciones', header: '', render: (r) => (
                  <button onClick={() => setSelected(r)} className="btn btn-ghost btn-xs"><Eye size={12} /></button>
                ),
              },
            ] as ResponsiveTableColumn<Return>[]}
            renderMobileCard={(r) => (
              <div onClick={() => setSelected(r)} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="mobile-card-head">
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>{fmtDate(r.createdAt)}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--danger)' }}>{fmtMoney(r.total)}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.client ? `${r.client.nombre} ${r.client.apellido}` : 'Consumidor final'}</div>
                <div className="mobile-card-row">
                  <span>{r.reason ?? '—'}</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{r.items?.length ?? '—'} prod.</span>
                </div>
              </div>
            )}
          />
        )}
      </div>

      {/* Create return modal */}
      {createModal && (
        <div className="modal-overlay" onClick={() => setCreateModal(false)}>
          <div className="modal modal-lg" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800 }}>Nueva devolución</span>
              <button onClick={() => setCreateModal(false)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Step 1 — pick sale */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>1. Seleccioná la venta a devolver</div>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                  <input value={saleSearch} onChange={(e) => setSaleSearch(e.target.value)} placeholder="Buscar por cliente..." style={{ paddingLeft: 30, fontSize: 13 }} />
                </div>
                {salesLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><div className="spinner" /></div>
                ) : (
                  <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 7 }}>
                    {filteredSales.slice(0, 50).map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setPickedSale(s)}
                        style={{
                          width: '100%', textAlign: 'left', padding: '9px 12px', background: pickedSale?.id === s.id ? 'rgba(13,89,231,0.12)' : 'transparent',
                          borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          border: 'none',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                            {s.client ? `${s.client.nombre} ${s.client.apellido}` : 'Consumidor final'}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{fmtDate(s.createdAt)} · {s.paymentMethod}</div>
                        </div>
                        <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{fmtMoney(s.total)}</div>
                      </button>
                    ))}
                    {filteredSales.length === 0 && <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>Sin resultados</div>}
                  </div>
                )}
              </div>

              {/* Step 2 — refund details */}
              {pickedSale && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>2. Detalles del reembolso</div>
                  <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '10px 12px', marginBottom: 10, fontSize: 13 }}>
                    Venta seleccionada: <strong style={{ fontFamily: 'var(--mono)' }}>{fmtMoney(pickedSale.total)}</strong>
                    {' '}· {pickedSale.client ? `${pickedSale.client.nombre} ${pickedSale.client.apellido}` : 'Consumidor final'}
                    {' '}· {fmtDate(pickedSale.createdAt)}
                  </div>
                  <div className="form-row">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Método de reembolso</label>
                      <select value={returnForm.refundMethod} onChange={(e) => setReturnForm((p) => ({ ...p, refundMethod: e.target.value }))}>
                        {REFUND_METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Notas</label>
                      <input value={returnForm.notes} onChange={(e) => setReturnForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Motivo de la devolución" />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setCreateModal(false)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={processReturn} disabled={saving || !pickedSale} className="btn btn-danger btn-sm" style={{ gap: 6 }}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <><RotateCcw size={13} /> Procesar devolución</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Detalle devolución</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{fmtDate(selected.createdAt)}</div>
              </div>
              <button onClick={() => setSelected(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="grid-responsive" style={{ gap: 10 }}>
                {[
                  ['Cliente', selected.client ? `${selected.client.nombre} ${selected.client.apellido}` : 'Consumidor final'],
                  ['Motivo', selected.reason ?? '—'],
                  ['Total devuelto', fmtMoney(selected.total)],
                ].map(([k, v]) => (
                  <div key={k}><div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{k}</div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{v}</div></div>
                ))}
              </div>
              {selected.items && selected.items.length > 0 && (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Producto</th><th>Cantidad</th><th style={{ textAlign: 'right' }}>Precio unit.</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr></thead>
                    <tbody>
                      {selected.items.map((i: any, idx: number) => (
                        <tr key={idx}>
                          <td style={{ color: 'var(--text)' }}>{i.product?.name ?? '—'}</td>
                          <td style={{ fontFamily: 'var(--mono)' }}>{i.quantityKg != null ? `${i.quantityKg}kg` : i.quantity}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(i.unitPrice)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmtMoney(i.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
