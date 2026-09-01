/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { useStore } from '../StoreContext';
import { useCartContext } from '../CartContext';
import { ShoppingCart, Minus, Plus, Trash2, ArrowRight, Package } from 'lucide-react';

const money = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0);

export default function TiendaCarritoPage() {
  const { tenantSlug } = useStore();
  const { cart, updateQty, removeItem, total } = useCartContext();

  if (cart.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '60px 0', color: '#98A2B3' }}>
        <ShoppingCart size={36} />
        <span style={{ fontSize: 14 }}>Tu carrito está vacío</span>
        <Link
          href={`/tienda/${tenantSlug}/productos`}
          style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: 'var(--store-accent)', textDecoration: 'none' }}
        >
          Ver productos
        </Link>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 8, maxWidth: 560 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: '#172033', marginBottom: 16 }}>Tu carrito</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {cart.map((line) => {
          const qty = line.saleUnit === 'KG' ? line.quantityKg : line.quantity;
          return (
            <div key={line.productId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, border: '1px solid #E4E7EC', borderRadius: 10, background: '#fff' }}>
              <div style={{ width: 52, height: 52, borderRadius: 8, background: '#F7F8FA', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                {line.imageUrl ? (
                  <img src={line.imageUrl} alt={line.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Package size={18} style={{ color: '#D0D5DD' }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#172033', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.name}</div>
                <div style={{ fontSize: 12, color: '#98A2B3' }}>{money(line.price)}{line.saleUnit === 'KG' ? '/kg' : ''}</div>
              </div>
              {line.saleUnit === 'KG' ? (
                <input
                  type="number" min="0.1" step="0.1"
                  value={line.quantityKg}
                  onChange={(e) => updateQty(line.productId, Number(e.target.value))}
                  style={{ width: 60, padding: '5px 6px', borderRadius: 6, border: '1px solid #D0D5DD', fontSize: 12, textAlign: 'center' }}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => updateQty(line.productId, line.quantity - 1)} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #D0D5DD', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <Minus size={12} />
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 700, minWidth: 18, textAlign: 'center' }}>{line.quantity}</span>
                  <button onClick={() => updateQty(line.productId, line.quantity + 1)} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #D0D5DD', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <Plus size={12} />
                  </button>
                </div>
              )}
              <div style={{ fontSize: 13, fontWeight: 800, color: '#172033', width: 70, textAlign: 'right' }}>
                {money(line.price * qty)}
              </div>
              <button onClick={() => removeItem(line.productId)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#98A2B3', padding: 4 }}>
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, paddingTop: 16, borderTop: '1px solid #E4E7EC' }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: '#172033' }}>Total</span>
        <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--store-accent)' }}>{money(total)}</span>
      </div>

      <Link
        href={`/tienda/${tenantSlug}/checkout`}
        style={{
          marginTop: 16, width: '100%', padding: '12px 16px', borderRadius: 10, background: 'var(--store-accent)',
          color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none', display: 'flex',
          alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        Continuar con la compra <ArrowRight size={15} />
      </Link>
    </div>
  );
}
