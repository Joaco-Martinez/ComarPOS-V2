/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, LayoutGrid, List, Package, Search, X } from 'lucide-react';
import type { Product, ProductCategory } from '@/types';
import { categoryName, fmtKg, fmtMoney, num, skuKey } from '@/lib/helpers';
import { groupByParent, stockAt } from '@/lib/variants';

const PAGE_SIZE = 60;

interface Props {
  products: Product[];
  categories: ProductCategory[];
  /** Sucursal cuyo stock se muestra en cada tarjeta. */
  stockLocationId?: string | null;
  /** Precio a mostrar (ej. con la lista de precios aplicada). */
  priceOf: (p: Product) => number;
  /** Se llama con un producto simple/variante, o con el padre si tiene variantes. */
  onPick: (p: Product) => void;
  /** false: los productos sin stock se pueden elegir igual (ej. cotizaciones). */
  requireStock?: boolean;
  /** Clave de localStorage para recordar grilla/lista por pantalla. */
  viewModeKey?: string;
}

// Buscador de productos con el mismo formato que el POS: búsqueda por nombre
// o SKU (Enter con un SKU exacto lo agrega directo), chips de categorías y
// grilla con imágenes o lista compacta, mostrando precio y stock.
export default function ProductBrowser({
  products,
  categories,
  stockLocationId,
  priceOf,
  onPick,
  requireStock = true,
  viewModeKey = 'comarpos:browser:viewMode',
}: Props) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(viewModeKey);
      if (stored === 'grid' || stored === 'list') setViewMode(stored);
    } catch { /* sin storage */ }
  }, [viewModeKey]);

  const toggleViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    try { localStorage.setItem(viewModeKey, mode); } catch { /* sin storage */ }
  };

  const filtered = useMemo(() => {
    let p = products.filter((x) => x.isActive !== false);
    if (catFilter) p = p.filter((x) => x.categoryId === catFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      p = p.filter((x) => x.name.toLowerCase().includes(q) || x.sku?.toLowerCase().includes(q));
    }
    return groupByParent(p);
  }, [products, catFilter, search]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search, catFilter]);

  const visibleProducts = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const locationIds = stockLocationId ? [stockLocationId] : [];

  const productStock = (p: Product): number => {
    if (p.hasVariants) return (p.variants ?? []).reduce((acc, v) => acc + stockAt(v, stockLocationId), 0);
    if (p.type === 'COMPUESTO') {
      const components = p.components ?? [];
      if (components.length === 0) return 0;
      return Math.max(0, Math.min(...components.map((c) => {
        const rows = (c.component?.stock ?? []).filter((s) => locationIds.includes(s.businessLocationId));
        const units = rows.reduce((acc, s) => acc + num(s.quantity), 0);
        const kg = rows.reduce((acc, s) => acc + num(s.quantityKg), 0);
        if (num(c.quantity) > 0) return Math.floor(units / num(c.quantity));
        if (num(c.quantityKg) > 0) return Math.floor(kg / num(c.quantityKg));
        return 0;
      })));
    }
    return (p.stock ?? [])
      .filter((s) => locationIds.includes(s.businessLocationId))
      .reduce((acc, s) => acc + num(p.saleUnit === 'KG' ? s.quantityKg : s.quantity), 0);
  };

  const info = (p: Product) => {
    const stock = productStock(p);
    const stockRow = p.stock?.find((s) => s.businessLocationId === stockLocationId);
    const minStock = num(p.saleUnit === 'KG' ? stockRow?.minQuantityKg : stockRow?.minQuantity);
    const lowStock = stock <= minStock && minStock > 0 && !p.unlimitedStock;
    const noStock = stock <= 0 && !p.isService && !p.unlimitedStock;
    const prices = p.hasVariants ? (p.variants ?? []).map((v) => priceOf(v)) : [];
    const price = p.hasVariants ? (prices.length ? Math.min(...prices) : 0) : priceOf(p);
    const prefix = p.hasVariants && prices.length && Math.max(...prices) !== price ? 'desde ' : '';
    const label = p.isService
      ? 'Servicio'
      : p.unlimitedStock
        ? 'Sin límite'
        : noStock
          ? 'Sin stock'
          : `Stock: ${p.saleUnit === 'KG' ? `${fmtKg(stock)}kg` : stock}`;
    return { lowStock, noStock, price, prefix, label, disabled: requireStock && noStock };
  };

  const pick = (p: Product) => {
    onPick(p);
    if (search) {
      setSearch('');
      searchRef.current?.focus();
    }
  };

  // Enter con un SKU exacto (lector de código de barras o tipeado): lo agrega
  // directo, sin tener que clickear la tarjeta.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const q = search.trim();
    if (!q) return;
    e.preventDefault();
    const exact = products.find((p) => p.sku && skuKey(p.sku) === skuKey(q));
    const parent = exact ? null : groupByParent(products).find((g) => g.hasVariants && g.sku && skuKey(g.sku) === skuKey(q));
    const target = exact ?? parent ?? (filtered.length === 1 ? filtered[0] : null);
    if (target) pick(target);
  };

  const stockColor = (lowStock: boolean, noStock: boolean) =>
    noStock ? 'var(--danger)' : lowStock ? 'var(--warn)' : 'var(--text3)';

  return (
    <div className="pos-products">
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar producto por nombre o SKU..."
            style={{ paddingLeft: 34, paddingRight: search ? 34 : 12 }}
            autoFocus
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 2 }}>
              <X size={14} />
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexShrink: 0, border: '1px solid var(--border2)', borderRadius: 8, overflow: 'hidden' }}>
          <button
            onClick={() => toggleViewMode('grid')}
            title="Vista de grilla con imágenes"
            className={`btn btn-xs ${viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 0, padding: '9px 8px' }}
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => toggleViewMode('list')}
            title="Vista de tabla"
            className={`btn btn-xs ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 0, padding: '9px 8px' }}
          >
            <List size={14} />
          </button>
        </div>
      </div>

      {categories.length > 0 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0, paddingBottom: 2 }}>
          <button
            onClick={() => setCatFilter('')}
            className={`btn btn-sm category-chip ${catFilter === '' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Todos
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCatFilter(catFilter === c.id ? '' : c.id)}
              className={`btn btn-sm category-chip ${catFilter === c.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ whiteSpace: 'nowrap' }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div
        className={viewMode === 'grid' ? 'pos-products-grid' : 'pos-products-list'}
        style={
          viewMode === 'grid'
            ? { gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, alignContent: 'start' }
            : { display: 'flex', flexDirection: 'column', gap: 4 }
        }
      >
        {filtered.length === 0 ? (
          <div className="empty-state" style={viewMode === 'grid' ? { gridColumn: '1/-1' } : undefined}>
            <Package size={32} />
            <p>Sin resultados</p>
          </div>
        ) : viewMode === 'list' ? (
          visibleProducts.map((p) => {
            const { lowStock, noStock, price, prefix, label, disabled } = info(p);
            return (
              <button
                key={p.id}
                onClick={() => pick(p)}
                disabled={disabled}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                  background: 'var(--surface)',
                  border: `1px solid ${lowStock ? 'rgba(243,156,18,0.3)' : 'var(--border)'}`,
                  borderRadius: 6, padding: '8px 10px',
                  opacity: disabled ? 0.5 : 1,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                    {p.hasVariants && <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}> · {p.variants?.length} variantes</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <span style={{ fontSize: 10, color: stockColor(lowStock, noStock), fontFamily: 'var(--mono)' }}>
                      {(lowStock || noStock) && <AlertTriangle size={9} style={{ display: 'inline', marginRight: 2 }} />}
                      {label}
                    </span>
                    {p.sku && <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{p.sku}</span>}
                    {categoryName(p) !== 'Sin categoría' && (
                      <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {categoryName(p)}
                      </span>
                    )}
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--text)', flexShrink: 0 }}>
                  {prefix}{fmtMoney(price)}{p.saleUnit === 'KG' ? '/kg' : ''}
                </span>
              </button>
            );
          })
        ) : (
          visibleProducts.map((p) => {
            const { lowStock, noStock, price, prefix, label, disabled } = info(p);
            return (
              <div
                key={p.id}
                onClick={() => !disabled && pick(p)}
                style={{
                  background: 'var(--surface)',
                  border: `1px solid ${lowStock ? 'rgba(243,156,18,0.3)' : 'var(--border)'}`,
                  borderRadius: 'var(--m-radius, 8px)', padding: '10px 10px 8px',
                  boxShadow: 'var(--m-shadow, none)',
                  opacity: disabled ? 0.5 : 1,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                }}
              >
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.name} loading="lazy" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 5, marginBottom: 6 }} />
                ) : (
                  <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 5, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                    <Package size={18} style={{ color: 'var(--text3)', opacity: 0.4 }} />
                  </div>
                )}
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, marginBottom: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', minHeight: 30 }}>
                  {p.name}
                </div>
                {p.hasVariants && (
                  <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: -2, marginBottom: 4 }}>
                    {p.variants?.length} variantes · {(p.variantOptions ?? []).map((o) => o.name).join(' / ')}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: stockColor(lowStock, noStock), fontFamily: 'var(--mono)', flexShrink: 0 }}>
                    {(lowStock || noStock) && <AlertTriangle size={9} style={{ display: 'inline', marginRight: 2 }} />}
                    {label}
                  </span>
                  {categoryName(p) !== 'Sin categoría' && (
                    <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {categoryName(p)}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  className="btn btn-secondary pos-price-btn"
                  style={{ width: '100%', flexDirection: 'column', gap: 0, padding: '6px 4px', height: 'auto', cursor: disabled ? 'not-allowed' : 'pointer' }}
                  title={p.hasVariants ? 'Elegir variante' : 'Agregar'}
                >
                  <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                    {prefix}{fmtMoney(price)}{p.saleUnit === 'KG' ? '/kg' : ''}
                  </span>
                </button>
              </div>
            );
          })
        )}
      </div>
      {visibleProducts.length < filtered.length && (
        <button
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="btn btn-secondary btn-sm"
          style={{ flexShrink: 0, alignSelf: 'center' }}
        >
          Ver más productos · {filtered.length - visibleProducts.length} restantes
        </button>
      )}
    </div>
  );
}
