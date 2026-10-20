/* eslint-disable @next/next/no-img-element */
'use client';

import { useMemo, useState } from 'react';
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

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(16,24,40,0.2)' }}
      >
        <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', background: '#F7F8FA', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {shownImage ? (
            <img src={shownImage} alt={chosen?.name ?? name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Package size={36} style={{ color: '#D0D5DD' }} />
          )}
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{ position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 16, border: 'none', background: 'rgba(255,255,255,0.9)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#172033' }}>{name}</div>
            {description && <div style={{ fontSize: 13, color: '#667085', marginTop: 4 }}>{description}</div>}
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--store-accent)', marginTop: 8 }}>
              {chosen
                ? `${money(chosen.price)}${unit}`
                : minPrice === maxPrice ? `${money(minPrice)}${unit}` : `Desde ${money(minPrice)}${unit}`}
            </div>
          </div>

          {options.map((o) => (
            <div key={o.name}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#344054', marginBottom: 6 }}>
                {o.name}{selected[o.name] ? `: ${selected[o.name]}` : ''}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {o.values.map((value) => {
                  const active = same(selected[o.name], value);
                  const enabled = valueEnabled(o.name, value);
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={!enabled && !active}
                      onClick={() => setSelected((prev) => (active ? { ...prev, [o.name]: '' } : { ...prev, [o.name]: value }))}
                      style={{
                        padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        border: `1px solid ${active ? 'var(--store-accent)' : '#D0D5DD'}`,
                        background: active ? 'var(--store-accent)' : '#fff',
                        color: active ? '#fff' : enabled ? '#344054' : '#98A2B3',
                        textDecoration: enabled || active ? 'none' : 'line-through',
                        cursor: enabled || active ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div style={{ fontSize: 12, color: chosen && !chosen.canSell ? '#F04438' : '#98A2B3' }}>
            {chosen ? (chosen.canSell ? chosen.stockLabel : 'Sin stock') : `Elegí ${options.map((o) => o.name.toLowerCase()).join(' y ')}`}
          </div>

          <button
            onClick={() => chosen && onAdd(chosen)}
            disabled={!chosen || !chosen.canSell}
            style={{
              width: '100%', padding: '11px 12px', borderRadius: 10, border: 'none',
              background: chosen?.canSell ? 'var(--store-accent)' : '#E4E7EC',
              color: chosen?.canSell ? '#fff' : '#98A2B3', fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              cursor: chosen?.canSell ? 'pointer' : 'not-allowed',
            }}
          >
            <Plus size={15} /> Agregar al carrito
          </button>
        </div>
      </div>
    </div>
  );
}
