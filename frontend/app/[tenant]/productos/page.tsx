/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import AppLayout from '@/components/AppLayout';
import SkuScannerModal from '@/components/SkuScannerModal';
import ImageCropModal, { PRODUCT_IMAGE_SIZE } from '@/components/ImageCropModal';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { Product, ProductCategory, Supplier, BusinessLocation } from '@/types';
import { categoryName, fmtKg, fmtMoney, normalizeArray, num, productStock, productMinStock, productHasLowStockLocation } from '@/lib/helpers';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
import FilterBar from '@/components/mobile/FilterBar';
import { Package, PackagePlus, Plus, Edit2, Trash2, X, RefreshCcw, ImagePlus, Camera, AlertTriangle, ScanBarcode, Barcode, Download, FileSpreadsheet } from 'lucide-react';

const emptyForm = {
  name: '', description: '', sku: '', type: 'SIMPLE', categoryId: '', supplierId: '',
  saleUnit: 'UNIT', isService: 'false', unlimitedStock: 'false',
  price: '', purchasePrice: '',
  ivaRate: '21',
  pricePerKg: '',
};

type Form = typeof emptyForm;

export default function ProductosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [initialStock, setInitialStock] = useState<Record<string, string>>({});
  const [initialMinStock, setInitialMinStock] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgPreviewUrl, setImgPreviewUrl] = useState<string | null>(null);
  const [cropSourceFile, setCropSourceFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [formScannerOpen, setFormScannerOpen] = useState(false);

  // Agregar stock desde Productos: pega directo a los mismos endpoints que
  // usa la página Stock (product.stock.ts#addStock/addStockKg) para que
  // quede registrado el StockMovement (tipo INGRESS, con usuario y motivo) —
  // por eso no se deja editar la cantidad de stock a mano en el form de
  // arriba (ver nota en la sección Stock del modal de producto).
  const [stockModal, setStockModal] = useState<Product | null>(null);
  const [stockForm, setStockForm] = useState({ businessLocationId: '', quantity: '', reason: '' });
  const [addingStock, setAddingStock] = useState(false);

  // Módulo de códigos de barra: seleccionar productos (con SKU) y cuántas
  // etiquetas de cada uno, para descargar un PDF listo para imprimir en hojas
  // de stickers o un Excel con el código embebido.
  const [barcodeModal, setBarcodeModal] = useState(false);
  const [barcodeSelected, setBarcodeSelected] = useState<Record<string, boolean>>({});
  const [barcodeQty, setBarcodeQty] = useState<Record<string, string>>({});
  const [barcodeSearch, setBarcodeSearch] = useState('');
  const [barcodeDownloading, setBarcodeDownloading] = useState<'pdf' | 'excel' | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [pr, cr, sr, lr] = await Promise.all([
        api.get('/products', { params: { limit: 500 } }),
        api.get('/categories'),
        api.get('/suppliers').catch(() => null),
        api.get('/business-locations', { params: { onlyActive: true } }).catch(() => null),
      ]);
      setProducts(normalizeArray<Product>(pr.data));
      setCategories(normalizeArray<ProductCategory>(cr.data).filter((c) => c.isActive));
      if (sr) setSuppliers(normalizeArray<Supplier>(sr.data).filter((s) => s.isActive));
      if (lr) setLocations(normalizeArray<BusinessLocation>(lr.data));
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

  const openCreate = () => { setForm(emptyForm); setEditing(null); setImgFile(null); setCropSourceFile(null); setInitialStock({}); setInitialMinStock({}); setModal('create'); };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name, description: p.description ?? '', sku: p.sku ?? '',
      type: p.type, categoryId: p.categoryId ?? '', supplierId: p.supplierId ?? '', saleUnit: p.saleUnit,
      isService: String(p.isService ?? false),
      unlimitedStock: String(p.unlimitedStock ?? false),
      price: String(p.price),
      purchasePrice: String(p.purchasePrice ?? ''),
      ivaRate: String((p as any).ivaRate ?? 21),
      pricePerKg: String(p.pricePerKg ?? ''),
    });
    setImgFile(null);
    setCropSourceFile(null);
    setInitialStock({});
    setInitialMinStock({});
    setModal('edit');
  };

  const f = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));


  const handleScannedSku = (rawSku: string) => {
    const sku = rawSku.trim().toLowerCase();
    const found = products.find((p) => p.sku && p.sku.trim().toLowerCase() === sku);
    if (!found) {
      toast.error(`No encontré ningún producto con SKU: ${rawSku}`);
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

  const handleImagePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    if (picked) setCropSourceFile(picked);
    e.target.value = '';
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v !== '') body.append(k, v); });
      if (imgFile) body.append('image', imgFile);

      if (modal === 'create') {
        const isKg = form.saleUnit === 'KG';
        const locationIds = new Set([...Object.keys(initialStock), ...Object.keys(initialMinStock)]);
        const stockEntries = Array.from(locationIds)
          .map((businessLocationId) => ({
            businessLocationId,
            qty: num(initialStock[businessLocationId] ?? ''),
            min: num(initialMinStock[businessLocationId] ?? ''),
          }))
          .filter((e) => e.qty > 0 || e.min > 0)
          .map((e) => ({
            businessLocationId: e.businessLocationId,
            ...(isKg ? { quantityKg: e.qty } : { quantity: e.qty }),
            ...(e.min > 0 ? (isKg ? { minQuantityKg: e.min } : { minQuantity: e.min }) : {}),
          }));
        if (stockEntries.length > 0) {
          body.append('initialStock', JSON.stringify(stockEntries));
        }
        await api.post('/products', body);
        toast.success('Producto creado correctamente');
      } else if (editing) {
        await api.put(`/products/${editing.id}`, body);
        toast.success('Producto actualizado');
      }
      setModal(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (p: Product) => {
    try {
      await api.delete(`/products/${p.id}`);
      toast.success('Producto eliminado');
      load();
    } catch {
      toast.error('Error al eliminar');
    }
    setConfirmDelete(null);
  };

  const toggleActive = async (p: Product) => {
    try {
      await api.put(`/products/${p.id}`, { isActive: !p.isActive });
      load();
    } catch {
      toast.error('Error al cambiar estado');
    }
  };

  const canAddStock = (p: Product) => p.isService !== true && p.unlimitedStock !== true && p.type !== 'COMPUESTO';

  const openStockModal = (p: Product) => {
    setStockModal(p);
    setStockForm({ businessLocationId: locations[0]?.id ?? '', quantity: '', reason: '' });
  };

  const submitAddStock = async () => {
    if (!stockModal || !stockForm.businessLocationId || num(stockForm.quantity) <= 0) return;
    setAddingStock(true);
    try {
      const isKgProduct = stockModal.saleUnit === 'KG';
      if (isKgProduct) {
        await api.post(`/products/${stockModal.id}/add-stock-kg`, {
          businessLocationId: stockForm.businessLocationId,
          quantityKg: num(stockForm.quantity),
          reason: stockForm.reason || undefined,
        });
      } else {
        await api.post('/products/add-stock', {
          productId: stockModal.id,
          businessLocationId: stockForm.businessLocationId,
          quantity: num(stockForm.quantity),
          reason: stockForm.reason || undefined,
        });
      }
      toast.success('Stock agregado y movimiento registrado');
      setStockModal(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al agregar stock');
    } finally {
      setAddingStock(false);
    }
  };

  const barcodeProducts = useMemo(
    () => products.filter((p) => p.sku && p.sku.trim() && p.isActive !== false),
    [products]
  );

  const barcodeFiltered = useMemo(() => {
    if (!barcodeSearch.trim()) return barcodeProducts;
    const q = barcodeSearch.toLowerCase();
    return barcodeProducts.filter((p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
  }, [barcodeProducts, barcodeSearch]);

  const openBarcodeModal = () => {
    const selected: Record<string, boolean> = {};
    const qty: Record<string, string> = {};
    barcodeProducts.forEach((p) => { selected[p.id] = true; qty[p.id] = '1'; });
    setBarcodeSelected(selected);
    setBarcodeQty(qty);
    setBarcodeSearch('');
    setBarcodeModal(true);
  };

  const toggleBarcodeAll = (checked: boolean) => {
    const next: Record<string, boolean> = { ...barcodeSelected };
    barcodeFiltered.forEach((p) => { next[p.id] = checked; });
    setBarcodeSelected(next);
  };

  const barcodeSelectedIds = useMemo(
    () => Object.entries(barcodeSelected).filter(([, v]) => v).map(([id]) => id),
    [barcodeSelected]
  );

  const downloadBarcodes = async (type: 'pdf' | 'excel') => {
    if (barcodeSelectedIds.length === 0) {
      toast.error('Seleccioná al menos un producto');
      return;
    }
    setBarcodeDownloading(type);
    try {
      const params: Record<string, string> = { productIds: barcodeSelectedIds.join(',') };
      if (type === 'pdf') {
        const quantities: Record<string, number> = {};
        barcodeSelectedIds.forEach((id) => { quantities[id] = Math.max(1, num(barcodeQty[id] ?? '1') || 1); });
        params.quantities = JSON.stringify(quantities);
      }
      const res = await api.get(`/products/barcodes/${type === 'pdf' ? 'pdf' : 'excel'}`, {
        params,
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `codigos-de-barra.${type === 'pdf' ? 'pdf' : 'xlsx'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al generar el archivo');
    } finally {
      setBarcodeDownloading(null);
    }
  };

  const isKg = form.saleUnit === 'KG';

  return (
    <AppLayout
      title="Productos"
      subtitle={`${filtered.length} de ${products.length} productos`}
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={openBarcodeModal} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
            <Barcode size={13} /> Códigos de barra
          </button>
          <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
            <Plus size={13} /> Nuevo producto
          </button>
        </div>
      }
    >
      {/* Filters */}
      <div style={{ marginBottom: 16 }}>
        <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Buscar por nombre o SKU...">
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ width: 180 }}>
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
                key: 'stock', header: 'Stock total', render: (p) => {
                  if (p.unlimitedStock) {
                    return <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>Sin límite</span>;
                  }
                  const stockVal = productStock(p);
                  const low = productHasLowStockLocation(p);
                  return (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: low ? 'var(--warn)' : 'var(--text2)' }}>
                      {low && <AlertTriangle size={11} style={{ display: 'inline', marginRight: 4 }} />}
                      {p.saleUnit === 'KG' ? `${fmtKg(stockVal)}kg` : stockVal}
                    </span>
                  );
                },
              },
              {
                key: 'ubicaciones', header: 'Por ubicación', render: (p) => (
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {(p.stock ?? []).filter((s) => (p.saleUnit === 'KG' ? s.quantityKg : s.quantity) > 0)
                      .map((s) => `${s.businessLocation?.name ?? '?'}: ${p.saleUnit === 'KG' ? s.quantityKg : s.quantity}`)
                      .join(' · ') || '—'}
                  </span>
                ),
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
                    {canAddStock(p) && (
                      <button onClick={() => openStockModal(p)} className="btn btn-ghost btn-xs" title="Agregar stock" style={{ color: 'var(--success)' }}>
                        <PackagePlus size={12} />
                      </button>
                    )}
                    <button onClick={() => openEdit(p)} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                    <button onClick={() => setConfirmDelete(p)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
                  </div>
                ),
              },
            ] as ResponsiveTableColumn<Product>[]}
            renderMobileCard={(p) => {
              const stockVal = productStock(p);
              const minVal = productMinStock(p);
              const low = productHasLowStockLocation(p);
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
                    {p.unlimitedStock ? (
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>Sin límite</span>
                    ) : (
                      <span style={{ fontFamily: 'var(--mono)', color: low ? 'var(--warn)' : 'var(--text2)' }}>
                        {low && <AlertTriangle size={11} style={{ display: 'inline', marginRight: 4 }} />}
                        {p.saleUnit === 'KG' ? `${fmtKg(stockVal)}kg` : stockVal} / {p.saleUnit === 'KG' ? fmtKg(minVal) : minVal}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    {canAddStock(p) && (
                      <button onClick={() => openStockModal(p)} className="btn btn-secondary btn-xs" style={{ flex: 1, gap: 4, color: 'var(--success)' }}><PackagePlus size={12} /> Stock</button>
                    )}
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
      {/* Portal a document.body: renderizado inline (como el resto de los
          modales de esta página) queda anidado dentro de #main-content/<main>,
          y por algún ancestro intermedio (sin identificar del todo, mismo
          problema que ya documentado más abajo con .bottom-nav) el
          position:fixed del overlay no termina cubriendo el viewport
          completo -- se ve el header de la página (título, botones,
          campanita) por encima del modal en vez de tapado. Portalear al
          <body>, como ya hace HelpCenter.tsx, sortea esos ancestros y deja
          el overlay realmente fijo contra el viewport. */}
      {modal && typeof document !== 'undefined' && createPortal(
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg modal-mobile-full" onClick={(e) => e.stopPropagation()}>
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
                    <input
                      value={form.sku}
                      onChange={f('sku')}
                      placeholder={modal === 'create' ? 'Se genera automáticamente si lo dejás vacío' : 'Código de producto'}
                      style={{ paddingRight: 38 }}
                    />
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

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Proveedor</label>
                <select value={form.supplierId} onChange={f('supplierId')}>
                  <option value="">Sin proveedor</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="form-grid-3">
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
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" title="Se puede vender siempre, sin importar el stock cargado. No se descuenta ni se controla stock para este producto.">
                    Sin stock
                  </label>
                  <select value={form.unlimitedStock} onChange={f('unlimitedStock')}>
                    <option value="false">No, controlar stock</option>
                    <option value="true">Sí, siempre disponible</option>
                  </select>
                </div>
              </div>

              {/* Prices */}
              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>
                Precios {isKg ? '(por kg)' : ''}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: -6, marginBottom: 4 }}>
                Este es el precio de la lista Minorista. Para mayoristas u otros precios especiales,
                creá listas de precios adicionales en Productos → Listas de precios.
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">{isKg ? 'Precio lista/kg' : 'Precio lista'}</label>
                  <input
                    type="number" min="0" step="any"
                    value={form[isKg ? 'pricePerKg' : 'price']}
                    onChange={f(isKg ? 'pricePerKg' : 'price')}
                    placeholder="0"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Costo de compra</label>
                  <input type="number" min="0" step="any" value={form.purchasePrice} onChange={f('purchasePrice')} placeholder="0" />
                </div>
              </div>
              <div className="form-row">
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
              {modal === 'create' && form.unlimitedStock === 'false' && locations.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: -4 }}>
                    Opcional: cargá la cantidad inicial y el mínimo por ubicación para no tener que ir después a <b>Stock</b>. El mínimo dispara las alertas y notificaciones de stock bajo.
                  </div>
                  {locations.map((loc) => (
                    <div key={loc.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, background: 'var(--surface2)', borderRadius: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{loc.name}</span>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                          <label className="form-label" style={{ marginBottom: 4 }}>Cantidad</label>
                          <input
                            type="number" min="0" step="any"
                            value={initialStock[loc.id] ?? ''}
                            onChange={(e) => setInitialStock((prev) => ({ ...prev, [loc.id]: e.target.value }))}
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="form-label" style={{ marginBottom: 4 }}>Mínimo</label>
                          <input
                            type="number" min="0" step="any"
                            value={initialMinStock[loc.id] ?? ''}
                            onChange={(e) => setInitialMinStock((prev) => ({ ...prev, [loc.id]: e.target.value }))}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: -4 }}>
                  La cantidad y el mínimo de stock no se cargan acá — se ajustan por ubicación desde <b>Stock</b> o <b>Conteo de Stock</b> para que quede registrado el movimiento.
                </div>
              )}

              {/* Image */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Imagen</label>
                <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: -2, marginBottom: 8 }}>
                  Se guarda cuadrada, {PRODUCT_IMAGE_SIZE}×{PRODUCT_IMAGE_SIZE}px — vas a poder encuadrarla antes de subirla.
                </p>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  {(imgPreviewUrl || editing?.imageUrl) && (
                    <img
                      src={imgPreviewUrl ?? editing?.imageUrl ?? ''}
                      alt="Vista previa"
                      style={{ width: 56, height: 56, borderRadius: 6, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border2)' }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 220, display: 'flex', gap: 8 }}>
                    {/* capture="environment" abre directo la cámara trasera en mobile
                        (en desktop el navegador lo ignora y cae al selector de archivos
                        de siempre) -- botón separado del de galería para no forzar la
                        cámara cuando el usuario quiere subir una foto ya sacada. */}
                    <label style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer', padding: '10px 10px', background: 'var(--surface2)', border: '1px dashed var(--border2)', borderRadius: 6, fontSize: 12, color: 'var(--text2)' }}>
                      <Camera size={15} style={{ color: 'var(--text3)', flexShrink: 0 }} />
                      Tomar foto
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={handleImagePicked}
                      />
                    </label>
                    <label style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer', padding: '10px 10px', background: 'var(--surface2)', border: '1px dashed var(--border2)', borderRadius: 6, fontSize: 12, color: 'var(--text2)' }}>
                      <ImagePlus size={15} style={{ color: 'var(--text3)', flexShrink: 0 }} />
                      Galería
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleImagePicked}
                      />
                    </label>
                  </div>
                </div>
                {imgFile && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {imgFile.name}
                  </div>
                )}
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
        </div>,
        document.body
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

      {/* Agregar stock */}
      {stockModal && (
        <div className="modal-overlay" onClick={() => !addingStock && setStockModal(null)}>
          <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Agregar stock</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{stockModal.name}</div>
              </div>
              <button onClick={() => setStockModal(null)} disabled={addingStock} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {locations.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--warn)' }}>
                  No hay ninguna ubicación de stock configurada. Creá una desde Configuración → Sucursales.
                </div>
              ) : (
                <>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Ubicación</label>
                    <select
                      value={stockForm.businessLocationId}
                      onChange={(e) => setStockForm((p) => ({ ...p, businessLocationId: e.target.value }))}
                    >
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Cantidad a agregar {stockModal.saleUnit === 'KG' ? '(kg)' : ''}</label>
                    <input
                      type="number" min="0.01" step="any" autoFocus
                      value={stockForm.quantity}
                      onChange={(e) => setStockForm((p) => ({ ...p, quantity: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Motivo</label>
                    <input
                      value={stockForm.reason}
                      onChange={(e) => setStockForm((p) => ({ ...p, reason: e.target.value }))}
                      placeholder="Ej: compra a proveedor (opcional)"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setStockModal(null)} disabled={addingStock} className="btn btn-secondary btn-sm">Cancelar</button>
              <button
                onClick={submitAddStock}
                disabled={addingStock || locations.length === 0 || !stockForm.businessLocationId || num(stockForm.quantity) <= 0}
                className="btn btn-primary btn-sm"
              >
                {addingStock ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Códigos de barra */}
      {barcodeModal && (
        <div className="modal-overlay" onClick={() => !barcodeDownloading && setBarcodeModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '92vh' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 800, fontSize: 15 }}>Códigos de barra</span>
              <button onClick={() => setBarcodeModal(false)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>
                Elegí los productos y cuántas etiquetas de cada uno querés imprimir. Solo se listan los productos activos con SKU cargado.
              </p>
              <input
                value={barcodeSearch}
                onChange={(e) => setBarcodeSearch(e.target.value)}
                placeholder="Buscar por nombre o SKU..."
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={barcodeFiltered.length > 0 && barcodeFiltered.every((p) => barcodeSelected[p.id])}
                    onChange={(e) => toggleBarcodeAll(e.target.checked)}
                  />
                  Seleccionar todos
                </label>
                <span>· {barcodeSelectedIds.length} seleccionados</span>
              </div>

              <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid var(--border2)', borderRadius: 6 }}>
                {barcodeFiltered.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--text3)' }}>
                    No hay productos con SKU que coincidan.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {barcodeFiltered.map((p) => (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--border2)' }}>
                          <td style={{ padding: '6px 8px', width: 28 }}>
                            <input
                              type="checkbox"
                              checked={!!barcodeSelected[p.id]}
                              onChange={(e) => setBarcodeSelected((prev) => ({ ...prev, [p.id]: e.target.checked }))}
                            />
                          </td>
                          <td style={{ padding: '6px 8px', fontSize: 12 }}>
                            <div style={{ fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{p.sku}</div>
                          </td>
                          <td style={{ padding: '6px 8px', width: 90, textAlign: 'right' }}>
                            <input
                              type="number" min="1" step="1"
                              value={barcodeQty[p.id] ?? '1'}
                              disabled={!barcodeSelected[p.id]}
                              onChange={(e) => setBarcodeQty((prev) => ({ ...prev, [p.id]: e.target.value }))}
                              style={{ width: 70, textAlign: 'center' }}
                              title="Cantidad de etiquetas"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setBarcodeModal(false)} className="btn btn-secondary btn-sm">Cerrar</button>
              <button
                onClick={() => downloadBarcodes('excel')}
                disabled={!!barcodeDownloading || barcodeSelectedIds.length === 0}
                className="btn btn-secondary btn-sm"
                style={{ gap: 6 }}
              >
                {barcodeDownloading === 'excel' ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <FileSpreadsheet size={13} />}
                Excel
              </button>
              <button
                onClick={() => downloadBarcodes('pdf')}
                disabled={!!barcodeDownloading || barcodeSelectedIds.length === 0}
                className="btn btn-primary btn-sm"
                style={{ gap: 6 }}
              >
                {barcodeDownloading === 'pdf' ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Download size={13} />}
                PDF para imprimir
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
