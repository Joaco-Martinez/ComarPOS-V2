/* eslint-disable @next/next/no-img-element */
'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Package, X } from 'lucide-react';
import type { Product } from '@/types';
import { fmtKg, fmtMoney } from '@/lib/helpers';
import { listPrice, productImage, sortedVariants, stockAt } from '@/lib/variants';

interface Props {
  parent: Product;
  /** Sucursal de la venta: el stock mostrado es el de ahí. */
  locationId?: string | null;
  /** Ubicaciones de stock de respaldo (Configuracion > Stock): su stock tambien cuenta como disponible. */
  extraLocationIds?: string[];
  /** Precio a mostrar por variante (ej. con la lista de precios aplicada). */
  priceOf?: (variant: Product) => number;
  /** false: no se bloquean las variantes sin stock (ej. cotizaciones). */
  requireStock?: boolean;
  title?: string;
  onPick: (variant: Product) => void;
  onClose: () => void;
}

const sameValue = (a: unknown, b: unknown) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

// Selector de variante para vender/cotizar/cambiar: chips por opción (Talle,
// Color...) que filtran una grilla con todas las variantes, su precio y el
// stock en la sucursal. Las variantes sin stock quedan deshabilitadas salvo
// que el producto sea "sin límite" o servicio (o requireStock=false).
export default function VariantPicker({ parent, locationId, extraLocationIds = [], priceOf = listPrice, requireStock = true, title, onPick, onClose }: Props) {
  const options = parent.variantOptions ?? [];
  const variants = useMemo(() => sortedVariants(parent).filter((v) => v.isActive !== false), [parent]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const isKg = parent.saleUnit === 'KG';

  const stockOf = (v: Product) => extraLocationIds.reduce((acc, id) => acc + stockAt(v, id), stockAt(v, locationId));
  const hasStock = (v: Product) => !requireStock || v.isService || v.unlimitedStock || stockOf(v) > 0;

  const matching = variants.filter((v) =>
    options.every((o) => !selected[o.name] || sameValue(v.variantAttributes?.[o.name], selected[o.name]))
  );

  // Un valor está disponible si alguna variante con ese valor (y lo demás
  // ya elegido) tiene stock.
  const valueAvailable = (optionName: string, value: string) =>
    variants.some((v) =>
      sameValue(v.variantAttributes?.[optionName], value) &&
      options.every((o) => o.name === optionName || !selected[o.name] || sameValue(v.variantAttributes?.[o.name], selected[o.name])) &&
      hasStock(v)
    );

  const toggle = (optionName: string, value: string) =>
    setSelected((prev) => (sameValue(prev[optionName], value) ? { ...prev, [optionName]: '' } : { ...prev, [optionName]: value }));

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="modal modal-lg modal-mobile-full" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {productImage(parent) ? (
              <img src={productImage(parent)!} alt={parent.name} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />
            ) : null}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{title ?? 'Elegí la variante'}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>{parent.name}</div>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-xs"><X size={14} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {options.length > 1 && options.map((o) => (
            <div key={o.name}>
              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{o.name}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {o.values.map((value) => {
                  const active = sameValue(selected[o.name], value);
                  const available = valueAvailable(o.name, value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => toggle(o.name, value)}
                      className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ opacity: available || active ? 1 : 0.45, textDecoration: available ? 'none' : 'line-through' }}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
            {matching.map((v) => {
              const stock = stockOf(v);
              const enabled = hasStock(v);
              const img = productImage(v);
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={!enabled}
                  onClick={() => onPick(v)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch', textAlign: 'left',
                    padding: 8, borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--surface)',
                    cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.45,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {img ? (
                      <img src={img} alt={v.name} style={{ width: 28, height: 28, borderRadius: 5, objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 28, height: 28, borderRadius: 5, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Package size={12} style={{ color: 'var(--text3)' }} />
                      </div>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{v.variantLabel ?? v.name}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                    {fmtMoney(priceOf(v))}{isKg ? '/kg' : ''}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: stock > 0 || v.unlimitedStock ? 'var(--text3)' : 'var(--danger)' }}>
                    {v.isService ? 'Servicio' : v.unlimitedStock ? 'Sin límite' : stock > 0 ? `Stock: ${isKg ? `${fmtKg(stock)}kg` : stock}` : 'Sin stock'}
                  </span>
                  {v.sku && <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{v.sku}</span>}
                </button>
              );
            })}
            {matching.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text3)', gridColumn: '1/-1' }}>No hay variantes con esa combinación.</div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
