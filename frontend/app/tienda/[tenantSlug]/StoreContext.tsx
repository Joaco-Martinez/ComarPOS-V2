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

export const StoreContext = createContext<{ store: StoreInfo; tenantSlug: string } | null>(null);

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore debe usarse dentro de la tienda');
  return ctx;
}
