/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { StoreContext, type StoreInfo } from './StoreContext';
import { CartContext } from './CartContext';
import { useCart } from './useCart';
import { Store as StoreIcon, MapPin, Phone, Mail, ShoppingCart, Clock } from 'lucide-react';
import { getOpenStatus, normalizeBusinessHours } from './businessHours';

export default function TiendaLayout({ children }: { children: React.ReactNode }) {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Se llama siempre, antes de cualquier return anticipado (reglas de
  // hooks) - el carrito vive en localStorage por tenantSlug, asi que no
  // importa si la tienda todavia esta cargando.
  const cart = useCart(tenantSlug);

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

  return (
    <StoreContext.Provider value={{ store, tenantSlug }}>
      <div style={{ '--store-accent': accent } as React.CSSProperties}>
        {store.bannerUrl && (
          <div style={{ width: '100%', height: 200, overflow: 'hidden', background: '#E4E7EC' }}>
            <img src={store.bannerUrl} alt={store.storeName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        <header style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 20px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          {store.logoUrl ? (
            <img src={store.logoUrl} alt={store.storeName} style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover', flexShrink: 0, border: '1px solid #E4E7EC' }} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: 12, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <StoreIcon size={24} style={{ color: '#fff' }} />
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <a href={`/tienda/${tenantSlug}`} style={{ textDecoration: 'none' }}>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: '#172033', margin: 0 }}>{store.storeName}</h1>
            </a>
            {(store.contactAddress || store.contactPhone || openStatus) && (
              <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                {store.contactAddress && (
                  <span style={{ fontSize: 12, color: '#667085', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={11} /> {store.contactAddress}
                  </span>
                )}
                {store.contactPhone && (
                  <span style={{ fontSize: 12, color: '#667085', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Phone size={11} /> {store.contactPhone}
                  </span>
                )}
                {openStatus && (
                  <span style={{
                    fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
                    color: openStatus.isOpenNow ? '#12B76A' : '#98A2B3',
                  }}>
                    <Clock size={11} /> {openStatus.isOpenNow ? 'Abierto ahora' : 'Cerrado'} · {openStatus.todayLabel}
                  </span>
                )}
              </div>
            )}
          </div>

          <Link
            href={`/tienda/${tenantSlug}/carrito`}
            style={{
              marginLeft: 'auto', flexShrink: 0, position: 'relative', display: 'flex',
              alignItems: 'center', justifyContent: 'center', width: 44, height: 44,
              borderRadius: 10, border: '1px solid #E4E7EC', background: '#fff', textDecoration: 'none',
            }}
          >
            <ShoppingCart size={19} style={{ color: '#172033' }} />
            {cart.itemCount > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9,
                background: 'var(--store-accent)', color: '#fff', fontSize: 10, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
              }}>
                {cart.itemCount}
              </span>
            )}
          </Link>
        </header>

        <main style={{ maxWidth: 1080, margin: '0 auto', padding: '0 20px 60px' }}>
          <CartContext.Provider value={cart}>
            {children}
          </CartContext.Provider>
        </main>

        <footer style={{ borderTop: '1px solid #E4E7EC', padding: '20px', textAlign: 'center', fontSize: 11, color: '#98A2B3' }}>
          {store.contactEmail && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 6 }}>
              <Mail size={11} /> {store.contactEmail}
            </div>
          )}
          Tienda impulsada por ComarPOS
        </footer>
      </div>
    </StoreContext.Provider>
  );
}
