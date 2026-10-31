/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { StoreContext, type StoreInfo } from './StoreContext';
import { CartContext } from './CartContext';
import { useCart } from './useCart';
import { AccountContext, useAccountState } from './AccountContext';
import { Store as StoreIcon, MapPin, Phone, Mail, ShoppingCart, Clock, UserCircle2 } from 'lucide-react';
import { getOpenStatus, normalizeBusinessHours } from './businessHours';
import './tienda.css';

const money = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0);

export default function TiendaLayout({ children }: { children: React.ReactNode }) {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const pathname = usePathname();
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Se llaman siempre, antes de cualquier return anticipado (reglas de
  // hooks) - el carrito vive en localStorage por tenantSlug y la cuenta se
  // resuelve via /auth/me, asi que no importa si la tienda todavia esta
  // cargando.
  const cart = useCart(tenantSlug);
  const accountState = useAccountState(tenantSlug);

  useEffect(() => {
    if (!tenantSlug) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/tienda/${tenantSlug}/store`);
        if (cancelled) return;

        if (data?.storeUnavailable) {
          setUnavailable(data.reason ?? 'UNAVAILABLE');
        } else if (data?.content) {
          setStore(data.content);
        }
      } catch (err: any) {
        if (cancelled) return;
        if (err?.response?.status === 404) setNotFound(true);
        else setUnavailable('ERROR');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [tenantSlug]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F8FA' }}>
        <div style={{ width: 28, height: 28, border: '3px solid #E4E7EC', borderTopColor: '#0D59E7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#F7F8FA', padding: 24, textAlign: 'center' }}>
        <StoreIcon size={40} style={{ color: '#98A2B3' }} />
        <h1 style={{ fontSize: 18, fontWeight: 800, color: '#172033' }}>Tienda no encontrada</h1>
        <p style={{ fontSize: 14, color: '#667085' }}>Revisá el link, puede que esté mal escrito.</p>
      </div>
    );
  }

  if (unavailable || !store) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#F7F8FA', padding: 24, textAlign: 'center' }}>
        <StoreIcon size={40} style={{ color: '#98A2B3' }} />
        <h1 style={{ fontSize: 18, fontWeight: 800, color: '#172033' }}>Tienda no disponible</h1>
        <p style={{ fontSize: 14, color: '#667085' }}>Este negocio no tiene su tienda online activa en este momento.</p>
      </div>
    );
  }

  if (!store.isEnabled) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#F7F8FA', padding: 24, textAlign: 'center' }}>
        <StoreIcon size={40} style={{ color: '#98A2B3' }} />
        <h1 style={{ fontSize: 18, fontWeight: 800, color: '#172033' }}>{store.storeName} no está disponible</h1>
        <p style={{ fontSize: 14, color: '#667085' }}>Esta tienda está temporalmente desactivada.</p>
      </div>
    );
  }

  const accent = store.accentColor || '#0D59E7';
  const hours = normalizeBusinessHours(store.businessHours);
  const hasAnyHours = hours.some((h) => h.enabled);
  const openStatus = hasAnyHours ? getOpenStatus(hours) : null;
  // Barra flotante "Ver carrito" en mobile: solo mientras se navega el
  // catálogo (en carrito/checkout/pedido ya hay un CTA propio).
  const showCartBar = cart.itemCount > 0 && !/\/(carrito|checkout|pedido|cuenta)(\/|$)/.test(pathname ?? '');
  const phoneHref = store.contactPhone ? `tel:${store.contactPhone.replace(/[^\d+]/g, '')}` : null;
  const mapsHref = store.contactAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.contactAddress)}`
    : null;

  return (
    <StoreContext.Provider value={{ store, tenantSlug }}>
      <div className={`t-root${showCartBar ? ' has-cartbar' : ''}`} style={{ '--store-accent': accent } as React.CSSProperties}>
        {store.bannerUrl && (
          <div className="t-banner">
            <img src={store.bannerUrl} alt={store.storeName} />
          </div>
        )}

        <header className="t-header">
          <div className="t-header-inner">
            <Link href={`/tienda/${tenantSlug}`} className="t-brand">
              {store.logoUrl ? (
                <img src={store.logoUrl} alt="" className="t-logo" />
              ) : (
                <div className="t-logo"><StoreIcon size={22} /></div>
              )}
              <div style={{ minWidth: 0 }}>
                <h1 className="t-store-name">{store.storeName}</h1>
                {openStatus && (
                  <div className="t-store-status" style={{ color: openStatus.isOpenNow ? '#12B76A' : '#98A2B3' }}>
                    <span style={{ width: 7, height: 7, borderRadius: 4, background: 'currentColor', flexShrink: 0 }} />
                    {openStatus.isOpenNow ? 'Abierto ahora' : 'Cerrado'}
                  </div>
                )}
              </div>
            </Link>

            <div className="t-actions">
              {!accountState.loading && (
                <Link
                  href={`/tienda/${tenantSlug}/cuenta`}
                  className="t-icon-btn t-account"
                  title={accountState.account?.email ?? 'Ingresar'}
                  aria-label={accountState.account ? 'Mi cuenta' : 'Ingresar'}
                >
                  <UserCircle2 size={19} style={{ color: accountState.account ? 'var(--store-accent)' : undefined }} />
                  <span className="t-hide-xs">{accountState.account ? accountState.account.name.split(' ')[0] : 'Ingresar'}</span>
                </Link>
              )}

              <Link href={`/tienda/${tenantSlug}/carrito`} className="t-icon-btn" style={{ padding: 0, width: 44 }} aria-label="Carrito">
                <ShoppingCart size={20} />
                {cart.itemCount > 0 && <span className="t-badge">{cart.itemCount}</span>}
              </Link>
            </div>
          </div>
        </header>

        {(store.contactAddress || store.contactPhone || openStatus) && (
          <div className="t-info">
            {openStatus && (
              <span className="t-chip">
                <Clock size={13} style={{ flexShrink: 0 }} /> <span>{openStatus.todayLabel}</span>
              </span>
            )}
            {store.contactAddress && mapsHref && (
              <a className="t-chip" href={mapsHref} target="_blank" rel="noopener noreferrer">
                <MapPin size={13} style={{ flexShrink: 0 }} /> <span>{store.contactAddress}</span>
              </a>
            )}
            {store.contactPhone && phoneHref && (
              <a className="t-chip" href={phoneHref}>
                <Phone size={13} style={{ flexShrink: 0 }} /> <span>{store.contactPhone}</span>
              </a>
            )}
          </div>
        )}

        <main className="t-main">
          <AccountContext.Provider value={accountState}>
            <CartContext.Provider value={cart}>
              {children}
            </CartContext.Provider>
          </AccountContext.Provider>
        </main>

        <footer className="t-footer">
          {store.contactEmail && (
            <a href={`mailto:${store.contactEmail}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 6, color: 'inherit', textDecoration: 'none' }}>
              <Mail size={12} /> {store.contactEmail}
            </a>
          )}
          Tienda impulsada por ComarPOS
        </footer>

        {showCartBar && (
          <Link href={`/tienda/${tenantSlug}/carrito`} className="t-cartbar">
            <span className="t-cartbar-count">{cart.itemCount}</span>
            <span className="t-cartbar-label">Ver carrito</span>
            <span className="t-cartbar-total">{money(cart.total)}</span>
          </Link>
        )}
      </div>
    </StoreContext.Provider>
  );
}
