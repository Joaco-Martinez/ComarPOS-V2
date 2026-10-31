/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { useStore } from '../StoreContext';
import { useCartContext } from '../CartContext';
import { ShoppingCart, Minus, Plus, Trash2, ArrowRight, ArrowLeft, Package } from 'lucide-react';

const money = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0);

export default function TiendaCarritoPage() {
  const { tenantSlug } = useStore();
  const { cart, updateQty, removeItem, total } = useCartContext();

  if (cart.length === 0) {
    return (
      <div className="t-empty">
        <ShoppingCart size={40} />
        <span style={{ fontSize: 15, fontWeight: 700, color: '#344054' }}>Tu carrito está vacío</span>
        <span style={{ fontSize: 13 }}>Agregá productos del catálogo para hacer tu pedido.</span>
        <Link href={`/tienda/${tenantSlug}/productos`} className="t-btn" style={{ width: 'auto', marginTop: 8, paddingInline: 24 }}>
          Ver productos
        </Link>
      </div>
    );
  }

  return (
    <div className="t-narrow">
      <div className="t-section-head">
        <h2 className="t-h2">Tu carrito</h2>
        <Link href={`/tienda/${tenantSlug}/productos`} className="t-link">
          <ArrowLeft size={14} /> Seguir comprando
        </Link>
      </div>

      <div className="t-lines">
        {cart.map((line) => {
          const qty = line.saleUnit === 'KG' ? line.quantityKg : line.quantity;
          const max = line.maxQty ?? null;
          const atMax = max !== null && qty >= max;
          return (
            <div key={line.productId} className="t-line">
              <div className="t-line-img">
                {line.imageUrl ? (
                  <img src={line.imageUrl} alt={line.name} />
                ) : (
                  <Package size={20} style={{ color: '#D0D5DD' }} />
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="t-line-name">{line.name}</div>
                <div className="t-line-unit">{money(line.price)}{line.saleUnit === 'KG' ? ' /kg' : ' c/u'}</div>
                {line.saleUnit === 'KG' ? (
                  <label className="t-qty-kg">
                    <input
                      type="number" min="0.1" step="0.1" inputMode="decimal"
                      max={max ?? undefined}
                      value={line.quantityKg}
                      onChange={(e) => updateQty(line.productId, Number(e.target.value))}
                      aria-label="Cantidad en kg"
                    />
                    kg
                  </label>
                ) : (
                  <div className="t-qty">
                    <button onClick={() => updateQty(line.productId, line.quantity - 1)} aria-label="Restar uno">
                      <Minus size={15} />
                    </button>
                    <span>{line.quantity}</span>
                    <button
                      onClick={() => updateQty(line.productId, line.quantity + 1)}
                      disabled={atMax}
                      aria-label="Sumar uno"
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                )}
                {atMax && (
                  <div className="t-line-max">
                    {line.saleUnit === 'KG' ? `Máximo disponible: ${max} kg` : `Máximo disponible: ${max}`}
                  </div>
                )}
              </div>
              <div className="t-line-right">
                <button onClick={() => removeItem(line.productId)} className="t-trash" aria-label={`Quitar ${line.name}`}>
                  <Trash2 size={17} />
                </button>
                <div className="t-line-total">{money(line.price * qty)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="t-sticky-cta">
        <div className="t-total-row" style={{ marginBottom: 12 }}>
          <span className="label">Total</span>
          <span className="value">{money(total)}</span>
        </div>
        <Link href={`/tienda/${tenantSlug}/checkout`} className="t-btn">
          Continuar con la compra <ArrowRight size={17} />
        </Link>
      </div>
    </div>
  );
}
