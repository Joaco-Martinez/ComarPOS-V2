/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Package, Plus, X } from 'lucide-react';

export type StoreVariant = {
  id: string;
  sku: string | null;
  name: string;
  variantLabel: string | null;
  attributes: Record<string, string>;
  imageUrl: string | null;
  price: number;
  stockLabel: string;
  canSell: boolean;
  maxQuantity?: number | null;
};

type Props = {
  name: string;
  description: string | null;
  imageUrl: string | null;
  saleUnit: string;
  options: { name: string; values: string[] }[];
  variants: StoreVariant[];
  money: (n: number) => string;
  onAdd: (variant: StoreVariant) => void;
  onClose: () => void;
};

const same = (a: unknown, b: unknown) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

// Detalle de un producto con variantes en la tienda: un selector por opción
// (Talle, Color...). Las combinaciones sin stock se ven deshabilitadas, la
// foto y el precio cambian según la variante elegida.
export default function VariantChooser({ name, description, imageUrl, saleUnit, options, variants, money, onAdd, onClose }: Props) {
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    // Si hay una sola variante vendible, arranca elegida.
    const sellable = variants.filter((v) => v.canSell);
    return sellable.length === 1 ? { ...sellable[0].attributes } : {};
  });

  const chosen = useMemo(
    () => (options.every((o) => selected[o.name])
      ? variants.find((v) => options.every((o) => same(v.attributes[o.name], selected[o.name]))) ?? null
      : null),
    [options, selected, variants]
  );

  // Un valor se puede elegir si existe alguna variante vendible con ese
  // valor y lo ya elegido en las otras opciones.
  const valueEnabled = (optionName: string, value: string) =>
    variants.some((v) =>
      v.canSell &&
      same(v.attributes[optionName], value) &&
      options.every((o) => o.name === optionName || !selected[o.name] || same(v.attributes[o.name], selected[o.name]))
    );

  const prices = variants.map((v) => v.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const unit = saleUnit === 'KG' ? '/kg' : '';
  const shownImage = chosen?.imageUrl || imageUrl;

  // Bloquea el scroll del fondo mientras la hoja está abierta y cierra con Esc.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return (
    <div className="t-sheet-overlay" onClick={onClose}>
      <div className="t-sheet" role="dialog" aria-modal="true" aria-label={name} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Cerrar" className="t-sheet-close">
          <X size={18} />
        </button>

        <div className="t-sheet-scroll">
          <div className="t-sheet-media">
            {shownImage ? (
              <img src={shownImage} alt={chosen?.name ?? name} />
            ) : (
              <Package size={40} style={{ color: '#D0D5DD' }} />
            )}
          </div>

          <div className="t-sheet-body">
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#172033', lineHeight: 1.25 }}>{name}</div>
              {description && <div style={{ fontSize: 14, color: '#667085', marginTop: 6, lineHeight: 1.5 }}>{description}</div>}
              <div style={{ fontSize: 22, fontWeight: 800, color: '#172033', marginTop: 10 }}>
                {chosen
                  ? `${money(chosen.price)}${unit}`
                  : minPrice === maxPrice ? `${money(minPrice)}${unit}` : `Desde ${money(minPrice)}${unit}`}
              </div>
            </div>

            {options.map((o) => (
              <div key={o.name}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#344054', marginBottom: 8 }}>
                  {o.name}{selected[o.name] ? <span style={{ fontWeight: 500, color: '#667085' }}>: {selected[o.name]}</span> : ''}
                </div>
                <div className="t-opt-values">
                  {o.values.map((value) => {
                    const active = same(selected[o.name], value);
                    const enabled = valueEnabled(o.name, value);
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={!enabled && !active}
                        aria-pressed={active}
                        onClick={() => setSelected((prev) => (active ? { ...prev, [o.name]: '' } : { ...prev, [o.name]: value }))}
                        className={`t-opt${active ? ' is-active' : ''}`}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div style={{ fontSize: 13, color: chosen && !chosen.canSell ? '#F04438' : '#667085' }}>
              {chosen ? (chosen.canSell ? chosen.stockLabel : 'Sin stock') : `Elegí ${options.map((o) => o.name.toLowerCase()).join(' y ')}`}
            </div>
          </div>
        </div>

        <div className="t-sheet-footer">
          <button
            onClick={() => chosen && onAdd(chosen)}
            disabled={!chosen || !chosen.canSell}
            className="t-btn"
          >
            <Plus size={17} /> Agregar al carrito
          </button>
        </div>
      </div>
    </div>
  );
}
