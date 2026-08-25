'use client';

import { useEffect, useState } from 'react';

const COOKIE_NOTICE_SEEN_KEY = 'comarpos-cookie-notice-seen';

// Aviso informativo (no pide elegir aceptar/rechazar): navegar el sitio
// implica aceptar el uso de cookies, incluida la analitica de Google
// Analytics. Ver la aclaracion completa en /privacidad seccion 5.
export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(COOKIE_NOTICE_SEEN_KEY) === '1'; } catch {}
    setVisible(!seen);
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(COOKIE_NOTICE_SEEN_KEY, '1'); } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 200,
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.18)',
      }}
    >
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '16px 24px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ flex: '1 1 320px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>
          Este sitio usa cookies propias y de terceros, incluidas cookies de análisis de{' '}
          <strong>Google Analytics</strong>, para funcionar y para entender cómo se usa. Si continuás navegando,
          aceptás su uso. Más info en nuestra <a href="/privacidad" style={{ color: 'var(--accent)' }}>Política de privacidad</a>.
        </p>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={dismiss}>Aceptar</button>
        </div>
      </div>
    </div>
  );
}
