'use client';

import { useCallback, useEffect, useState } from 'react';

export type CartLine = {
  productId: string;
  name: string;
  imageUrl: string | null;
  price: number;
  saleUnit: string;
  quantity: number;
  quantityKg: number;
};

function storageKey(tenantSlug: string) {
  return `comarpos-tienda-cart-${tenantSlug}`;
}

function readCart(tenantSlug: string): CartLine[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(tenantSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCart(tenantSlug: string, cart: CartLine[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(tenantSlug), JSON.stringify(cart));
  } catch {
    // localStorage puede fallar (privado/bloqueado) - el carrito simplemente
    // no persiste entre recargas, no rompe la compra en curso.
  }
}

export function useCart(tenantSlug: string) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setCart(readCart(tenantSlug));
    setLoaded(true);
  }, [tenantSlug]);

  const persist = useCallback((next: CartLine[]) => {
    setCart(next);
    writeCart(tenantSlug, next);
  }, [tenantSlug]);

  const addItem = useCallback((item: { productId: string; name: string; imageUrl: string | null; price: number; saleUnit: string }, qty = 1) => {
    setCart((prev) => {
      const isKg = item.saleUnit === 'KG';
      const idx = prev.findIndex((l) => l.productId === item.productId);
      let next: CartLine[];
      if (idx >= 0) {
        next = [...prev];
        next[idx] = isKg
          ? { ...next[idx], quantityKg: next[idx].quantityKg + qty }
          : { ...next[idx], quantity: next[idx].quantity + qty };
      } else {
        next = [...prev, {
          productId: item.productId,
          name: item.name,
          imageUrl: item.imageUrl,
          price: item.price,
          saleUnit: item.saleUnit,
          quantity: isKg ? 0 : qty,
          quantityKg: isKg ? qty : 0,
        }];
      }
      writeCart(tenantSlug, next);
      return next;
    });
  }, [tenantSlug]);

  const updateQty = useCallback((productId: string, qty: number) => {
    setCart((prev) => {
      const next = prev
        .map((l) => (l.productId === productId ? { ...l, ...(l.saleUnit === 'KG' ? { quantityKg: qty } : { quantity: qty }) } : l))
        .filter((l) => (l.saleUnit === 'KG' ? l.quantityKg > 0 : l.quantity > 0));
      writeCart(tenantSlug, next);
      return next;
    });
  }, [tenantSlug]);

  const removeItem = useCallback((productId: string) => {
    setCart((prev) => {
      const next = prev.filter((l) => l.productId !== productId);
      writeCart(tenantSlug, next);
      return next;
    });
  }, [tenantSlug]);

  const clear = useCallback(() => {
    persist([]);
  }, [persist]);

  const itemCount = cart.reduce((acc, l) => acc + (l.saleUnit === 'KG' ? 1 : l.quantity), 0);
  const total = cart.reduce((acc, l) => acc + l.price * (l.saleUnit === 'KG' ? l.quantityKg : l.quantity), 0);

  return { cart, loaded, addItem, updateQty, removeItem, clear, itemCount, total };
}
