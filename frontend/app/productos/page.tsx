/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import type { Product, ProductCategory } from '@/types';
import { categoryName, fmtMoney, normalizeArray, num } from '@/lib/helpers';
import { Package, Plus, Search, Edit2, Trash2, X, RefreshCcw, ImagePlus, AlertTriangle } from 'lucide-react';

const emptyForm = {
  name: '', description: '', sku: '', type: 'SIMPLE', categoryId: '',
  saleUnit: 'UNIT', isService: 'false',
  price: '', clientPrice: '', wholesalePrice: '', purchasePrice: '',
  ivaRate: '21',
  pricePerKg: '', clientPricePerKg: '', wholesalePricePerKg: '',
  stockLocal: '0', stockDeposito: '0', minStock: '0',
  stockLocalKg: '0', stockDepositoKg: '0', minStockKg: '0',
};

type Form = typeof emptyForm;

export default function ProductosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [toast, setToast] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [pr, cr] = await Promise.all([
        api.get('/products', { params: { limit: 500 } }),
        api.get('/categories'),
      ]);
      setProducts(normalizeArray<Product>(pr.data));
      setCategories(normalizeArray<ProductCategory>(cr.data).filter((c) => c.isActive));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let p = products;
    if (catFilter) p = p.filter((x) => x.categoryId === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      p = p.filter((x) => x.name.toLowerCase().includes(q) || x.sku?.toLowerCase().includes(q));
    }
    return p;
  }, [products, catFilter, search]);

  const openCreate = () => { setForm(emptyForm); setEditing(null); setImgFile(null); setModal('create'); };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name, description: p.description ?? '', sku: p.sku ?? '',
      type: p.type, categoryId: p.categoryId ?? '', saleUnit: p.saleUnit,
      isService: String(p.isService ?? false),
      price: String(p.price), clientPrice: String(p.clientPrice), wholesalePrice: String(p.wholesalePrice),
      purchasePrice: String(p.purchasePrice ?? ''),
      ivaRate: String((p as any).ivaRate ?? 21),
      pricePerKg: String(p.pricePerKg ?? ''), clientPricePerKg: String(p.clientPricePerKg ?? ''), wholesalePricePerKg: String(p.wholesalePricePerKg ?? ''),
      stockLocal: String(p.stockLocal), stockDeposito: String(p.stockDeposito), minStock: String(p.minStock ?? 0),
      stockLocalKg: String(p.stockLocalKg ?? 0), stockDepositoKg: String(p.stockDepositoKg ?? 0), minStockKg: String(p.minStockKg ?? 0),
    });
    setImgFile(null);
    setModal('edit');
  };

  const f = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v !== '') body.append(k, v); });
      if (imgFile) body.append('image', imgFile);

      if (modal === 'create') {
        await api.post('/products', body);
        showToast('Producto creado correctamente');
      } else if (editing) {
        await api.put(`/products/${editing.id}`, body);
        showToast('Producto actualizado');
      }
      setModal(null);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (p: Product) => {
    try {
      await api.delete(`/products/${p.id}`);
      showToast('Producto eliminado');
      load();
    } catch {
      showToast('Error al eliminar');
    }
    setConfirmDelete(null);
  };

  const toggleActive = async (p: Product) => {
    try {
      await api.put(`/products/${p.id}`, { isActive: !p.isActive });
      load();
    } catch {
      showToast('Error al cambiar estado');
    }
  };

  const isKg = form.saleUnit === 'KG';

  return (
    <AppLayout
      title="Productos"
      subtitle={`${filtered.length} de ${products.length} productos`}
      actions={
        <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
          <Plus size={13} /> Nuevo producto
        </button>
      }
    >
      {toast && (
        <div style={{ position: 'fixed', top: 70, right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)', animation: 'fadeIn 0.2s ease', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
          {toast}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: '0 0 240px' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o SKU..." style={{ paddingLeft: 30, fontSize: 13 }} />
        </div>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ fontSize: 13, width: 180 }}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={() => { setSearch(''); setCatFilter(''); }} className="btn btn-ghost btn-sm" style={{ color: 'var(--text3)' }}>
          <RefreshCcw size={13} />
        </button>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><Package size={32} /><p>Sin productos</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>SKU</th>
                  <th>Categoría</th>
                  <th>Precio</th>
                  <th>Stock local</th>
                  <th>Mínimo</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const stockVal = p.saleUnit === 'KG' ? num(p.stockLocalKg) : num(p.stockLocal);
                  const minVal = p.saleUnit === 'KG' ? num(p.minStockKg) : num(p.minStock);
                  const low = stockVal <= minVal && minVal > 0;
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.name} style={{ width: 32, height: 32, borderRadius: 5, objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 32, height: 32, borderRadius: 5, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Package size={14} style={{ color: 'var(--text3)' }} />
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--text3)' }}>{p.type} · {p.saleUnit}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{p.sku ?? '—'}</td>
                      <td style={{ fontSize: 12 }}>{categoryName(p)}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>
                        {fmtMoney(p.saleUnit === 'KG' ? num(p.pricePerKg) : p.price)}{p.saleUnit === 'KG' ? '/kg' : ''}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: low ? 'var(--warn)' : 'var(--text2)' }}>
                          {low && <AlertTriangle size={11} style={{ display: 'inline', marginRight: 4 }} />}
                          {stockVal}{p.saleUnit === 'KG' ? 'kg' : ''}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{minVal}</td>
                      <td>
                        <button onClick={() => toggleActive(p)} className={`badge ${p.isActive !== false ? 'badge-green' : 'badge-gray'}`} style={{ cursor: 'pointer', border: 'none', background: undefined }}>
                          {p.isActive !== false ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => openEdit(p)} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                          <button onClick={() => setConfirmDelete(p)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '92vh' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 800, fontSize: 15 }}>{modal === 'create' ? 'Nuevo producto' : 'Editar producto'}</span>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Nombre *</label>
                  <input value={form.name} onChange={f('name')} placeholder="Nombre del producto" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">SKU</label>
                  <input value={form.sku} onChange={f('sku')} placeholder="Código de producto" />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Categoría</label>
                  <select value={form.categoryId} onChange={f('categoryId')}>
                    <option value="">Sin categoría</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Unidad de venta</label>
                  <select value={form.saleUnit} onChange={f('saleUnit')}>
                    <option value="UNIT">Unidad</option>
                    <option value="KG">Kilogramos</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tipo</label>
                  <select value={form.type} onChange={f('type')}>
                    <option value="SIMPLE">Simple</option>
                    <option value="COMPUESTO">Compuesto</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Es servicio</label>
                  <select value={form.isService} onChange={f('isService')}>
                    <option value="false">No</option>
                    <option value="true">Sí</option>
                  </select>
                </div>
              </div>

              {/* Prices */}
              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>
                Precios {isKg ? '(por kg)' : ''}
              </div>
              {isKg ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {[['pricePerKg', 'Precio lista/kg'], ['clientPricePerKg', 'Precio cliente/kg'], ['wholesalePricePerKg', 'Precio mayor/kg']].map(([k, l]) => (
                    <div key={k} className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">{l}</label>
                      <input type="number" min="0" step="any" value={form[k as keyof Form]} onChange={f(k as keyof Form)} placeholder="0" />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {[['price', 'Precio lista'], ['clientPrice', 'Precio cliente'], ['wholesalePrice', 'Precio mayor']].map(([k, l]) => (
                    <div key={k} className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">{l}</label>
                      <input type="number" min="0" step="any" value={form[k as keyof Form]} onChange={f(k as keyof Form)} placeholder="0" />
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Costo de compra</label>
                  <input type="number" min="0" step="any" value={form.purchasePrice} onChange={f('purchasePrice')} placeholder="0" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tasa IVA</label>
                  <select value={form.ivaRate} onChange={f('ivaRate')}>
                    <option value="0">0% — Exento</option>
                    <option value="10.5">10.5% — Reducida</option>
                    <option value="21">21% — General</option>
                    <option value="27">27%</option>
                  </select>
                </div>
              </div>

              {/* Stock */}
              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Stock</div>
              {isKg ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {[['stockLocalKg', 'Stock local (kg)'], ['stockDepositoKg', 'Stock depósito (kg)'], ['minStockKg', 'Stock mínimo (kg)']].map(([k, l]) => (
                    <div key={k} className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">{l}</label>
                      <input type="number" min="0" step="any" value={form[k as keyof Form]} onChange={f(k as keyof Form)} />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {[['stockLocal', 'Stock local'], ['stockDeposito', 'Stock depósito'], ['minStock', 'Stock mínimo']].map(([k, l]) => (
                    <div key={k} className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">{l}</label>
                      <input type="number" min="0" step="any" value={form[k as keyof Form]} onChange={f(k as keyof Form)} />
                    </div>
                  ))}
                </div>
              )}

              {/* Image */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Imagen</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '9px 12px', background: 'var(--surface2)', border: '1px dashed var(--border2)', borderRadius: 6, fontSize: 13, color: 'var(--text2)' }}>
                  <ImagePlus size={15} style={{ color: 'var(--text3)' }} />
                  {imgFile ? imgFile.name : 'Seleccionar imagen'}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setImgFile(e.target.files?.[0] ?? null)} />
                </label>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Descripción</label>
                <textarea value={form.description} onChange={f('description')} rows={2} placeholder="Descripción opcional" style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={save} disabled={saving || !form.name.trim()} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : modal === 'create' ? 'Crear producto' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 340 }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700 }}>Eliminar producto</span>
              <button onClick={() => setConfirmDelete(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: 'var(--text2)' }}>
                ¿Eliminar <strong style={{ color: 'var(--text)' }}>{confirmDelete.name}</strong>? Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setConfirmDelete(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={() => deleteProduct(confirmDelete)} className="btn btn-danger btn-sm">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
