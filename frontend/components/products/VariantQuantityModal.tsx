'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Product } from '@/types';
import { fmtKg, num } from '@/lib/helpers';
import { sortedVariants, stockAt } from '@/lib/variants';

export interface VariantQuantityLine {
  variant: Product;
  quantity: number;
}

interface Props {
  parent: Product;
  title?: string;
  /** Sucursal para mostrar el stock actual de cada variante (opcional). */
  locationId?: string | null;
  confirmLabel?: string;
  onConfirm: (lines: VariantQuantityLine[]) => void;
  onClose: () => void;
}

// Grilla para cargar cantidades de varias variantes de una (10 M, 5 L,
// 8 XL): genera una línea por variante con cantidad > 0. Con dos opciones
// (ej. Talle × Color) se muestra como matriz; si no, como lista.
export default function VariantQuantityModal({ parent, title, locationId, confirmLabel = 'Agregar', onConfirm, onClose }: Props) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const variants = useMemo(() => sortedVariants(parent).filter((v) => v.isActive !== false), [parent]);
  const options = parent.variantOptions ?? [];
  const isKg = parent.saleUnit === 'KG';

  const lines = variants
    .map((variant) => ({ variant, quantity: num(qty[variant.id] ?? '') }))
    .filter((l) => l.quantity > 0);

  const findVariant = (a: string, b: string) =>
    variants.find(
      (v) =>
        String(v.variantAttributes?.[options[0].name] ?? '').toLowerCase() === a.toLowerCase() &&
        String(v.variantAttributes?.[options[1].name] ?? '').toLowerCase() === b.toLowerCase()
    );

  const input = (v: Product) => (
    <input
      type="number" min="0" step={isKg ? 'any' : '1'}
      value={qty[v.id] ?? ''}
      onChange={(e) => setQty((prev) => ({ ...prev, [v.id]: e.target.value }))}
      placeholder="0"
      style={{ width: '100%', minWidth: 56, textAlign: 'center', fontSize: 12 }}
    />
  );

  const stockHint = (v: Product) => {
    if (v.isService || v.unlimitedStock) return null;
    const s = stockAt(v, locationId ?? null);
    return <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', textAlign: 'center' }}>stock {isKg ? fmtKg(s) : s}</div>;
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="modal modal-lg modal-mobile-full" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{title ?? 'Cantidades por variante'}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{parent.name}</div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-xs"><X size={14} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {variants.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Este producto no tiene variantes activas.</div>
          ) : options.length === 2 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'left', padding: 4 }}>{options[0].name} × {options[1].name}</th>
                    {options[1].values.map((b) => <th key={b} style={{ fontSize: 11, padding: 4 }}>{b}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {options[0].values.map((a) => (
                    <tr key={a}>
                      <td style={{ fontSize: 12, fontWeight: 700, padding: 4 }}>{a}</td>
                      {options[1].values.map((b) => {
                        const v = findVariant(a, b);
                        return (
                          <td key={b} style={{ padding: 4, minWidth: 70 }}>
                            {v && v.isActive !== false ? <>{input(v)}{stockHint(v)}</> : <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>—</div>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
              {variants.map((v) => (
                <div key={v.id} style={{ border: '1px solid var(--border2)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{v.variantLabel ?? v.name}</div>
                  {input(v)}
                  {stockHint(v)}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <span style={{ fontSize: 12, color: 'var(--text3)', marginRight: 'auto' }}>
            {lines.length} variante{lines.length === 1 ? '' : 's'} · {isKg ? fmtKg(lines.reduce((a, l) => a + l.quantity, 0)) + ' kg' : `${lines.reduce((a, l) => a + l.quantity, 0)} u.`}
          </span>
          <button onClick={onClose} className="btn btn-secondary btn-sm">Cancelar</button>
          <button onClick={() => onConfirm(lines)} disabled={lines.length === 0} className="btn btn-primary btn-sm">{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
