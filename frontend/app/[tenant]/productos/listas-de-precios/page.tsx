/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { PriceList, Product } from '@/types';
import { fmtMoney, normalizeArray, num } from '@/lib/helpers';
import { Plus, Edit2, Trash2, X, Search, Lock, ChevronDown, ChevronRight } from 'lucide-react';
import { matchesSearch, sortedVariants } from '@/lib/variants';

export default function ListasDePreciosPage() {
  const [lists, setLists] = useState<PriceList[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });
  // Al crear: cargar todos los productos de una (mismo bulk-apply que el
  // detalle), con un % sobre Minorista (ej. -10 para una lista "Efectivo").
  const [loadAll, setLoadAll] = useState(true);
  const [loadAllPct, setLoadAllPct] = useState('0');
  const [editing, setEditing] = useState<PriceList | null>(null);
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<PriceList | null>(null);
  const [detailSearch, setDetailSearch] = useState('');
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [bulkPct, setBulkPct] = useState('');
  const [applyingBulk, setApplyingBulk] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [lr, pr] = await Promise.all([
        api.get('/price-lists').catch(() => null),
        // grouped: padres con sus variantes adentro (el override es por
        // variante; el padre ofrece "mismo precio para todas").
        api.get('/products', { params: { isActive: true, limit: 500, grouped: true } }).catch(() => null),
      ]);
      if (lr) setLists(normalizeArray<PriceList>(lr.data));
      if (pr) setProducts(normalizeArray<Product>(pr.data));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openDetail = async (list: PriceList) => {
    try {
      const { data } = await api.get(`/price-lists/${list.id}`);
      setDetail(data);
      setDetailSearch('');
      setPriceDrafts({});
      setBulkPct('');
    } catch {
      toast.error('No se pudo cargar la lista');
    }
  };

  const applyBulk = async () => {
    if (!detail || bulkPct === '') return;
    setApplyingBulk(true);
    try {
      const { data } = await api.post(`/price-lists/${detail.id}/bulk-apply`, { percentage: num(bulkPct) });
      toast.success(`${data.count} productos cargados con ${num(bulkPct) >= 0 ? '+' : ''}${bulkPct}%`);
      const { data: refreshed } = await api.get(`/price-lists/${detail.id}`);
      setDetail(refreshed);
      setBulkPct('');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo aplicar el ajuste');
    } finally {
      setApplyingBulk(false);
    }
  };

  const openCreate = () => { setForm({ name: '', description: '' }); setLoadAll(true); setLoadAllPct('0'); setEditing(null); setModal('create'); };
  const openEdit = (list: PriceList) => {
    setForm({ name: list.name, description: list.description ?? '' });
    setEditing(list);
    setModal('edit');
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (modal === 'create') {
        const { data: created } = await api.post('/price-lists', form);
        if (loadAll && created?.id) {
          const pct = num(loadAllPct);
          const { data: bulk } = await api.post(`/price-lists/${created.id}/bulk-apply`, { percentage: pct });
          toast.success(`Lista creada con ${bulk.count} productos${pct !== 0 ? ` (${pct > 0 ? '+' : ''}${pct}% sobre Minorista)` : ''}`);
        } else {
          toast.success('Lista de precios creada');
        }
      } else if (editing) {
        await api.put(`/price-lists/${editing.id}`, form);
        toast.success('Lista actualizada');
      }
      setModal(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const removeList = async (list: PriceList) => {
    if (!confirm(`¿Eliminar la lista "${list.name}"? Los clientes que la tengan asignada vuelven a Minorista.`)) return;
    try {
      await api.delete(`/price-lists/${list.id}`);
      toast.success('Lista eliminada');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo eliminar');
    }
  };

  const detailMatches = useMemo(
    () => (detailSearch.trim() ? products.filter((p) => matchesSearch(p, detailSearch)) : products),
    [products, detailSearch]
  );
  const detailProducts = detailMatches.slice(0, 40);

  const overrideFor = (productId: string) => detail?.items?.find((i) => i.productId === productId);

  // Un padre guarda "mismo precio para todas las variantes" (crea o
  // actualiza el item de cada variante, ?allVariants=true).
  const saveOverride = async (product: Product) => {
    if (!detail) return;
    const draft = priceDrafts[product.id];
    if (draft === undefined || draft === '') return;
    try {
      await api.put(`/price-lists/${detail.id}/items/${product.id}`, {
        price: num(draft),
        pricePerKg: product.saleUnit === 'KG' ? num(draft) : undefined,
      }, { params: product.hasVariants ? { allVariants: true } : undefined });
      const { data } = await api.get(`/price-lists/${detail.id}`);
      setDetail(data);
      setPriceDrafts((prev) => { const next = { ...prev }; delete next[product.id]; return next; });
      toast.success('Precio actualizado');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo actualizar el precio');
    }
  };

  const removeOverride = async (productId: string, allVariants = false) => {
    if (!detail) return;
    try {
      await api.delete(`/price-lists/${detail.id}/items/${productId}`, { params: allVariants ? { allVariants: true } : undefined });
      const { data } = await api.get(`/price-lists/${detail.id}`);
      setDetail(data);
      toast.success('Vuelve al precio de Minorista');
    } catch {
      toast.error('No se pudo quitar el override');
    }
  };

  const renderPriceRow = (p: Product, indent = false) => {
    const override = overrideFor(p.id);
    const basePrice = p.saleUnit === 'KG' ? num(p.pricePerKg) : num(p.price);
    const overridePrice = p.saleUnit === 'KG' ? override?.pricePerKg : override?.price;
    return (
      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8, marginLeft: indent ? 24 : 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{indent ? p.variantLabel ?? p.name : p.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
            Minorista: {fmtMoney(basePrice)}
            {overridePrice != null && (
              <> · <span style={{ color: 'var(--accent)', fontWeight: 700 }}>En esta lista: {fmtMoney(num(overridePrice))}</span></>
            )}
          </div>
        </div>
        <input
          type="number" min="0"
          placeholder={overridePrice != null ? String(overridePrice) : 'igual a Minorista'}
          value={priceDrafts[p.id] ?? ''}
          onChange={(e) => setPriceDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
          style={{ width: 110 }}
        />
        <button onClick={() => saveOverride(p)} className="btn btn-secondary btn-xs">Guardar</button>
        {overridePrice != null && (
          <button onClick={() => removeOverride(p.id)} className="btn btn-ghost btn-xs" title="Quitar override"><X size={12} /></button>
        )}
      </div>
    );
  };

  return (
    <AppLayout
      title="Listas de precios"
      subtitle={`${lists.length} listas`}
      actions={
        <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
          <Plus size={13} /> Nueva lista
        </button>
      }
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {lists.map((list) => (
            <div key={list.id} className="card" style={{ padding: 16, cursor: 'pointer' }} onClick={() => openDetail(list)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 800, fontSize: 14 }}>{list.name}</span>
                  {list.isDefault && <span className="badge badge-blue" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Lock size={9} /> Principal</span>}
                </div>
                {!list.isDefault && (
                  <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openEdit(list)} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                    <button onClick={() => removeList(list)} className="btn btn-ghost btn-xs"><Trash2 size={12} /></button>
                  </div>
                )}
              </div>
              {list.description && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>{list.description}</div>}
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                {list.isDefault ? 'Se sincroniza con el precio de cada producto' : `${list._count?.items ?? 0} productos con precio propio · ${list._count?.clients ?? 0} clientes`}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Crear/editar lista */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800, fontSize: 15 }}>{modal === 'create' ? 'Nueva lista de precios' : 'Editar lista'}</span>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre *</label>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ej: Mayorista, Revendedores..." />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Descripción</label>
                <input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Opcional" />
              </div>
              {modal === 'create' && (
                <div style={{ padding: 10, background: 'var(--bg2)', borderRadius: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    <input type="checkbox" checked={loadAll} onChange={(e) => setLoadAll(e.target.checked)} />
                    Agregar todos los productos
                  </label>
                  {loadAll && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, color: 'var(--text2)' }}>Ajuste sobre Minorista:</span>
                        <input
                          type="number" step="any"
                          value={loadAllPct}
                          onChange={(e) => setLoadAllPct(e.target.value)}
                          style={{ width: 90 }}
                        />
                        <span style={{ fontSize: 12, color: 'var(--text3)' }}>%</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                        Negativo = más barato (ej. -10 para una lista de pago en efectivo), positivo = recargo, 0 = mismo precio.
                        Después podés cambiar el precio de cada producto desde el detalle de la lista.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={save} disabled={saving || !form.name.trim() || (modal === 'create' && loadAll && (loadAllPct === '' || num(loadAllPct) <= -100))} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detalle de lista */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800, fontSize: 15 }}>{detail.name}</span>
              <button onClick={() => setDetail(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body">
              {detail.isDefault ? (
                <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '20px 0' }}>
                  Esta es la lista principal: siempre tiene el mismo precio que cada producto. Para cambiar un precio, editá el producto en Productos.
                </div>
              ) : (
                <>
                  <div style={{ padding: 10, background: 'var(--bg2)', borderRadius: 8, marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Aplicar a todos los productos</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
                      Carga todos los productos en esta lista de una vez, con un % sobre el precio de Minorista.
                      Negativo = descuento (ej. -10), positivo = recargo (ej. 10). Se puede volver a aplicar cuando quieras.
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="number" step="any"
                        value={bulkPct}
                        onChange={(e) => setBulkPct(e.target.value)}
                        placeholder="Ej: -10"
                        style={{ width: 100 }}
                      />
                      <span style={{ fontSize: 12, color: 'var(--text3)' }}>%</span>
                      <button
                        onClick={applyBulk}
                        disabled={applyingBulk || bulkPct === ''}
                        className="btn btn-primary btn-xs"
                      >
                        {applyingBulk ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Aplicar a todos'}
                      </button>
                    </div>
                  </div>

                  <div style={{ position: 'relative', marginBottom: 10 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text3)' }} />
                    <input
                      value={detailSearch}
                      onChange={(e) => setDetailSearch(e.target.value)}
                      placeholder="Buscar producto por nombre o SKU..."
                      style={{ paddingLeft: 30 }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
                    {detailProducts.map((p) => {
                      if (!p.hasVariants) return renderPriceRow(p);
                      const variants = sortedVariants(p);
                      const withOverride = variants.filter((v) => overrideFor(v.id)).length;
                      const open = expanded[p.id] ?? (detailSearch.trim().length > 0 && !matchesSearch({ ...p, variants: [] }, detailSearch));
                      return (
                        <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)' }}>
                            <button onClick={() => setExpanded((prev) => ({ ...prev, [p.id]: !open }))} className="btn btn-ghost btn-xs" style={{ padding: 2 }} title={open ? 'Ocultar variantes' : 'Editar variantes una por una'}>
                              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                                Mismo precio para las {variants.length} variantes{withOverride > 0 ? ` · ${withOverride} con precio en esta lista` : ''}
                              </div>
                            </div>
                            <input
                              type="number" min="0"
                              placeholder="Precio para todas"
                              value={priceDrafts[p.id] ?? ''}
                              onChange={(e) => setPriceDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                              style={{ width: 110 }}
                            />
                            <button onClick={() => saveOverride(p)} className="btn btn-secondary btn-xs">Guardar</button>
                            {withOverride > 0 && (
                              <button onClick={() => removeOverride(p.id, true)} className="btn btn-ghost btn-xs" title="Quitar el precio de todas las variantes"><X size={12} /></button>
                            )}
                          </div>
                          {open && variants.map((v) => renderPriceRow(v, true))}
                        </div>
                      );
                    })}
                    {detailMatches.length > detailProducts.length && (
                      <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: 6 }}>
                        Mostrando {detailProducts.length} de {detailMatches.length} productos. Buscá por nombre o SKU para encontrar el resto.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
