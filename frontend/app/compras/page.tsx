/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import type { Product, Purchase, Supplier } from '@/types';
import { fmtDate, fmtMoney, normalizeArray, num } from '@/lib/helpers';
import { ShoppingBag, Plus, X, Eye, RefreshCcw, Search, Trash2 } from 'lucide-react';
import { todayInputAR } from '@/lib/dateAR';

export default function ComprasPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create' | 'detail' | null>(null);
  const [selected, setSelected] = useState<Purchase | null>(null);
  const [form, setForm] = useState({ supplierId: '', date: todayInputAR(), notes: '', to: 'DEPOSITO' as 'LOCAL' | 'DEPOSITO', paymentMethod: 'TRANSFERENCIA' });
  const [items, setItems] = useState<{ productId: string; quantity: string; quantityKg: string; unitCost: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [pr, sup, prod] = await Promise.all([
        api.get('/purchases', { params: { limit: 100 } }),
        api.get('/suppliers', { params: { isActive: true } }),
        api.get('/products', { params: { limit: 500, isActive: true } }),
      ]);
      setPurchases(normalizeArray<Purchase>(pr.data));
      setSuppliers(normalizeArray<Supplier>(sup.data));
      setProducts(normalizeArray<Product>(prod.data));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const addItem = () => setItems((p) => [...p, { productId: '', quantity: '1', quantityKg: '', unitCost: '' }]);
  const removeItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, k: string, v: string) => setItems((p) => { const n = [...p]; n[i] = { ...n[i], [k]: v }; return n; });

  const save = async () => {
    if (!items.length) return;
    setSaving(true);
    try {
      await api.post('/purchases', {
        supplierId: form.supplierId || undefined,
        date: form.date,
        description: form.notes || undefined,
        to: form.to,
        paymentMethod: form.paymentMethod,
        items: items.filter((i) => i.productId).map((i) => {
          const p = products.find((x) => x.id === i.productId);
          return {
            productId: i.productId,
            quantity: p?.saleUnit === 'KG' ? 1 : Number(i.quantity),
            quantityKg: p?.saleUnit === 'KG' ? Number(i.quantityKg) : undefined,
            unitCost: Number(i.unitCost),
          };
        }),
      });
      showToast('Compra registrada');
      setModal(null);
      setItems([]);
      setForm({ supplierId: '', date: todayInputAR(), notes: '', to: 'DEPOSITO', paymentMethod: 'TRANSFERENCIA' });
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al registrar');
    } finally { setSaving(false); }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return purchases;
    const q = search.toLowerCase();
    return purchases.filter((p) =>
      p.supplier?.name?.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
    );
  }, [purchases, search]);

  const totalMonth = purchases.reduce((a, p) => a + num(p.totalAmount), 0);

  return (
    <AppLayout
      title="Compras"
      subtitle={`${purchases.length} registros`}
      actions={
        <button onClick={() => { setForm({ supplierId: '', date: todayInputAR(), notes: '', to: 'DEPOSITO', paymentMethod: 'TRANSFERENCIA' }); setItems([{ productId: '', quantity: '1', quantityKg: '', unitCost: '' }]); setModal('create'); }}
          className="btn btn-primary btn-sm" style={{ gap: 6 }}>
          <Plus size={13} /> Registrar compra
        </button>
      }
    >
      {toast && (
        <div style={{ position: 'fixed', top: 70, right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)', animation: 'fadeIn 0.2s ease' }}>{toast}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 10, marginBottom: 16 }}>
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Total compras</div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent)', marginTop: 4 }}>{fmtMoney(totalMonth)}</div>
        </div>
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Registros</div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent2)', marginTop: 4 }}>{purchases.length}</div>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ position: 'relative', maxWidth: 280 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar proveedor..." style={{ paddingLeft: 30, fontSize: 13 }} />
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><ShoppingBag size={32} /><p>Sin compras registradas</p></div>
        ) : (
          <>
          <div className="table-wrap desktop-only-table">
            <table>
              <thead>
                <tr><th>Fecha</th><th>Proveedor</th><th>Productos</th><th>Notas</th><th style={{ textAlign: 'right' }}>Total</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtDate(p.date)}</td>
                    <td style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>{p.supplier?.name ?? 'Sin proveedor'}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{p.items?.length ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{p.description ?? '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)' }}>{fmtMoney(p.totalAmount)}</td>
                    <td>
                      <button onClick={() => { setSelected(p); setModal('detail'); }} className="btn btn-ghost btn-xs"><Eye size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-card-list" style={{ padding: 10 }}>
            {filtered.map((p) => (
              <div className="mobile-card" key={p.id} onClick={() => { setSelected(p); setModal('detail'); }}>
                <div className="mobile-card-head">
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>{fmtDate(p.date)}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)' }}>{fmtMoney(p.totalAmount)}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.supplier?.name ?? 'Sin proveedor'}</div>
                <div className="mobile-card-row">
                  <span>{p.items?.length ?? 0} productos</span>
                  <span>{p.description ?? '—'}</span>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>

      {modal === 'create' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-xl" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '92vh' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 800, fontSize: 15 }}>Registrar compra</span>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Proveedor</label>
                  <select value={form.supplierId} onChange={(e) => setForm((p) => ({ ...p, supplierId: e.target.value }))}>
                    <option value="">Sin proveedor</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Fecha</label>
                  <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Destino del stock</label>
                  <select value={form.to} onChange={(e) => setForm((p) => ({ ...p, to: e.target.value as 'LOCAL' | 'DEPOSITO' }))}>
                    <option value="DEPOSITO">Depósito</option>
                    <option value="LOCAL">Local</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Forma de pago</label>
                  <select value={form.paymentMethod} onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))}>
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="EFECTIVO">Efectivo (sale de la caja abierta)</option>
                    <option value="TARJETA">Tarjeta</option>
                    <option value="CUENTA_CORRIENTE">Cta. Cte. proveedor</option>
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Notas</label>
                <input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Opcional" />
              </div>

              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Productos</div>
              <div className="line-item-scroll">
                {items.map((item, idx) => {
                  const prod = products.find((x) => x.id === item.productId);
                  return (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'end', marginBottom: 8 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Producto</label>
                        <select value={item.productId} onChange={(e) => updateItem(idx, 'productId', e.target.value)}>
                          <option value="">Seleccionar...</option>
                          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">{prod?.saleUnit === 'KG' ? 'Kilos' : 'Cantidad'}</label>
                        <input type="number" min="0" step="any" value={prod?.saleUnit === 'KG' ? item.quantityKg : item.quantity}
                          onChange={(e) => updateItem(idx, prod?.saleUnit === 'KG' ? 'quantityKg' : 'quantity', e.target.value)} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Costo unitario</label>
                        <input type="number" min="0" step="any" value={item.unitCost} onChange={(e) => updateItem(idx, 'unitCost', e.target.value)} />
                      </div>
                      <button onClick={() => removeItem(idx)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)', marginBottom: 0 }}><Trash2 size={12} /></button>
                    </div>
                  );
                })}
              </div>
              <button onClick={addItem} className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start', gap: 6 }}>
                <Plus size={13} /> Agregar producto
              </button>

              <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800, color: 'var(--accent)' }}>
                Total: {fmtMoney(items.reduce((a, i) => a + num(i.unitCost) * (i.quantityKg ? num(i.quantityKg) : num(i.quantity)), 0))}
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={save} disabled={saving || items.filter((i) => i.productId).length === 0} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Registrar compra'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'detail' && selected && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Detalle de compra</div>
                <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2 }}>{fmtDate(selected.date)}</div>
              </div>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="grid-responsive" style={{ gap: 10 }}>
                {[['Proveedor', selected.supplier?.name ?? 'Sin proveedor'], ['Fecha', fmtDate(selected.date)], ['Notas', selected.description ?? '—'], ['Total', fmtMoney(selected.totalAmount)]].map(([k, v]) => (
                  <div key={k}><div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{k}</div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{v}</div></div>
                ))}
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Producto</th><th>Cantidad</th><th style={{ textAlign: 'right' }}>Costo</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr></thead>
                  <tbody>
                    {selected.items?.map((i, idx) => (
                      <tr key={idx}>
                        <td style={{ color: 'var(--text)' }}>{i.product?.name ?? '—'}</td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{i.quantityKg != null ? `${i.quantityKg}kg` : i.quantity}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(i.unitCost)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmtMoney(i.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
