/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import LabelPreview, { MM_PX, type PreviewProduct } from '@/components/labels/LabelPreview';
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
      (data?.content?.items ?? data?.items ?? []).forEach((i: any) => { map[i.productId] = { price: i.price, pricePerKg: i.pricePerKg }; });
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
  const sampleProduct = sampleOptions.find((o) => o.id === sampleId) ?? sampleOptions[0];
  const sampleMissingLists = sampleProduct
    ? activeLists.filter((l) => listPrices[l.id] && !listPrices[l.id][sampleProduct.id])
    : [];

  // Cuantos de los seleccionados tienen precio en cada lista tildada (los
  // que no, salen sin esa linea).
  const listCoverage = useMemo(() => {
    const out: Record<string, number> = {};
    activeLists.forEach((l) => {
      const map = listPrices[l.id];
      if (map) out[l.id] = selectedIds.filter((id) => map[id]).length;
    });
    return out;
  }, [activeLists, listPrices, selectedIds]);

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
        <button className="btn btn-secondary btn-xs lbl-tap" onClick={() => onChange({ size: Math.max(4, style.size - 0.5) })} aria-label="Achicar letra">A−</button>
        <input
          type="number" inputMode="decimal" min={4} max={48} step={0.5}
          value={style.size}
          onChange={(e) => onChange({ size: Math.min(48, Math.max(4, num(e.target.value) || 4)) })}
          style={{ width: 64, textAlign: 'center' }}
          aria-label="Tamaño de letra en puntos"
        />
        <button className="btn btn-secondary btn-xs lbl-tap" onClick={() => onChange({ size: Math.min(48, style.size + 0.5) })} aria-label="Agrandar letra">A+</button>
        <button
          className={`btn btn-xs lbl-tap ${style.bold ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onChange({ bold: !style.bold })}
          aria-pressed={style.bold}
          title="Negrita"
        >
          <Bold size={12} />
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span className="lbl-ctl-label" style={{ fontSize: 12, color: 'var(--text2)', minWidth: 62 }}>Color</span>
        {SWATCHES.map((c) => (
          <button
            key={c}
            className="lbl-swatch"
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
              className={`btn btn-xs lbl-tap ${style.align === a ? 'btn-primary' : 'btn-secondary'}`}
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
                  style={{ minHeight: 36 }}
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
                {activeLists.map((pl) => listCoverage[pl.id] !== undefined && listCoverage[pl.id] < selectedIds.length && (
                  <div key={pl.id} style={{ fontSize: 12, color: 'var(--warn)', lineHeight: 1.45 }}>
                    {listCoverage[pl.id] === 0
                      ? `Ninguno de los ${selectedIds.length} productos seleccionados tiene precio en "${pl.name}".`
                      : `${listCoverage[pl.id]} de ${selectedIds.length} productos seleccionados tienen precio en "${pl.name}"; los demás salen sin esa línea.`}
                  </div>
                ))}
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

  // Zoom de las vistas previas segun el ancho disponible: en celular la
  // etiqueta grande se achica para entrar entera, en PC se ve a 2x.
  const [sizesEl, setSizesEl] = useState<HTMLDivElement | null>(null);
  const [previewEl, setPreviewEl] = useState<HTMLDivElement | null>(null);
  const sizesW = useElementWidth(sizesEl);
  const previewW = useElementWidth(previewEl);
  const SIZE_CARD_PAD = 8;
  const SIZE_GAP = 8;
  const totalSizesPx = LABEL_SIZE_KEYS.reduce((acc, s) => acc + designs[s].widthMm * MM_PX, 0);
  const sizesZoom = sizesW > 0
    ? Math.min(1, (sizesW - SIZE_GAP * 2 - SIZE_CARD_PAD * 2 * 3 - 12) / totalSizesPx)
    : 1;
  const previewZoom = previewW > 0
    ? Math.max(0.3, Math.min(2, (previewW - 2) / (design.widthMm * MM_PX)))
    : 1.5;

  return (
    <AppLayout
      title="Etiquetas"
      subtitle="Elegí los productos, diseñá la etiqueta y descargá el PDF para imprimir"
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={`/${tenant}/productos`} className="btn btn-ghost btn-sm" style={{ gap: 6 }} aria-label="Volver a Productos">
            <ArrowLeft size={13} /> <span className="lbl-hide-sm">Productos</span>
          </a>
          <button onClick={() => download('excel')} disabled={!!downloading || selectedIds.length === 0} className="btn btn-secondary btn-sm" style={{ gap: 6 }} aria-label="Descargar Excel">
            {downloading === 'excel' ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <FileSpreadsheet size={13} />}
            <span className="lbl-hide-sm">Excel</span>
          </button>
          <button onClick={() => download('pdf')} disabled={!!downloading || selectedIds.length === 0} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
            {downloading === 'pdf' ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Download size={13} />}
            PDF<span className="lbl-hide-sm">para imprimir</span>
          </button>
        </div>
      }
    >
      <style>{`
        /* clip (no hidden): con hidden el body pasa a ser contenedor de
           scroll y la vista previa fija (sticky) no se queda arriba. Mismo
           arreglo que la tienda online (tienda.css). */
        html:has(.lbl-page), body:has(.lbl-page) { overflow-x: clip; }
        .lbl-section { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px; min-width: 0; }
        .lbl-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
        .lbl-sizes { display: flex; gap: ${SIZE_GAP}px; align-items: stretch; }
        .lbl-size-card { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 6px; padding: ${SIZE_CARD_PAD}px; cursor: pointer; border-radius: 10px; min-width: 0; }
        .lbl-editor { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
        .lbl-preview-wrap { background: linear-gradient(var(--surface2), var(--surface2)), var(--bg); border-radius: 10px; padding: 16px; position: sticky; top: calc(var(--app-header-height, 56px) + 12px); z-index: 5; }
        .lbl-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
        .lbl-filters input { flex: 1 1 200px; min-width: 0; }
        .lbl-filters select { flex: 0 1 220px; min-width: 0; }
        .lbl-row { display: grid; grid-template-columns: 32px minmax(0, 1fr) 130px 84px; grid-template-areas: "chk name size qty"; align-items: center; gap: 6px 8px; padding: 8px; border-bottom: 1px solid var(--border2); }
        .lbl-row:last-child { border-bottom: none; }
        .lbl-tap { display: inline-flex; align-items: center; justify-content: center; }
        @media (max-width: 767px) {
          .lbl-section { padding: 12px; border-radius: 12px; }
          .lbl-hide-sm { display: none; }
          .lbl-sample { flex: 1 1 100%; }
          .lbl-sample select { flex: 1; min-width: 0; max-width: none !important; }
          .lbl-size-card .lbl-size-mm { display: none; }
          .lbl-editor { grid-template-columns: minmax(0, 1fr); gap: 12px; }
          .lbl-preview-wrap { padding: 10px; top: var(--app-header-height, 56px); border-radius: 0 0 12px 12px; box-shadow: 0 6px 18px rgba(0,0,0,0.35); }
          .lbl-toolbar { width: 100%; }
          .lbl-toolbar > button { flex: 1 1 auto; justify-content: center; min-height: 36px; }
          .lbl-tap { min-width: 40px; min-height: 40px; }
          .lbl-swatch { width: 32px !important; height: 32px !important; }
          .lbl-ctl-label { flex-basis: 100%; }
          .lbl-filters input, .lbl-filters select { flex: 1 1 100%; }
          .lbl-bulk { width: 100%; justify-content: space-between; }
          .lbl-row { grid-template-columns: 32px minmax(0, 1fr) minmax(0, 1fr); grid-template-areas: "chk name name" ". size qty"; padding: 10px 8px; }
          .lbl-row select, .lbl-row input[type=number] { width: 100% !important; min-height: 40px; font-size: 16px !important; }
          .lbl-list { max-height: none !important; }
        }
      `}</style>
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>
      ) : (
        <div className="lbl-page" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {/* 1. Tamanos */}
          <section className="lbl-section">
            <div className="lbl-head">
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>1. Tamaños</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>Así queda cada tamaño. Tocá uno para editarlo.</div>
              </div>
              <label className="lbl-sample" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
                <Eye size={13} /> Ver con:
                <select value={sampleId} onChange={(e) => setSampleId(e.target.value)} style={{ maxWidth: 240 }}>
                  {sampleOptions.length === 0 && <option value="">Producto de ejemplo</option>}
                  {sampleOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.parent ? `${p.parent.name} ${p.variantLabel ?? ''}` : p.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="lbl-sizes" ref={setSizesEl}>
              {LABEL_SIZE_KEYS.map((s) => (
                <button
                  key={s}
                  className="lbl-size-card"
                  onClick={() => setEditSize(s)}
                  aria-pressed={editSize === s}
                  style={{
                    background: editSize === s ? 'var(--accent-dim)' : 'var(--surface2)',
                    border: editSize === s ? '2px solid var(--accent)' : '2px solid transparent',
                  }}
                >
                  <LabelPreview design={designs[s]} product={sample} zoom={sizesZoom} compact />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textAlign: 'center' }}>
                    {SIZE_LABELS[s]}<span className="lbl-size-mm"> · {designs[s].widthMm}×{designs[s].heightMm} mm</span>
                  </span>
                  <span style={{ fontSize: 11, color: countBySize[s] > 0 ? 'var(--accent)' : 'var(--text3)', fontWeight: countBySize[s] > 0 ? 700 : 400, textAlign: 'center' }}>
                    {countBySize[s] > 0 ? `${countBySize[s]} a imprimir` : 'Ninguna'}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* 2. Editor */}
          <section className="lbl-section">
            <div className="lbl-head">
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>2. Diseño · {SIZE_LABELS[editSize]} <span style={{ fontWeight: 500, color: 'var(--text3)', fontSize: 13 }}>{design.widthMm}×{design.heightMm} mm</span></div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>Tocá una parte de la etiqueta o de la lista para cambiarla.</div>
              </div>
              <div className="lbl-toolbar" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={copyStyleToOthers} className="btn btn-ghost btn-xs" title="Copia colores, negritas, orden y estilos a los otros tamaños (las letras se escalan)">
                  Copiar a otros tamaños
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

            <div className="lbl-editor">
              {/* Vista grande (queda fija arriba mientras se editan los controles) */}
              <div className="lbl-preview-wrap">
                <div ref={setPreviewEl} style={{ display: 'flex', justifyContent: 'center', minWidth: 0 }}>
                  <LabelPreview
                    design={design}
                    product={sample}
                    zoom={previewZoom}
                    selectedElement={editElement}
                    onSelectElement={setEditElement}
                  />
                </div>
                {sampleMissingLists.length > 0 && sampleProduct && (
                  <div role="status" style={{ marginTop: 10, fontSize: 12, lineHeight: 1.45, color: 'var(--warn)', background: 'rgba(243,156,18,0.12)', border: '1px solid rgba(243,156,18,0.3)', borderRadius: 8, padding: '8px 10px' }}>
                    <strong>{sampleProduct.parent ? sampleProduct.parent.name : sampleProduct.name}</strong> no tiene precio en {sampleMissingLists.map((l) => `"${l.name}"`).join(' ni en ')}, por eso esa línea no aparece.{' '}
                    <a href={`/${tenant}/productos/listas-de-precios`} style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 600 }}>Cargarlo en Listas de precios</a>
                  </div>
                )}
              </div>

              {/* Controles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{ELEMENT_LABELS[editElement]}</div>
                  {!design[editElement].show && (
                    <div style={{ fontSize: 12, color: 'var(--warn)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      Está oculto. <button className="btn btn-secondary btn-xs" onClick={() => toggleShow(editElement)}>Mostrar</button>
                    </div>
                  )}
                  {elementEditor()}
                </div>

                <div>
                  <div style={{ ...smallLabel, marginBottom: 6 }}>Partes de la etiqueta (de arriba hacia abajo)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    {design.order.map((key, i) => {
                      const shown = design[key].show;
                      const active = editElement === key;
                      return (
                        <div
                          key={key}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px',
                            background: active ? 'var(--accent-dim)' : 'transparent',
                            borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                          }}
                        >
                          <button className="btn btn-ghost btn-xs lbl-tap" onClick={() => toggleShow(key)} title={shown ? 'Ocultar' : 'Mostrar'} aria-label={shown ? `Ocultar ${ELEMENT_LABELS[key]}` : `Mostrar ${ELEMENT_LABELS[key]}`}>
                            {shown ? <Eye size={14} /> : <EyeOff size={14} style={{ opacity: 0.5 }} />}
                          </button>
                          <button
                            onClick={() => setEditElement(key)}
                            style={{ flex: 1, minWidth: 0, minHeight: 36, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: active ? 700 : 500, color: shown ? 'var(--text)' : 'var(--text3)', padding: '2px 0' }}
                          >
                            {ELEMENT_LABELS[key]}
                          </button>
                          <button className="btn btn-ghost btn-xs lbl-tap" onClick={() => moveElement(key, -1)} disabled={i === 0} aria-label={`Subir ${ELEMENT_LABELS[key]}`}><ArrowUp size={14} /></button>
                          <button className="btn btn-ghost btn-xs lbl-tap" onClick={() => moveElement(key, 1)} disabled={i === design.order.length - 1} aria-label={`Bajar ${ELEMENT_LABELS[key]}`}><ArrowDown size={14} /></button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ ...smallLabel, marginBottom: 6 }}>Medidas de la etiqueta</div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: 'var(--text2)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Ancho
                      <input type="number" inputMode="numeric" min={15} max={200} value={design.widthMm}
                        onChange={(e) => updateDesign((d) => ({ ...d, widthMm: Math.min(200, Math.max(15, num(e.target.value) || 15)) }))}
                        style={{ width: 64, textAlign: 'center' }} /> mm
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Alto
                      <input type="number" inputMode="numeric" min={10} max={200} value={design.heightMm}
                        onChange={(e) => updateDesign((d) => ({ ...d, heightMm: Math.min(200, Math.max(10, num(e.target.value) || 10)) }))}
                        style={{ width: 64, textAlign: 'center' }} /> mm
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', minHeight: 36 }}>
                      <input type="checkbox" checked={design.border} onChange={(e) => updateDesign((d) => ({ ...d, border: e.target.checked }))} />
                      Borde para cortar
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 3. Productos */}
          <section className="lbl-section">
            <div style={{ fontWeight: 800, fontSize: 15 }}>3. Productos</div>
            <p style={{ fontSize: 12, color: 'var(--text3)', margin: '2px 0 10px' }}>
              Elegí los productos, el tamaño y cuántas etiquetas querés de cada uno. Solo se listan los productos activos con SKU cargado.
            </p>
            <div className="lbl-filters">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o SKU..." />
              <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} title="Filtrar por proveedor">
                <option value="">Todos los proveedores</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value="none">Sin proveedor</option>
              </select>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} title="Filtrar por categoría">
                <option value="">Todas las categorías</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="none">Sin categoría</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', minHeight: 36 }}>
                <input type="checkbox" checked={filtered.length > 0 && filtered.every((p) => selected[p.id])} onChange={(e) => toggleAll(e.target.checked)} />
                Todos
              </label>
              <span>· {selectedIds.length} seleccionados</span>
              <button onClick={applyStockQty} className="btn btn-secondary btn-xs" style={{ minHeight: 32 }} title="Pone como cantidad de etiquetas el stock actual de cada producto seleccionado">
                Cantidad = stock
              </button>
              <span className="lbl-bulk" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                Tamaño para todos:
                <select
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) applySizeToAll(e.target.value as LabelSize); e.target.value = ''; }}
                >
                  <option value="" disabled>Elegir...</option>
                  {LABEL_SIZE_KEYS.map((s) => <option key={s} value={s}>{SIZE_LABELS[s]}</option>)}
                </select>
              </span>
            </div>
            <div className="lbl-list" style={{ maxHeight: 480, overflowY: 'auto', border: '1px solid var(--border2)', borderRadius: 8 }}>
              {filtered.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--text3)' }}>No hay productos con SKU que coincidan.</div>
              ) : (
                filtered.map((p) => (
                  <div key={p.id} className="lbl-row" style={{ opacity: selected[p.id] ? 1 : 0.6 }}>
                    <div style={{ gridArea: 'chk', display: 'flex', justifyContent: 'center' }}>
                      <input type="checkbox" checked={!!selected[p.id]} onChange={(e) => setSelected((prev) => ({ ...prev, [p.id]: e.target.checked }))} aria-label={`Seleccionar ${p.name}`} style={{ width: 18, height: 18 }} />
                    </div>
                    <button
                      onClick={() => setSampleId(p.id)}
                      style={{ gridArea: 'name', minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit', fontSize: 13 }}
                      title="Ver en la vista previa"
                    >
                      <div style={{ fontWeight: 600, color: 'var(--text)', overflowWrap: 'anywhere' }}>{p.parent ? p.parent.name : p.name}</div>
                      {p.parent && <div style={{ fontSize: 12, color: 'var(--text2)' }}>{p.variantLabel}</div>}
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', overflowWrap: 'anywhere' }}>
                        {p.sku} · stock {p.saleUnit === 'KG' ? fmtKg(productStock(p)) : productStock(p)}
                      </div>
                    </button>
                    <select
                      value={sizeOf[p.id] ?? 'mediano'}
                      disabled={!selected[p.id]}
                      onChange={(e) => setSizeOf((prev) => ({ ...prev, [p.id]: e.target.value as LabelSize }))}
                      style={{ gridArea: 'size', width: '100%', minWidth: 0 }}
                      aria-label="Tamaño de la etiqueta"
                    >
                      {LABEL_SIZE_KEYS.map((s) => <option key={s} value={s}>{SIZE_LABELS[s]}</option>)}
                    </select>
                    <input
                      type="number" inputMode="numeric" min="1" step="1"
                      value={qty[p.id] ?? '1'}
                      disabled={!selected[p.id]}
                      onChange={(e) => setQty((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      style={{ gridArea: 'qty', width: '100%', minWidth: 0, textAlign: 'center' }}
                      aria-label="Cantidad de etiquetas"
                    />
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </AppLayout>
  );
}

// Ancho de un elemento, actualizado al rotar el celular o achicar la ventana.
function useElementWidth(el: HTMLElement | null) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return width;
}
