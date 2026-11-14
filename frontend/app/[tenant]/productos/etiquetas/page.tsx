/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import LabelPreview, { type PreviewProduct } from '@/components/labels/LabelPreview';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { PriceList, Product, ProductCategory, Supplier } from '@/types';
import { fmtKg, normalizeArray, num, productStock } from '@/lib/helpers';
import { sortedVariants } from '@/lib/variants';
import {
  DEFAULT_DESIGNS,
  LABEL_SIZE_KEYS,
  normalizeDesigns,
  type LabelAlign,
  type LabelDesign,
  type LabelDesigns,
  type LabelElementKey,
  type LabelSize,
  type LabelTextStyle,
} from '@/lib/labelDesign';
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowUp, Bold, Download, Eye, EyeOff,
  FileSpreadsheet, RotateCcw, Save,
} from 'lucide-react';

// Productos -> Etiquetas: elegir productos (filtros, cantidad, tamano), ver
// como queda la etiqueta en cada tamano y editarla (letra, color, negrita,
// alineacion, alto/ancho del codigo, orden de los elementos, medidas). El
// diseno se guarda para todo el negocio (PUT /products/barcodes/design) y el
// PDF se genera con el diseno que se ve en pantalla.

const SIZE_LABELS: Record<LabelSize, string> = { chico: 'Chico', mediano: 'Mediano', grande: 'Grande' };
const ELEMENT_LABELS: Record<LabelElementKey, string> = {
  name: 'Nombre del producto',
  barcode: 'Código de barras',
  sku: 'Número del código',
  price: 'Precio',
  extras: 'Precios de otras listas',
};
const SWATCHES = ['#000000', '#dc2626', '#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#6b7280'];

type BarcodeProduct = Product & { parent?: { id: string; name: string } };
type ListPrices = Record<string, { price: number; pricePerKg?: number | null }>;

const sectionStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 14,
};
const smallLabel: React.CSSProperties = { fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 };

