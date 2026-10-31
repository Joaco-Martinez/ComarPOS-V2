'use client';

import { createContext, useContext } from 'react';

export type StoreInfo = {
  isEnabled: boolean;
  storeName: string;
  description: string | null;
  bannerUrl: string | null;
  accentColor: string | null;
  businessHours: unknown;
  pickupEnabled: boolean;
  transferInstructions: string | null;
  mpEnabled: boolean;
  logoUrl: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  contactAddress: string | null;
};

export type StorePriceList = { id: string; name: string };

export const StoreContext = createContext<{
  store: StoreInfo;
  tenantSlug: string;
  // Lista de precios pedida por link (?lista=<id>), recordada mientras el
  // comprador navega la tienda. Se manda al catalogo y al checkout.
  linkPriceListId: string | null;
  // Lista que efectivamente aplica (la del link o la asignada al cliente
  // logueado) - la informa el backend con cada pagina del catalogo.
  priceList: StorePriceList | null;
  setPriceList: (list: StorePriceList | null) => void;
} | null>(null);

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore debe usarse dentro de la tienda');
  return ctx;
}
