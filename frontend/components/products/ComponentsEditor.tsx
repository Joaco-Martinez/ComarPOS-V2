'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, Search } from 'lucide-react';
import type { Product } from '@/types';
import { fmtKg, num, productStock } from '@/lib/helpers';

// Una línea de la receta de un producto COMPUESTO: qué producto base lleva
// y cuánto. Al vender el compuesto, el backend (sale.stock.ts) descuenta
// quantity × vendidos del stock de cada componente.
export interface ComponentRow {
  componentId: string;
  quantity: string;
}

interface Props {
  rows: ComponentRow[];
  onChange: (rows: ComponentRow[]) => void;
  /** Listado agrupado de productos (padres con sus variantes adentro). */
  products: Product[];
  /** Id del producto que se está editando (no puede ser componente de sí mismo). */
  selfId?: string | null;
}

const displayName = (p: Product) =>
  p.parent?.name && p.variantLabel ? `${p.parent.name} — ${p.variantLabel}` : p.name;

/** Productos que pueden ir como componente: simples o variantes activas, nunca padres ni compuestos. */
export const componentCandidates = (products: Product[], selfId?: string | null): Product[] =>
  products
    .flatMap((p) =>
      p.hasVariants
        ? (p.variants ?? []).map((v) => ({ ...v, parent: v.parent ?? { id: p.id, name: p.name } as any }))
        : [p]
    )
    .filter((p) => p.isActive !== false && !p.hasVariants && p.type !== 'COMPUESTO' && p.id !== selfId);

/** Payload para el backend ({ componentId, quantity | quantityKg }). */
export const componentsPayload = (rows: ComponentRow[], candidates: Product[]) =>
  rows
    .filter((r) => r.componentId && num(r.quantity) > 0)
    .map((r) => {
      const p = candidates.find((c) => c.id === r.componentId);
      return p?.saleUnit === 'KG'
        ? { componentId: r.componentId, quantityKg: num(r.quantity) }
        : { componentId: r.componentId, quantity: Math.round(num(r.quantity)) };
    });

export default function ComponentsEditor({ rows, onChange, products, selfId }: Props) {
  const [query, setQuery] = useState('');
  const candidates = useMemo(() => componentCandidates(products, selfId), [products, selfId]);
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const used = new Set(rows.map((r) => r.componentId));

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return candidates
      .filter((c) => !used.has(c.id))
      .filter((c) => displayName(c).toLowerCase().includes(q) || Boolean(c.sku?.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [query, candidates, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (p: Product) => {
    onChange([...rows, { componentId: p.id, quantity: '1' }]);
    setQuery('');
  };

  const setQty = (id: string, quantity: string) =>
    onChange(rows.map((r) => (r.componentId === id ? { ...r, quantity } : r)));

  const remove = (id: string) => onChange(rows.filter((r) => r.componentId !== id));

  // Cuántos compuestos se pueden armar con el stock actual (el mínimo entre componentes).
  const available = useMemo(() => {
    const limits = rows
      .map((r) => {
        const p = byId.get(r.componentId);
        const qty = num(r.quantity);
        if (!p || qty <= 0) return null;
        if (p.isService || p.unlimitedStock) return Infinity;
        return Math.floor(productStock(p) / qty);
      })
      .filter((v): v is number => v !== null);
    if (limits.length === 0) return null;
    return Math.max(0, Math.min(...limits));
  }, [rows, byId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar producto base por nombre o SKU…"
          style={{ paddingLeft: 30 }}
        />
        {results.length > 0 && (
          <div
            style={{
              position: 'absolute', zIndex: 20, left: 0, right: 0, top: 'calc(100% + 4px)',
              background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,.18)', maxHeight: 260, overflowY: 'auto',
            }}
          >
            {results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => add(p)}
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  padding: '8px 10px', background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--text)', fontSize: 13, textAlign: 'left',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <Plus size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName(p)}</span>
                  {p.sku && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{p.sku}</span>}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
                  {p.isService || p.unlimitedStock ? 'Sin límite' : p.saleUnit === 'KG' ? `${fmtKg(productStock(p))} kg` : `Stock ${productStock(p)}`}
                </span>
              </button>
            ))}
          </div>
        )}
        {query.trim() && results.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
            No hay productos base que coincidan (no se pueden usar productos compuestos ni inactivos).
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text3)', padding: 10, background: 'var(--surface2)', borderRadius: 8 }}>
          Todavía no agregaste componentes. Buscá los productos que lleva (ej. 1× Fernet + 2× Coca-Cola).
        </div>
      ) : (
        rows.map((r) => {
          const p = byId.get(r.componentId);
          const isKg = p?.saleUnit === 'KG';
          return (
            <div
              key={r.componentId}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface2)', borderRadius: 8 }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p ? displayName(p) : 'Producto no disponible'}
                </div>
                {p && (
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {p.isService || p.unlimitedStock
                      ? 'Sin control de stock'
                      : `Stock actual: ${isKg ? `${fmtKg(productStock(p))} kg` : productStock(p)}`}
                  </div>
                )}
              </div>
              <input
                type="number"
                min={isKg ? '0.001' : '1'}
                step={isKg ? 'any' : '1'}
                value={r.quantity}
                onChange={(e) => setQty(r.componentId, e.target.value)}
                style={{ width: 80 }}
                aria-label="Cantidad"
              />
              <span style={{ fontSize: 11, color: 'var(--text3)', width: 22 }}>{isKg ? 'kg' : 'u.'}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(r.componentId)} title="Quitar">
                <Trash2 size={14} />
              </button>
            </div>
          );
        })
      )}

      {available !== null && (
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
          Con el stock actual se pueden armar{' '}
          <b style={{ color: 'var(--text)' }}>{available === Infinity ? 'sin límite' : available}</b>. Al vender, se descuenta
          el stock de cada componente.
        </div>
      )}
    </div>
  );
}
