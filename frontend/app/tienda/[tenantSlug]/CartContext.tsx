'use client';

import { createContext, useContext } from 'react';
import { useCart, type CartLine } from './useCart';

type CartContextValue = ReturnType<typeof useCart>;

export const CartContext = createContext<CartContextValue | null>(null);

export function useCartContext() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCartContext debe usarse dentro de la tienda');
  return ctx;
}

export type { CartLine };
