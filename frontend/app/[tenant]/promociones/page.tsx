/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { Product, ProductCategory, Promotion, PromotionType } from '@/types';
import { fmtMoney, normalizeArray, getPlanLockMessage } from '@/lib/helpers';
import { todayInputAR } from '@/lib/dateAR';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
import { Tag, Plus, X, Edit2, Trash2, ToggleLeft, ToggleRight, Lock } from 'lucide-react';

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
  productIds: [] as string[], categoryIds: [] as string[],
};

export default function PromocionesPage() {
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [form, setForm] = useState<typeof empty>(empty);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [lockMessage, setLockMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLockMessage(null);
    try {
      const promoRes = await api.get('/promotions', { params: { limit: 100 } });
      setPromos(normalizeArray<Promotion>(promoRes.data));
    } catch (err: any) {
      const lockMsg = getPlanLockMessage(err);
      if (lockMsg) { setLockMessage(lockMsg); setLoading(false); return; }
      setPromos([]);
    }
    try {
      const [prodRes, catRes] = await Promise.all([
        api.get('/products', { params: { limit: 500, isActive: true } }),
        api.get('/categories'),
      ]);
      setProducts(normalizeArray<Product>(prodRes.data));
      setCategories(normalizeArray<ProductCategory>(catRes.data).filter((c) => c.isActive));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);


  const openCreate = () => { setEditing(null); setForm(empty); setModal(true); };
  const openEdit = (p: Promotion) => {
    setEditing(p);
    setForm({
      name: p.name, type: p.type, discountType: p.discountType, discountValue: String(p.discountValue ?? ''),
      minAmount: String(p.minAmount ?? ''),
      startsAt: p.startsAt?.slice(0, 10) ?? todayInputAR(),
      endsAt: p.endsAt?.slice(0, 10) ?? '',
      description: p.description ?? '', isActive: p.isActive ?? true,
      productIds: p.productIds ?? [], categoryIds: p.categoryIds ?? [],
    });
    setModal(true);
  };

  const toggleId = (list: 'productIds' | 'categoryIds', id: string) => {
    setForm((p) => {
      const set = new Set(p[list]);
      if (set.has(id)) set.delete(id); else set.add(id);
      return { ...p, [list]: Array.from(set) };
    });
  };

  const save = async () => {
    if (!form.name || !form.discountValue) return;
    if (form.type === 'PRODUCT_DISCOUNT' && form.productIds.length === 0) {
      toast.error('Elegí al menos un producto');
      return;
    }
    if (form.type === 'CATEGORY_DISCOUNT' && form.categoryIds.length === 0) {
      toast.error('Elegí al menos una categoría');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name, type: form.type, discountType: form.discountType,
        discountValue: Number(form.discountValue),
        minAmount: form.minAmount ? Number(form.minAmount) : undefined,
        startsAt: form.startsAt || undefined,
        endsAt: form.endsAt || undefined,
        description: form.description || undefined, isActive: form.isActive,
        productIds: form.type === 'PRODUCT_DISCOUNT' ? form.productIds : [],
        categoryIds: form.type === 'CATEGORY_DISCOUNT' ? form.categoryIds : [],
      };
      if (editing) await api.put(`/promotions/${editing.id}`, payload);
      else await api.post('/promotions', payload);
      toast.success(editing ? 'Promoción actualizada' : 'Promoción creada');
      setModal(false);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error');
    } finally { setSaving(false); }
  };

  const toggleActive = async (p: Promotion) => {
    try { await api.put(`/promotions/${p.id}`, { isActive: !p.isActive }); load(); }
    catch { toast.error('Error'); }
  };

  const del = async (id: string) => {
    setDeleting(id);
    try { await api.delete(`/promotions/${id}`); toast.success('Promoción eliminada'); load(); }
    catch { toast.error('Error al eliminar'); } finally { setDeleting(null); }
  };

  const f = (k: keyof typeof empty, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const formatDiscount = (p: Promotion) =>
    p.discountType === 'PERCENTAGE' ? `${p.discountValue}%` : fmtMoney(p.discountValue);

  return (
    <AppLayout
      title="Promociones"
      subtitle={`${promos.length} promociones registradas`}
      actions={
        lockMessage ? undefined : (
          <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
            <Plus size={13} /> Nueva promoción
          </button>
        )
      }
    >
      {lockMessage ? (
        <div className="card" style={{ padding: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10 }}>
          <Lock size={28} style={{ color: 'var(--text3)' }} />
          <div style={{ fontWeight: 700, fontSize: 14 }}>No incluido en tu plan</div>
          <p style={{ fontSize: 13, color: 'var(--text3)', maxWidth: 420 }}>{lockMessage}</p>
          <a href="/suscripcion" className="btn btn-primary btn-sm" style={{ marginTop: 6 }}>Ver planes</a>
        </div>
      ) : (
      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : (
          <ResponsiveTable
            data={promos}
            keyFor={(p) => p.id}
            emptyIcon={Tag}
            emptyMessage="Sin promociones"
            columns={[
              {
                key: 'nombre', header: 'Nombre', render: (p) => (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{p.name}</div>
                    {p.description && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{p.description}</div>}
                  </>
                ),
              },
              { key: 'tipo', header: 'Tipo', render: (p) => <span className={`badge ${typeBadge[p.type] ?? 'badge-gray'}`}>{typeLabel[p.type] ?? p.type}</span> },
              {
                key: 'descuento', header: 'Descuento', render: (p) => (
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: 'var(--accent2)' }}>
                    {formatDiscount(p)}
                    {p.minAmount ? <span style={{ fontSize: 10, color: 'var(--text3)', display: 'block' }}>Min. {fmtMoney(p.minAmount)}</span> : null}
                  </span>
                ),
              },
              {
                key: 'vigencia', header: 'Vigencia', render: (p) => (
                  <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                    {p.startsAt?.slice(0, 10) ?? '—'} → {p.endsAt?.slice(0, 10) ?? 'Sin fin'}
                  </span>
                ),
              },
              {
                key: 'estado', header: 'Estado', render: (p) => (
                  <button onClick={() => toggleActive(p)} className="btn btn-ghost btn-xs" style={{ color: p.isActive ? 'var(--success)' : 'var(--text3)', gap: 4 }}>
                    {p.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    <span style={{ fontSize: 11 }}>{p.isActive ? 'Activa' : 'Inactiva'}</span>
                  </button>
                ),
              },
              {
                key: 'acciones', header: '', render: (p) => (
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button onClick={() => openEdit(p)} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                    <button onClick={() => del(p.id)} disabled={deleting === p.id} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}>
                      {deleting === p.id ? <span className="spinner" style={{ width: 11, height: 11 }} /> : <Trash2 size={12} />}
                    </button>
                  </div>
                ),
              },
            ] as ResponsiveTableColumn<Promotion>[]}
            renderMobileCard={(p) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="mobile-card-head">
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{p.name}</span>
                  <span className={`badge ${typeBadge[p.type] ?? 'badge-gray'}`}>{typeLabel[p.type] ?? p.type}</span>
                </div>
                {p.description && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{p.description}</div>}
                <div className="mobile-card-row">
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                    {p.startsAt?.slice(0, 10) ?? '—'} → {p.endsAt?.slice(0, 10) ?? 'Sin fin'}
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent2)' }}>
                    {formatDiscount(p)}{p.minAmount ? ` (min. ${fmtMoney(p.minAmount)})` : ''}
                  </span>
                </div>
                <div className="mobile-card-row">
                  <button onClick={() => toggleActive(p)} className="btn btn-ghost btn-xs" style={{ color: p.isActive ? 'var(--success)' : 'var(--text3)', gap: 4 }}>
                    {p.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    <span style={{ fontSize: 11 }}>{p.isActive ? 'Activa' : 'Inactiva'}</span>
                  </button>
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button onClick={() => openEdit(p)} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                    <button onClick={() => del(p.id)} disabled={deleting === p.id} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}>
                      {deleting === p.id ? <span className="spinner" style={{ width: 11, height: 11 }} /> : <Trash2 size={12} />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          />
        )}
      </div>
      )}

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
              {form.type === 'PRODUCT_DISCOUNT' && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Productos incluidos * ({form.productIds.length} seleccionados)</label>
                  <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {products.map((prod) => (
                      <label key={prod.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                        <input type="checkbox" checked={form.productIds.includes(prod.id)} onChange={() => toggleId('productIds', prod.id)} style={{ width: 13, height: 13 }} />
                        {prod.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {form.type === 'CATEGORY_DISCOUNT' && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Categorías incluidas * ({form.categoryIds.length} seleccionadas)</label>
                  <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {categories.map((cat) => (
                      <label key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                        <input type="checkbox" checked={form.categoryIds.includes(cat.id)} onChange={() => toggleId('categoryIds', cat.id)} style={{ width: 13, height: 13 }} />
                        {cat.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
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
