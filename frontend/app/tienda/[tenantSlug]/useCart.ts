'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type CartLine = {
  productId: string;
  name: string;
  imageUrl: string | null;
  price: number;
  saleUnit: string;
  quantity: number;
  quantityKg: number;
  // Stock disponible al agregarlo (unidades o kg). null/undefined = sin
  // tope (servicio, stock ilimitado, o carrito guardado antes de esto). El
  // checkout igual lo vuelve a validar contra el stock real.
  maxQty?: number | null;
};

export type AddResult = { ok: true; capped: boolean; max: number | null } | { ok: false; max: number };

function capQty(qty: number, max: number | null | undefined) {
  return max === null || max === undefined ? qty : Math.min(qty, max);
}

function storageKey(tenantSlug: string) {
  return `comarpos-tienda-cart-${tenantSlug}`;
}

// Lista de precios con la que se armo el carrito ('' = minorista): si el
// comprador entra con otro link (u otra cuenta con otra lista), los precios
// guardados en el carrito ya no valen y se vacia.
function cartListKey(tenantSlug: string) {
  return `comarpos-tienda-cart-list-${tenantSlug}`;
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
  // Espejo sincronico del carrito: addItem necesita saber ya mismo si se
  // pudo agregar (para avisar "solo hay N disponibles").
  const cartRef = useRef<CartLine[]>([]);

  useEffect(() => {
    const initial = readCart(tenantSlug);
    cartRef.current = initial;
    setCart(initial);
    setLoaded(true);
  }, [tenantSlug]);

  const persist = useCallback((next: CartLine[]) => {
    cartRef.current = next;
    setCart(next);
    writeCart(tenantSlug, next);
  }, [tenantSlug]);

  const addItem = useCallback((
    item: { productId: string; name: string; imageUrl: string | null; price: number; saleUnit: string; maxQty?: number | null },
    qty = 1,
  ): AddResult => {
    const prev = cartRef.current;
    const isKg = item.saleUnit === 'KG';
    const max = item.maxQty ?? null;
    const idx = prev.findIndex((l) => l.productId === item.productId);
    const current = idx >= 0 ? (isKg ? prev[idx].quantityKg : prev[idx].quantity) : 0;

    if (max !== null && current >= max) return { ok: false, max };

    const wanted = current + qty;
    const nextQty = capQty(wanted, max);
    let next: CartLine[];
    if (idx >= 0) {
      next = [...prev];
      next[idx] = {
        ...next[idx],
        maxQty: max,
        ...(isKg ? { quantityKg: nextQty } : { quantity: nextQty }),
      };
    } else {
      next = [...prev, {
        productId: item.productId,
        name: item.name,
        imageUrl: item.imageUrl,
        price: item.price,
        saleUnit: item.saleUnit,
        quantity: isKg ? 0 : nextQty,
        quantityKg: isKg ? nextQty : 0,
        maxQty: max,
      }];
    }
    persist(next);
    return { ok: true, capped: nextQty < wanted, max };
  }, [persist]);

  const qtyInCart = useCallback((productId: string) => {
    const line = cartRef.current.find((l) => l.productId === productId);
    if (!line) return 0;
    return line.saleUnit === 'KG' ? line.quantityKg : line.quantity;
  }, []);

  const updateQty = useCallback((productId: string, qty: number) => {
    const next = cartRef.current
      .map((l) => (l.productId === productId
        ? { ...l, ...(l.saleUnit === 'KG' ? { quantityKg: capQty(qty, l.maxQty) } : { quantity: capQty(qty, l.maxQty) }) }
        : l))
      .filter((l) => (l.saleUnit === 'KG' ? l.quantityKg > 0 : l.quantity > 0));
    persist(next);
  }, [persist]);

  const removeItem = useCallback((productId: string) => {
    const next = cartRef.current.filter((l) => l.productId !== productId);
    persist(next);
  }, [persist]);

  const clear = useCallback(() => {
    persist([]);
  }, [persist]);

  // Devuelve true si vació el carrito porque cambió la lista.
  const syncPriceList = useCallback((listId: string | null) => {
    const next = listId ?? '';
    let prev = '';
    try { prev = window.localStorage.getItem(cartListKey(tenantSlug)) ?? ''; } catch { /* sin storage */ }
    if (prev === next) return false;
    try { window.localStorage.setItem(cartListKey(tenantSlug), next); } catch { /* sin storage */ }
    const hadItems = readCart(tenantSlug).length > 0;
    if (hadItems) persist([]);
    return hadItems;
  }, [tenantSlug, persist]);

  const itemCount = cart.reduce((acc, l) => acc + (l.saleUnit === 'KG' ? 1 : l.quantity), 0);
  const total = cart.reduce((acc, l) => acc + l.price * (l.saleUnit === 'KG' ? l.quantityKg : l.quantity), 0);

  return { cart, loaded, addItem, qtyInCart, updateQty, removeItem, clear, syncPriceList, itemCount, total };
}
