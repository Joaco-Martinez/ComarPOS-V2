'use client';

import { useEffect, useState } from 'react';

export const COOKIE_CONSENT_KEY = 'comarpos-cookie-consent';
export const COOKIE_CONSENT_EVENT = 'comarpos-consent-changed';

export type CookieConsent = 'accepted' | 'rejected';

export function getCookieConsent(): CookieConsent | null {
  try {
    const v = localStorage.getItem(COOKIE_CONSENT_KEY);
    return v === 'accepted' || v === 'rejected' ? v : null;
  } catch {
    return null;
  }
}

// Usado por el link "Preferencias de cookies" del footer para volver a
// mostrar el banner y permitir cambiar la eleccion ya hecha.
export function openCookiePreferences() {
  try { localStorage.removeItem(COOKIE_CONSENT_KEY); } catch {}
  window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT));
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const check = () => setVisible(getCookieConsent() === null);
    check();
    window.addEventListener(COOKIE_CONSENT_EVENT, check);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, check);
  }, []);

  const choose = (value: CookieConsent) => {
    try { localStorage.setItem(COOKIE_CONSENT_KEY, value); } catch {}
    window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Preferencias de cookies"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 200,
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.18)',
      }}
    >
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '16px 24px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ flex: '1 1 320px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>
          Usamos cookies propias, necesarias para el funcionamiento del sitio (por ejemplo, mantener tu sesión
          iniciada), y, solo si nos das tu consentimiento, cookies de análisis de <strong>Google Analytics</strong>{' '}
          para entender cómo se usa el sitio y mejorarlo. El sistema funciona igual si las rechazás. Más info en
          nuestra <a href="/privacidad" style={{ color: 'var(--accent)' }}>Política de privacidad</a>.
        </p>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => choose('rejected')}>Rechazar</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => choose('accepted')}>Aceptar</button>
        </div>
      </div>
    </div>
  );
}
