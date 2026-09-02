'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '@/lib/api';

export type StoreAccount = {
  id: string;
  email: string;
  name: string;
  tenantSlug: string | null;
};

type AccountContextValue = {
  account: StoreAccount | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

export const AccountContext = createContext<AccountContextValue | null>(null);

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount debe usarse dentro de la tienda');
  return ctx;
}

/**
 * Sesion de cliente para ESTA tienda puntual (doc "tienda online - cuenta
 * obligatoria para comprar"). /auth/me es global (busca por el userId del
 * JWT, sin importar el tenant) - si la cuenta logueada pertenece a OTRO
 * tenant (comprador que ya tiene cuenta en otra tienda ComarPOS), se
 * descarta acá y queda como invitado, igual que hace optionalStorefrontAuth
 * del lado del backend al armar el pedido.
 */
export function useAccountState(tenantSlug: string) {
  const [account, setAccount] = useState<StoreAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      const user = data?.content;
      if (user && user.tenantSlug === tenantSlug) {
        setAccount({ id: user.id, email: user.email, name: user.name, tenantSlug: user.tenantSlug });
      } else {
        setAccount(null);
      }
    } catch {
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* igual limpiamos el estado local */ }
    setAccount(null);
  }, []);

  return { account, loading, refresh, logout };
}