export default function EtiquetasPage() {
  const { tenant } = useParams<{ tenant: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, string>>({});
  const [sizeOf, setSizeOf] = useState<Record<string, LabelSize>>({});
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [listSel, setListSel] = useState<Record<string, boolean>>({});
  const [listPrices, setListPrices] = useState<Record<string, ListPrices>>({});
  const [downloading, setDownloading] = useState<'pdf' | 'excel' | null>(null);

  const [designs, setDesigns] = useState<LabelDesigns>(DEFAULT_DESIGNS);
  const [savedDesigns, setSavedDesigns] = useState<LabelDesigns>(DEFAULT_DESIGNS);
  const [savingDesign, setSavingDesign] = useState(false);
  const [editSize, setEditSize] = useState<LabelSize>('mediano');
  const [editElement, setEditElement] = useState<LabelElementKey>('name');
  const [sampleId, setSampleId] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [pr, cr, sr, lr, dr] = await Promise.all([
          api.get('/products', { params: { limit: 500, grouped: true } }),
          api.get('/categories'),
          api.get('/suppliers').catch(() => null),
          api.get('/price-lists').catch(() => null),
          api.get('/products/barcodes/design').catch(() => null),
        ]);
        setProducts(normalizeArray<Product>(pr.data));
        setCategories(normalizeArray<ProductCategory>(cr.data).filter((c) => c.isActive));
        if (sr) setSuppliers(normalizeArray<Supplier>(sr.data).filter((s) => s.isActive));
        if (lr) setPriceLists(normalizeArray<PriceList>(lr.data).filter((pl) => !pl.isDefault && pl.isActive !== false));
        if (dr?.data?.designs) {
          const d = normalizeDesigns(dr.data.designs);
          setDesigns(d);
          setSavedDesigns(d);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Una etiqueta por variante (con su SKU); los padres sin SKU no generan
  // etiqueta. Las variantes se listan con el nombre de su padre.
  const barcodeProducts = useMemo<BarcodeProduct[]>(
    () => products
      .flatMap((p) => (p.hasVariants
        ? sortedVariants(p).map((v) => ({ ...v, supplierId: v.supplierId ?? p.supplierId, categoryId: v.categoryId ?? p.categoryId, parent: { id: p.id, name: p.name } }) as BarcodeProduct)
        : [p as BarcodeProduct]))
      .filter((p) => p.sku && p.sku.trim() && p.isActive !== false),
    [products]
  );

  // Al cargar: todos tildados, 1 etiqueta, tamano mediano.
  useEffect(() => {
    const s: Record<string, boolean> = {};
    const q: Record<string, string> = {};
    const z: Record<string, LabelSize> = {};
    barcodeProducts.forEach((p) => { s[p.id] = true; q[p.id] = '1'; z[p.id] = 'mediano'; });
    setSelected(s);
    setQty(q);
    setSizeOf(z);
  }, [barcodeProducts]);

  const matchesFilters = useCallback((p: { supplierId?: string | null; categoryId?: string | null }) => {
    if (supplierFilter && (supplierFilter === 'none' ? !!p.supplierId : p.supplierId !== supplierFilter)) return false;
    if (categoryFilter && (categoryFilter === 'none' ? !!p.categoryId : p.categoryId !== categoryFilter)) return false;
    return true;
  }, [supplierFilter, categoryFilter]);

  const filtered = useMemo(() => {
    const byFilters = barcodeProducts.filter(matchesFilters);
    if (!search.trim()) return byFilters;
    const q = search.toLowerCase();
    return byFilters.filter((p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || Boolean(p.parent?.name.toLowerCase().includes(q)));
  }, [barcodeProducts, search, matchesFilters]);

  // Con un proveedor o categoria elegidos solo cuentan los que coinciden.
  const selectedIds = useMemo(() => {
    const ids = Object.entries(selected).filter(([, v]) => v).map(([id]) => id);
    if (!supplierFilter && !categoryFilter) return ids;
    const allowed = new Set(barcodeProducts.filter(matchesFilters).map((p) => p.id));
    return ids.filter((id) => allowed.has(id));
  }, [selected, supplierFilter, categoryFilter, barcodeProducts, matchesFilters]);

  const countBySize = useMemo(() => {
    const c: Record<LabelSize, number> = { chico: 0, mediano: 0, grande: 0 };
    selectedIds.forEach((id) => { c[sizeOf[id] ?? 'mediano'] += Math.max(1, num(qty[id] ?? '1') || 1); });
    return c;
  }, [selectedIds, sizeOf, qty]);

  const qtyFromStock = (p: Product) => (p.saleUnit === 'KG' ? 1 : Math.max(0, Math.floor(productStock(p))));
  const applyStockQty = () => {
    const q = { ...qty };
    const s = { ...selected };
    filtered.forEach((p) => {
      if (!s[p.id]) return;
      const n = qtyFromStock(p);
      if (n > 0) q[p.id] = String(n);
      else s[p.id] = false;
    });
    setQty(q);
    setSelected(s);
  };
  const toggleAll = (checked: boolean) => {
    const next = { ...selected };
    filtered.forEach((p) => { next[p.id] = checked; });
    setSelected(next);
  };
  const applySizeToAll = (size: LabelSize) => {
    const next = { ...sizeOf };
    filtered.forEach((p) => { next[p.id] = size; });
    setSizeOf(next);
  };

  // Precios de las listas tildadas (para la vista previa con un producto real).
  const toggleList = async (list: PriceList, checked: boolean) => {
    setListSel((prev) => ({ ...prev, [list.id]: checked }));
    if (!checked || listPrices[list.id]) return;
    try {
      const { data } = await api.get(`/price-lists/${list.id}`);
      const map: ListPrices = {};
      (data?.items ?? []).forEach((i: any) => { map[i.productId] = { price: i.price, pricePerKg: i.pricePerKg }; });
      setListPrices((prev) => ({ ...prev, [list.id]: map }));
    } catch { /* la vista previa muestra un precio de ejemplo */ }
  };
  const activeLists = priceLists.filter((pl) => listSel[pl.id]);

  // Producto de muestra para la vista previa.
  const sampleOptions = useMemo(() => {
    const sel = new Set(selectedIds);
    const list = barcodeProducts.filter((p) => sel.has(p.id));
    return (list.length > 0 ? list : barcodeProducts).slice(0, 300);
  }, [barcodeProducts, selectedIds]);
  const sample = useMemo<PreviewProduct>(() => {
    const p = sampleOptions.find((o) => o.id === sampleId) ?? sampleOptions[0];
    if (!p) {
      return {
        name: 'Producto de ejemplo',
        sku: '7790001234567',
        price: 1500,
        extraPrices: activeLists.map((l) => ({ listId: l.id, label: l.name, price: 1350 })),
      };
    }
    const isKg = p.saleUnit === 'KG';
    const price = isKg ? p.pricePerKg ?? 0 : p.price ?? 0;
    return {
      name: p.parent ? `${p.parent.name} ${p.variantLabel ?? ''}`.trim() : p.name,
      sku: p.sku ?? '',
      price,
      extraPrices: activeLists.flatMap((l) => {
        const map = listPrices[l.id];
        if (!map) return [{ listId: l.id, label: l.name, price }];
        const item = map[p.id];
        if (!item) return [];
        return [{ listId: l.id, label: l.name, price: isKg ? item.pricePerKg ?? item.price : item.price }];
      }),
    };
  }, [sampleOptions, sampleId, activeLists, listPrices]);

  // ---- edicion del diseno ----
  const design = designs[editSize];
  const updateDesign = (fn: (d: LabelDesign) => LabelDesign) => {
    setDesigns((prev) => ({ ...prev, [editSize]: fn(prev[editSize]) }));
  };
  const dirty = JSON.stringify(designs) !== JSON.stringify(savedDesigns);

  const moveElement = (key: LabelElementKey, dir: -1 | 1) => {
    updateDesign((d) => {
      const order = [...d.order];
      const i = order.indexOf(key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= order.length) return d;
      [order[i], order[j]] = [order[j], order[i]];
      return { ...d, order };
    });
  };
  const toggleShow = (key: LabelElementKey) => {
    updateDesign((d) => ({ ...d, [key]: { ...d[key], show: !d[key].show } }));
  };

  const saveDesign = async () => {
    setSavingDesign(true);
    try {
      const { data } = await api.put('/products/barcodes/design', { designs });
      const d = normalizeDesigns(data?.designs ?? designs);
      setDesigns(d);
      setSavedDesigns(d);
      toast.success('Diseño guardado');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo guardar el diseño');
    } finally {
      setSavingDesign(false);
    }
  };

  const resetSize = () => {
    setDesigns((prev) => ({ ...prev, [editSize]: DEFAULT_DESIGNS[editSize] }));
  };

  // Copia colores, negritas, alineaciones, orden y estilos de listas del
  // tamano que se edita a los otros dos (las medidas y letras se escalan).
  const copyStyleToOthers = () => {
    setDesigns((prev) => {
      const src = prev[editSize];
      const next = { ...prev };
      LABEL_SIZE_KEYS.filter((s) => s !== editSize).forEach((s) => {
        const k = prev[s].heightMm / src.heightMm;
        const scale = (n: number) => Math.max(4, Math.round(n * k * 2) / 2);
        const scaleText = <T extends LabelTextStyle>(t: T): T => ({ ...t, size: scale(t.size) });
        const listStyles: LabelDesign['listStyles'] = {};
        Object.entries(src.listStyles).forEach(([id, v]) => { listStyles[id] = { ...v, size: scale(v.size) }; });
        next[s] = {
          ...src,
          widthMm: prev[s].widthMm,
          heightMm: prev[s].heightMm,
          name: scaleText(src.name),
          sku: scaleText(src.sku),
          price: scaleText(src.price),
          extras: scaleText(src.extras),
          barcode: { ...src.barcode, heightMm: Math.max(3, Math.round(src.barcode.heightMm * k)) },
          listStyles,
        };
      });
      return next;
    });
    toast.success('Estilo copiado a los otros tamaños');
  };

  const download = async (type: 'pdf' | 'excel') => {
    if (selectedIds.length === 0) {
      toast.error('Seleccioná al menos un producto');
      return;
    }
    setDownloading(type);
    try {
      const body: Record<string, unknown> = { productIds: selectedIds };
      const priceListIds = activeLists.map((pl) => pl.id);
      if (priceListIds.length > 0) body.priceListIds = priceListIds;
      if (type === 'pdf') {
        const quantities: Record<string, number> = {};
        const sizes: Record<string, LabelSize> = {};
        selectedIds.forEach((id) => {
          const n = Math.max(1, num(qty[id] ?? '1') || 1);
          if (n !== 1) quantities[id] = n;
          const size = sizeOf[id] ?? 'mediano';
          if (size !== 'mediano') sizes[id] = size;
        });
        body.quantities = quantities;
        body.sizes = sizes;
        body.designs = designs;
      }
      const res = await api.post(`/products/barcodes/${type}`, body, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `etiquetas.${type === 'pdf' ? 'pdf' : 'xlsx'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err: any) {
      let message: string | undefined;
      const data = err?.response?.data;
      if (data instanceof Blob) {
        try { message = JSON.parse(await data.text())?.message; } catch { /* no era JSON */ }
      } else {
        message = data?.message;
      }
      toast.error(message ?? 'Error al generar el archivo');
    } finally {
      setDownloading(null);
    }
  };

  // ---- controles reutilizables ----
  const textControls = (style: Pick<LabelTextStyle, 'size' | 'bold' | 'color'> & { align?: LabelAlign }, onChange: (patch: Partial<LabelTextStyle>) => void) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text2)', minWidth: 62 }}>Tamaño</span>
        <button className="btn btn-secondary btn-xs" onClick={() => onChange({ size: Math.max(4, style.size - 0.5) })} aria-label="Achicar letra">A−</button>
        <input
          type="number" min={4} max={48} step={0.5}
          value={style.size}
          onChange={(e) => onChange({ size: Math.min(48, Math.max(4, num(e.target.value) || 4)) })}
          style={{ width: 64, textAlign: 'center' }}
          aria-label="Tamaño de letra en puntos"
        />
        <button className="btn btn-secondary btn-xs" onClick={() => onChange({ size: Math.min(48, style.size + 0.5) })} aria-label="Agrandar letra">A+</button>
        <button
          className={`btn btn-xs ${style.bold ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onChange({ bold: !style.bold })}
          aria-pressed={style.bold}
          title="Negrita"
        >
          <Bold size={12} />
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text2)', minWidth: 62 }}>Color</span>
        {SWATCHES.map((c) => (
          <button
            key={c}
            onClick={() => onChange({ color: c })}
            aria-label={`Color ${c}`}
            style={{
              width: 22, height: 22, borderRadius: 999, background: c, cursor: 'pointer', padding: 0,
              border: style.color === c ? '2px solid var(--accent)' : '2px solid var(--border2)',
              boxShadow: style.color === c ? '0 0 0 2px var(--surface) inset' : undefined,
            }}
          />
        ))}
        <input
          type="color"
          value={style.color}
          onChange={(e) => onChange({ color: e.target.value })}
          style={{ width: 30, height: 24, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
          title="Otro color"
        />
      </div>
      {style.align && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text2)', minWidth: 62 }}>Alineación</span>
          {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Icon]) => (
            <button
              key={a}
              className={`btn btn-xs ${style.align === a ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => onChange({ align: a })}
              aria-pressed={style.align === a}
              title={a === 'left' ? 'Izquierda' : a === 'center' ? 'Centro' : 'Derecha'}
            >
              <Icon size={12} />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const textPatch = (key: 'name' | 'sku' | 'price' | 'extras') => (patch: Partial<LabelTextStyle>) =>
    updateDesign((d) => ({ ...d, [key]: { ...d[key], ...patch } }));

  const elementEditor = () => {
    switch (editElement) {
      case 'name':
        return (
          <>
            {textControls(design.name, textPatch('name'))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text2)', minWidth: 62 }}>Renglones</span>
              {([1, 2] as const).map((n) => (
                <button
                  key={n}
                  className={`btn btn-xs ${design.name.maxLines === n ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => updateDesign((d) => ({ ...d, name: { ...d.name, maxLines: n } }))}
                >
                  {n === 1 ? '1 renglón' : 'Hasta 2'}
                </button>
              ))}
            </div>
          </>
        );
      case 'barcode':
        return (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
              Alto: {design.barcode.heightMm} mm
              <input
                type="range" min={3} max={Math.max(10, Math.round(design.heightMm - 2))} step={1}
                value={design.barcode.heightMm}
                onChange={(e) => updateDesign((d) => ({ ...d, barcode: { ...d.barcode, heightMm: num(e.target.value) } }))}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text2)' }}>
              Ancho: {design.barcode.widthPct}% de la etiqueta
              <input
                type="range" min={20} max={100} step={5}
                value={design.barcode.widthPct}
                onChange={(e) => updateDesign((d) => ({ ...d, barcode: { ...d.barcode, widthPct: num(e.target.value) } }))}
              />
            </label>
            <p style={{ fontSize: 11, color: 'var(--text3)', margin: 0 }}>
              Un código muy chico puede costarle al lector. Probá imprimir una hoja antes de hacer muchas.
            </p>
          </>
        );
      case 'sku':
        return textControls(design.sku, textPatch('sku'));
      case 'price':
        return (
          <>
            {textControls(design.price, textPatch('price'))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={design.price.decimals} onChange={(e) => updateDesign((d) => ({ ...d, price: { ...d.price, decimals: e.target.checked } }))} />
              Mostrar centavos ($1.500,00)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={design.price.showLabel} onChange={(e) => updateDesign((d) => ({ ...d, price: { ...d.price, showLabel: e.target.checked } }))} />
              Anteponer &quot;Precio:&quot;
            </label>
          </>
        );
      case 'extras':
        return (
          <>
            {priceLists.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>
                No hay otras listas de precios. Creá una (ej. &quot;Efectivo&quot;) en Productos → Listas de precios.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>Mostrar también el precio de:</span>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {priceLists.map((pl) => (
                    <label key={pl.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!listSel[pl.id]} onChange={(e) => toggleList(pl, e.target.checked)} />
                      {pl.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div style={smallLabel}>Estilo general</div>
            {textControls(design.extras, textPatch('extras'))}
            {activeLists.map((pl) => {
              const own = design.listStyles[pl.id];
              const style = own ?? { color: design.extras.color, size: design.extras.size, bold: design.extras.bold };
              return (
                <div key={pl.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ ...smallLabel, textTransform: 'none', fontSize: 12, color: 'var(--text)' }}>&quot;{pl.name}&quot; con estilo propio</span>
                    <input
                      type="checkbox"
                      checked={!!own}
                      onChange={(e) => updateDesign((d) => {
                        const listStyles = { ...d.listStyles };
                        if (e.target.checked) listStyles[pl.id] = { color: '#dc2626', size: d.extras.size, bold: d.extras.bold };
                        else delete listStyles[pl.id];
                        return { ...d, listStyles };
                      })}
                      aria-label={`Estilo propio para ${pl.name}`}
                    />
                  </div>
                  {own && textControls(style, (patch) => updateDesign((d) => ({
                    ...d,
                    listStyles: { ...d.listStyles, [pl.id]: { color: style.color, size: style.size, bold: style.bold, ...patch } as LabelDesign['listStyles'][string] },
                  })))}
                </div>
              );
            })}
          </>
        );
    }
  };

  return (
    <AppLayout
      title="Etiquetas"
      subtitle="Elegí los productos, diseñá la etiqueta y descargá el PDF para imprimir"
      actions={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href={`/${tenant}/productos`} className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
            <ArrowLeft size={13} /> Productos
          </a>
          <button onClick={() => download('excel')} disabled={!!downloading || selectedIds.length === 0} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
            {downloading === 'excel' ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <FileSpreadsheet size={13} />}
            Excel
          </button>
          <button onClick={() => download('pdf')} disabled={!!downloading || selectedIds.length === 0} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
            {downloading === 'pdf' ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Download size={13} />}
            PDF para imprimir
          </button>
        </div>
      }
    >
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 1. Tamanos */}
          <section style={sectionStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>1. Tamaños</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>Así queda cada tamaño (a escala real en pantalla). Tocá uno para editarlo.</div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
                <Eye size={13} /> Ver con:
                <select value={sampleId} onChange={(e) => setSampleId(e.target.value)} style={{ maxWidth: 240, fontSize: 12 }}>
                  {sampleOptions.length === 0 && <option value="">Producto de ejemplo</option>}
                  {sampleOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.parent ? `${p.parent.name} ${p.variantLabel ?? ''}` : p.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {LABEL_SIZE_KEYS.map((s) => (
                <button
                  key={s}
                  onClick={() => setEditSize(s)}
                  aria-pressed={editSize === s}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 12, cursor: 'pointer',
                    borderRadius: 10, background: editSize === s ? 'var(--accent-dim)' : 'var(--surface2)',
                    border: editSize === s ? '2px solid var(--accent)' : '2px solid transparent',
                    maxWidth: '100%', overflow: 'hidden',
                  }}
                >
                  <LabelPreview design={designs[s]} product={sample} zoom={1} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                    {SIZE_LABELS[s]} · {designs[s].widthMm}×{designs[s].heightMm} mm
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {countBySize[s] > 0 ? `${countBySize[s]} etiqueta${countBySize[s] === 1 ? '' : 's'} a imprimir` : 'Ninguna a imprimir'}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* 2. Editor */}
          <section style={sectionStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>2. Diseño de la etiqueta {SIZE_LABELS[editSize].toLowerCase()}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>Tocá un elemento en la etiqueta o en la lista para cambiarlo.</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={copyStyleToOthers} className="btn btn-ghost btn-xs" title="Copia colores, negritas, orden y estilos a los otros tamaños (las letras se escalan)">
                  Copiar estilo a los otros tamaños
                </button>
                <button onClick={resetSize} className="btn btn-ghost btn-xs" style={{ gap: 4 }}>
                  <RotateCcw size={12} /> Restablecer
                </button>
                <button onClick={saveDesign} disabled={!dirty || savingDesign} className="btn btn-primary btn-xs" style={{ gap: 4 }}>
                  {savingDesign ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Save size={12} />}
                  {dirty ? 'Guardar diseño' : 'Guardado'}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16, alignItems: 'start' }}>
              {/* Vista grande */}
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, display: 'flex', justifyContent: 'center', overflowX: 'auto', minHeight: 200, alignItems: 'center' }}>
                <LabelPreview
                  design={design}
                  product={sample}
                  zoom={design.widthMm > 70 ? 1.6 : 2}
                  selectedElement={editElement}
                  onSelectElement={setEditElement}
                />
              </div>

              {/* Controles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ ...smallLabel, marginBottom: 6 }}>Medidas</div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--text2)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Ancho
                      <input type="number" min={15} max={200} value={design.widthMm}
                        onChange={(e) => updateDesign((d) => ({ ...d, widthMm: Math.min(200, Math.max(15, num(e.target.value) || 15)) }))}
                        style={{ width: 60, textAlign: 'center' }} /> mm
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Alto
                      <input type="number" min={10} max={200} value={design.heightMm}
                        onChange={(e) => updateDesign((d) => ({ ...d, heightMm: Math.min(200, Math.max(10, num(e.target.value) || 10)) }))}
                        style={{ width: 60, textAlign: 'center' }} /> mm
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                      <input type="checkbox" checked={design.border} onChange={(e) => updateDesign((d) => ({ ...d, border: e.target.checked }))} />
                      Borde para cortar
                    </label>
                  </div>
                </div>

                <div>
                  <div style={{ ...smallLabel, marginBottom: 6 }}>Elementos (de arriba hacia abajo)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    {design.order.map((key, i) => {
                      const shown = design[key].show;
                      const active = editElement === key;
                      return (
                        <div
                          key={key}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
                            background: active ? 'var(--accent-dim)' : 'transparent',
                            borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                          }}
                        >
                          <button className="btn btn-ghost btn-xs" onClick={() => toggleShow(key)} title={shown ? 'Ocultar' : 'Mostrar'} aria-label={shown ? `Ocultar ${ELEMENT_LABELS[key]}` : `Mostrar ${ELEMENT_LABELS[key]}`}>
                            {shown ? <Eye size={13} /> : <EyeOff size={13} style={{ opacity: 0.5 }} />}
                          </button>
                          <button
                            onClick={() => setEditElement(key)}
                            style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: active ? 700 : 500, color: shown ? 'var(--text)' : 'var(--text3)', padding: '2px 0' }}
                          >
                            {ELEMENT_LABELS[key]}
                          </button>
                          <button className="btn btn-ghost btn-xs" onClick={() => moveElement(key, -1)} disabled={i === 0} aria-label="Subir"><ArrowUp size={12} /></button>
                          <button className="btn btn-ghost btn-xs" onClick={() => moveElement(key, 1)} disabled={i === design.order.length - 1} aria-label="Bajar"><ArrowDown size={12} /></button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{ELEMENT_LABELS[editElement]}</div>
                  {!design[editElement].show && (
                    <div style={{ fontSize: 12, color: 'var(--warn)' }}>
                      Está oculto. <button className="btn btn-ghost btn-xs" onClick={() => toggleShow(editElement)}>Mostrar</button>
                    </div>
                  )}
                  {elementEditor()}
                </div>
              </div>
            </div>
          </section>

          {/* 3. Productos */}
          <section style={sectionStyle}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>3. Productos</div>
            <p style={{ fontSize: 12, color: 'var(--text3)', margin: '2px 0 10px' }}>
              Elegí los productos, el tamaño y cuántas etiquetas querés de cada uno. Solo se listan los productos activos con SKU cargado.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o SKU..." style={{ flex: '1 1 200px' }} />
              <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} style={{ flex: '0 1 220px' }} title="Filtrar por proveedor">
                <option value="">Todos los proveedores</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value="none">Sin proveedor</option>
              </select>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ flex: '0 1 220px' }} title="Filtrar por categoría">
                <option value="">Todas las categorías</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="none">Sin categoría</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={filtered.length > 0 && filtered.every((p) => selected[p.id])} onChange={(e) => toggleAll(e.target.checked)} />
                Seleccionar todos
              </label>
              <span>· {selectedIds.length} seleccionados</span>
              <button onClick={applyStockQty} className="btn btn-secondary btn-xs" title="Pone como cantidad de etiquetas el stock actual de cada producto seleccionado">
                Cantidad = stock
              </button>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                Tamaño para todos:
                <select
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) applySizeToAll(e.target.value as LabelSize); e.target.value = ''; }}
                  style={{ fontSize: 11 }}
                >
                  <option value="" disabled>Elegir...</option>
                  {LABEL_SIZE_KEYS.map((s) => <option key={s} value={s}>{SIZE_LABELS[s]}</option>)}
                </select>
              </span>
            </div>
            <div style={{ maxHeight: 480, overflowY: 'auto', border: '1px solid var(--border2)', borderRadius: 6 }}>
              {filtered.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--text3)' }}>No hay productos con SKU que coincidan.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border2)' }}>
                        <td style={{ padding: '6px 8px', width: 28 }}>
                          <input type="checkbox" checked={!!selected[p.id]} onChange={(e) => setSelected((prev) => ({ ...prev, [p.id]: e.target.checked }))} aria-label={`Seleccionar ${p.name}`} />
                        </td>
                        <td style={{ padding: '6px 8px', fontSize: 12 }}>
                          <button
                            onClick={() => setSampleId(p.id)}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit' }}
                            title="Ver en la vista previa"
                          >
                            <div style={{ fontWeight: 600, color: 'var(--text)' }}>{p.parent ? p.parent.name : p.name}</div>
                            {p.parent && <div style={{ fontSize: 11, color: 'var(--text2)' }}>{p.variantLabel}</div>}
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                              {p.sku} · stock {p.saleUnit === 'KG' ? fmtKg(productStock(p)) : productStock(p)}
                            </div>
                          </button>
                        </td>
                        <td style={{ padding: '6px 8px', width: 130 }}>
                          <select
                            value={sizeOf[p.id] ?? 'mediano'}
                            disabled={!selected[p.id]}
                            onChange={(e) => setSizeOf((prev) => ({ ...prev, [p.id]: e.target.value as LabelSize }))}
                            style={{ width: '100%', fontSize: 11 }}
                            title="Tamaño de la etiqueta"
                          >
                            {LABEL_SIZE_KEYS.map((s) => <option key={s} value={s}>{SIZE_LABELS[s]}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '6px 8px', width: 90, textAlign: 'right' }}>
                          <input
                            type="number" min="1" step="1"
                            value={qty[p.id] ?? '1'}
                            disabled={!selected[p.id]}
                            onChange={(e) => setQty((prev) => ({ ...prev, [p.id]: e.target.value }))}
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
          </section>
        </div>
      )}
    </AppLayout>
  );
}
