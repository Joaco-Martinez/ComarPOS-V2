/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import SkuScannerModal from '@/components/SkuScannerModal';
import ImageCropModal, { PRODUCT_IMAGE_SIZE } from '@/components/ImageCropModal';
import api from '@/lib/api';
import type { Product, ProductCategory } from '@/types';
import { categoryName, fmtMoney, normalizeArray, num } from '@/lib/helpers';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
import FilterBar from '@/components/mobile/FilterBar';
import { Package, Plus, Edit2, Trash2, X, RefreshCcw, ImagePlus, AlertTriangle, ScanBarcode } from 'lucide-react';

const emptyForm = {
  name: '', description: '', sku: '', type: 'SIMPLE', categoryId: '',
  saleUnit: 'UNIT', isService: 'false',
  price: '', wholesalePrice: '', purchasePrice: '',
  ivaRate: '21',
  pricePerKg: '', wholesalePricePerKg: '',
  minStock: '0', minStockKg: '0',
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
  const [imgPreviewUrl, setImgPreviewUrl] = useState<string | null>(null);
  const [cropSourceFile, setCropSourceFile] = useState<File | null>(null);
  const [toast, setToast] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [formScannerOpen, setFormScannerOpen] = useState(false);

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

  useEffect(() => {
    if (!imgFile) { setImgPreviewUrl(null); return; }
    const url = URL.createObjectURL(imgFile);
    setImgPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imgFile]);

  const filtered = useMemo(() => {
    let p = products;
    if (catFilter) p = p.filter((x) => x.categoryId === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      p = p.filter((x) => x.name.toLowerCase().includes(q) || x.sku?.toLowerCase().includes(q));
    }
    return p;
  }, [products, catFilter, search]);

  const openCreate = () => { setForm(emptyForm); setEditing(null); setImgFile(null); setCropSourceFile(null); setModal('create'); };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name, description: p.description ?? '', sku: p.sku ?? '',
      type: p.type, categoryId: p.categoryId ?? '', saleUnit: p.saleUnit,
      isService: String(p.isService ?? false),
      price: String(p.price), wholesalePrice: String(p.wholesalePrice),
      purchasePrice: String(p.purchasePrice ?? ''),
      ivaRate: String((p as any).ivaRate ?? 21),
      pricePerKg: String(p.pricePerKg ?? ''), wholesalePricePerKg: String(p.wholesalePricePerKg ?? ''),
      minStock: String(p.minStock ?? 0), minStockKg: String(p.minStockKg ?? 0),
    });
    setImgFile(null);
    setCropSourceFile(null);
    setModal('edit');
  };

  const f = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const handleScannedSku = (rawSku: string) => {
    const sku = rawSku.trim().toLowerCase();
    const found = products.find((p) => p.sku && p.sku.trim().toLowerCase() === sku);
    if (!found) {
      showToast(`No encontré ningún producto con SKU: ${rawSku}`);
      return;
    }
    setScannerOpen(false);
    openEdit(found);
  };

  const handleFormSkuScanned = (rawSku: string) => {
    setForm((prev) => ({ ...prev, sku: rawSku.trim() }));
    setFormScannerOpen(false);
  };

  const handleCropped = (cropped: File) => {
    setImgFile(cropped);
    setCropSourceFile(null);
  };

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
      <div style={{ marginBottom: 16 }}>
        <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Buscar por nombre o SKU...">
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ fontSize: 13, width: 180 }}>
            <option value="">Todas las categorías</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={() => { setSearch(''); setCatFilter(''); }} className="btn btn-ghost btn-sm" style={{ color: 'var(--text3)' }}>
            <RefreshCcw size={13} />
          </button>
          <button onClick={() => setScannerOpen(true)} className="btn btn-secondary btn-sm" style={{ gap: 6 }} title="Escanear SKU con la cámara">
            <ScanBarcode size={13} /> Escanear
          </button>
        </FilterBar>
      </div>

      <SkuScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleScannedSku}
        hint="Cuando lo detecte, abre el producto para editarlo."
      />

      {/* Table */}
      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : (
          <ResponsiveTable
            data={filtered}
            keyFor={(p) => p.id}
            emptyIcon={Package}
            emptyMessage="Sin productos"
            columns={[
              {
                key: 'producto', header: 'Producto', render: (p) => (
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
                ),
              },
              { key: 'sku', header: 'SKU', render: (p) => <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{p.sku ?? '—'}</span> },
              { key: 'categoria', header: 'Categoría', render: (p) => <span style={{ fontSize: 12 }}>{categoryName(p)}</span> },
              {
                key: 'precio', header: 'Precio', render: (p) => (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>
                    {fmtMoney(p.saleUnit === 'KG' ? num(p.pricePerKg) : p.price)}{p.saleUnit === 'KG' ? '/kg' : ''}
                  </span>
                ),
              },
              {
                key: 'stock', header: 'Stock local', render: (p) => {
                  const stockVal = p.saleUnit === 'KG' ? num(p.stockLocalKg) : num(p.stockLocal);
                  const minVal = p.saleUnit === 'KG' ? num(p.minStockKg) : num(p.minStock);
                  const low = stockVal <= minVal && minVal > 0;
                  return (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: low ? 'var(--warn)' : 'var(--text2)' }}>
                      {low && <AlertTriangle size={11} style={{ display: 'inline', marginRight: 4 }} />}
                      {stockVal}{p.saleUnit === 'KG' ? 'kg' : ''}
                    </span>
                  );
                },
              },
              {
                key: 'minimo', header: 'Mínimo', render: (p) => {
                  const minVal = p.saleUnit === 'KG' ? num(p.minStockKg) : num(p.minStock);
                  return <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{minVal}</span>;
                },
              },
              {
                key: 'estado', header: 'Estado', render: (p) => (
                  <button onClick={() => toggleActive(p)} className={`badge ${p.isActive !== false ? 'badge-green' : 'badge-gray'}`} style={{ cursor: 'pointer', border: 'none', background: undefined }}>
                    {p.isActive !== false ? 'Activo' : 'Inactivo'}
                  </button>
                ),
              },
              {
                key: 'acciones', header: '', render: (p) => (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => openEdit(p)} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                    <button onClick={() => setConfirmDelete(p)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
                  </div>
                ),
              },
            ] as ResponsiveTableColumn<Product>[]}
            renderMobileCard={(p) => {
              const stockVal = p.saleUnit === 'KG' ? num(p.stockLocalKg) : num(p.stockLocal);
              const minVal = p.saleUnit === 'KG' ? num(p.minStockKg) : num(p.minStock);
              const low = stockVal <= minVal && minVal > 0;
              return (
                <>
                  <div className="mobile-card-head">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Package size={16} style={{ color: 'var(--text3)' }} />
                        </div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{p.sku ?? '—'} · {categoryName(p)}</div>
                      </div>
                    </div>
                    <button onClick={() => toggleActive(p)} className={`badge ${p.isActive !== false ? 'badge-green' : 'badge-gray'}`} style={{ cursor: 'pointer', border: 'none', flexShrink: 0 }}>
                      {p.isActive !== false ? 'Activo' : 'Inactivo'}
                    </button>
                  </div>
                  <div className="mobile-card-row">
                    <span>Precio</span>
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)', fontWeight: 700 }}>
                      {fmtMoney(p.saleUnit === 'KG' ? num(p.pricePerKg) : p.price)}{p.saleUnit === 'KG' ? '/kg' : ''}
                    </span>
                  </div>
                  <div className="mobile-card-row">
                    <span>Stock / mínimo</span>
                    <span style={{ fontFamily: 'var(--mono)', color: low ? 'var(--warn)' : 'var(--text2)' }}>
                      {low && <AlertTriangle size={11} style={{ display: 'inline', marginRight: 4 }} />}
                      {stockVal}{p.saleUnit === 'KG' ? 'kg' : ''} / {minVal}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <button onClick={() => openEdit(p)} className="btn btn-secondary btn-xs" style={{ flex: 1, gap: 4 }}><Edit2 size={12} /> Editar</button>
                    <button onClick={() => setConfirmDelete(p)} className="btn btn-secondary btn-xs" style={{ color: 'var(--danger)', gap: 4 }}><Trash2 size={12} /></button>
                  </div>
                </>
              );
            }}
          />
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
                  <div style={{ position: 'relative' }}>
                    <input value={form.sku} onChange={f('sku')} placeholder="Código de producto" style={{ paddingRight: 38 }} />
                    <button
                      type="button"
                      onClick={() => setFormScannerOpen(true)}
                      title="Escanear código con la cámara"
                      style={{
                        position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', padding: 6,
                        color: 'var(--text3)', display: 'flex',
                      }}
                    >
                      <ScanBarcode size={15} />
                    </button>
                  </div>
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
                <div className="form-row">
                  {[['pricePerKg', 'Precio lista/kg'], ['wholesalePricePerKg', 'Precio mayor/kg']].map(([k, l]) => (
                    <div key={k} className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">{l}</label>
                      <input type="number" min="0" step="any" value={form[k as keyof Form]} onChange={f(k as keyof Form)} placeholder="0" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="form-row">
                  {[['price', 'Precio lista'], ['wholesalePrice', 'Precio mayor']].map(([k, l]) => (
                    <div key={k} className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">{l}</label>
                      <input type="number" min="0" step="any" value={form[k as keyof Form]} onChange={f(k as keyof Form)} placeholder="0" />
                    </div>
                  ))}
                </div>
              )}
              <div className="form-row">
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
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: -4 }}>
                La cantidad de stock no se carga acá — se ajusta desde <b>Stock</b> o <b>Conteo de Stock</b> para que quede registrado el movimiento.
              </div>
              {isKg ? (
                <div className="form-group" style={{ marginBottom: 0, maxWidth: 220 }}>
                  <label className="form-label">Stock mínimo (kg)</label>
                  <input type="number" min="0" step="any" value={form.minStockKg} onChange={f('minStockKg')} />
                </div>
              ) : (
                <div className="form-group" style={{ marginBottom: 0, maxWidth: 220 }}>
                  <label className="form-label">Stock mínimo</label>
                  <input type="number" min="0" step="any" value={form.minStock} onChange={f('minStock')} />
                </div>
              )}

              {/* Image */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Imagen</label>
                <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: -2, marginBottom: 8 }}>
                  Se guarda cuadrada, {PRODUCT_IMAGE_SIZE}×{PRODUCT_IMAGE_SIZE}px — vas a poder encuadrarla antes de subirla.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {(imgPreviewUrl || editing?.imageUrl) && (
                    <img
                      src={imgPreviewUrl ?? editing?.imageUrl ?? ''}
                      alt="Vista previa"
                      style={{ width: 56, height: 56, borderRadius: 6, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border2)' }}
                    />
                  )}
                  <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '9px 12px', background: 'var(--surface2)', border: '1px dashed var(--border2)', borderRadius: 6, fontSize: 13, color: 'var(--text2)' }}>
                    <ImagePlus size={15} style={{ color: 'var(--text3)' }} />
                    {imgFile ? imgFile.name : 'Seleccionar imagen'}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const picked = e.target.files?.[0] ?? null;
                        if (picked) setCropSourceFile(picked);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
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

      <SkuScannerModal
        open={formScannerOpen}
        onClose={() => setFormScannerOpen(false)}
        onDetected={handleFormSkuScanned}
        title="Escanear SKU"
        hint="Cuando lo detecte, completa el campo SKU."
      />

      <ImageCropModal
        open={cropSourceFile !== null}
        file={cropSourceFile}
        onClose={() => setCropSourceFile(null)}
        onCropped={handleCropped}
      />

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
