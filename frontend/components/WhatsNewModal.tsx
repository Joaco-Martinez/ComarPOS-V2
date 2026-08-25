'use client';

import { useEffect, useState } from 'react';
import { X, Wrench } from 'lucide-react';

// Bump LATEST_ID (fecha + slug corto) cada vez que haya una novedad nueva
// para anunciar -- comparamos contra lo guardado en localStorage, asi que
// un id distinto alcanza para que se vuelva a mostrar una vez por usuario/
// navegador. No usa el store de notificaciones (Notification model) a
// proposito: esto es un anuncio de producto para TODOS los usuarios, no un
// evento de negocio individual.
const LATEST_ID = 'servicios-2026-08-25';
const STORAGE_KEY = 'comarpos-whatsnew-seen';

export default function WhatsNewModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== LATEST_ID) setOpen(true);
    } catch { /* localStorage no disponible (privado/SSR) -- no mostramos nada */ }
  }, []);

  const dismiss = () => {
    setOpen(false);
    try { localStorage.setItem(STORAGE_KEY, LATEST_ID); } catch { /* no persiste, se puede volver a ver */ }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={dismiss}>
      <div className="modal" style={{ maxWidth: 440, padding: 24 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(243,156,18,0.15)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Wrench size={17} style={{ color: '#F39C12' }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Novedad</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Nuevo módulo: Servicios</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={dismiss}><X size={14} /></button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 12 }}>
          Si además de vender hacés reparaciones, ya podés gestionarlas de punta a punta desde <strong>Servicios</strong> (menú lateral):
        </p>

        <ul style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.9, margin: '0 0 18px', paddingLeft: 18 }}>
          <li>Recibí el equipo con sus datos y la falla reportada.</li>
          <li>Armá el presupuesto con repuestos del catálogo y/o mano de obra.</li>
          <li>Compartí un link para que el cliente lo apruebe sin necesitar login.</li>
          <li>Cobrá y facturá la reparación con el mismo circuito de siempre.</li>
        </ul>

        <button className="btn btn-primary btn-sm" onClick={dismiss} style={{ width: '100%' }}>Entendido</button>
      </div>
    </div>
  );
}
