/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import type { Promotion, PromotionType } from '@/types';
import { fmtMoney, normalizeArray } from '@/lib/helpers';
import { todayInputAR } from '@/lib/dateAR';
import { Tag, Plus, X, Edit2, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

const typeLabel: Record<PromotionType, string> = {
  PRODUCT_DISCOUNT: 'Desc. producto', CATEGORY_DISCOUNT: 'Desc. categoría', CART_DISCOUNT: 'Desc. carrito',
};
const typeBadge: Record<PromotionType, string> = {
  PRODUCT_DISCOUNT: 'badge-blue', CATEGORY_DISCOUNT: 'badge-cyan', CART_DISCOUNT: 'badge-amber',
};
const discountLabel: Record<string, string> = { PERCENTAGE: 'Porcentaje (%)', FIXED: 'Monto fijo ($)' };

const empty = {
  name: '', type: 'CART_DISCOUNT' as PromotionType, discountType: 'PERCENTAGE', discountValue: '',
  minAmount: '', startsAt: todayInputAR(), endsAt: '', description: '', isActive: true,
};

export default function PromocionesPage() {
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [form, setForm] = useState<typeof empty>(empty);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/promotions', { params: { limit: 100 } });
      setPromos(normalizeArray<Promotion>(data));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const openCreate = () => { setEditing(null); setForm(empty); setModal(true); };
  const openEdit = (p: Promotion) => {
    setEditing(p);
    setForm({
      name: p.name, type: p.type, discountType: p.discountType, discountValue: String(p.discountValue ?? ''),
      minAmount: String(p.minAmount ?? ''),
      startsAt: p.startsAt?.slice(0, 10) ?? todayInputAR(),
      endsAt: p.endsAt?.slice(0, 10) ?? '',
      description: p.description ?? '', isActive: p.isActive ?? true,
    });
    setModal(true);
  };

  const save = async () => {
    if (!form.name || !form.discountValue) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name, type: form.type, discountType: form.discountType,
        discountValue: Number(form.discountValue),
        minAmount: form.minAmount ? Number(form.minAmount) : undefined,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined,
        description: form.description || undefined, isActive: form.isActive,
      };
      if (editing) await api.put(`/promotions/${editing.id}`, payload);
      else await api.post('/promotions', payload);
      showToast(editing ? 'Promoción actualizada' : 'Promoción creada');
      setModal(false);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error');
    } finally { setSaving(false); }
  };

  const toggleActive = async (p: Promotion) => {
    try { await api.put(`/promotions/${p.id}`, { isActive: !p.isActive }); load(); }
    catch { showToast('Error'); }
  };

  const del = async (id: string) => {
    setDeleting(id);
    try { await api.delete(`/promotions/${id}`); showToast('Promoción eliminada'); load(); }
    catch { showToast('Error al eliminar'); } finally { setDeleting(null); }
  };

  const f = (k: keyof typeof empty, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const formatDiscount = (p: Promotion) =>
    p.discountType === 'PERCENTAGE' ? `${p.discountValue}%` : fmtMoney(p.discountValue);

  return (
    <AppLayout
      title="Promociones"
      subtitle={`${promos.length} promociones registradas`}
      actions={
        <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
          <Plus size={13} /> Nueva promoción
        </button>
      }
    >
      {toast && (
        <div style={{ position: 'fixed', top: 70, right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)', animation: 'fadeIn 0.2s ease' }}>{toast}</div>
      )}

      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : promos.length === 0 ? (
          <div className="empty-state"><Tag size={32} /><p>Sin promociones</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Nombre</th><th>Tipo</th><th>Descuento</th><th>Vigencia</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {promos.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{p.name}</div>
                      {p.description && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{p.description}</div>}
                    </td>
                    <td><span className={`badge ${typeBadge[p.type] ?? 'badge-gray'}`}>{typeLabel[p.type] ?? p.type}</span></td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: 'var(--accent2)' }}>
                      {formatDiscount(p)}
                      {p.minAmount ? <span style={{ fontSize: 10, color: 'var(--text3)', display: 'block' }}>Min. {fmtMoney(p.minAmount)}</span> : null}
                    </td>
                    <td style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                      {p.startsAt?.slice(0, 10) ?? '—'} → {p.endsAt?.slice(0, 10) ?? 'Sin fin'}
                    </td>
                    <td>
                      <button onClick={() => toggleActive(p)} className="btn btn-ghost btn-xs" style={{ color: p.isActive ? 'var(--success)' : 'var(--text3)', gap: 4 }}>
                        {p.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        <span style={{ fontSize: 11 }}>{p.isActive ? 'Activa' : 'Inactiva'}</span>
                      </button>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button onClick={() => openEdit(p)} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                        <button onClick={() => del(p.id)} disabled={deleting === p.id} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}>
                          {deleting === p.id ? <span className="spinner" style={{ width: 11, height: 11 }} /> : <Trash2 size={12} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal modal-lg" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800 }}>{editing ? 'Editar promoción' : 'Nueva promoción'}</span>
              <button onClick={() => setModal(false)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre *</label>
                <input value={form.name} onChange={(e) => f('name', e.target.value)} placeholder="Ej. Descuento de verano" autoFocus />
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tipo *</label>
                  <select value={form.type} onChange={(e) => f('type', e.target.value as PromotionType)}>
                    {Object.entries(typeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tipo descuento</label>
                  <select value={form.discountType} onChange={(e) => f('discountType', e.target.value)}>
                    {Object.entries(discountLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Valor del descuento *</label>
                  <input type="number" min="0" step="any" value={form.discountValue} onChange={(e) => f('discountValue', e.target.value)} placeholder="0" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Monto mínimo de compra</label>
                  <input type="number" min="0" step="any" value={form.minAmount} onChange={(e) => f('minAmount', e.target.value)} placeholder="Sin mínimo" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Fecha inicio</label>
                  <input type="date" value={form.startsAt} onChange={(e) => f('startsAt', e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Fecha fin</label>
                  <input type="date" value={form.endsAt} onChange={(e) => f('endsAt', e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Descripción</label>
                <input value={form.description} onChange={(e) => f('description', e.target.value)} placeholder="Opcional" />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={form.isActive} onChange={(e) => f('isActive', e.target.checked)} style={{ width: 14, height: 14 }} />
                <span>Activa</span>
              </label>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(false)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={save} disabled={saving || !form.name || !form.discountValue} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : editing ? 'Guardar' : 'Crear promoción'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
