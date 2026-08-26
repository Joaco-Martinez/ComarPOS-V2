'use client';

import { useEffect, useState } from 'react';
import { X, Sparkles } from 'lucide-react';

// Bump LATEST_ID (fecha + slug corto) cada vez que haya una novedad nueva
// para anunciar -- comparamos contra lo guardado en localStorage, asi que
// un id distinto alcanza para que se vuelva a mostrar una vez por usuario/
// navegador. No usa el store de notificaciones (Notification model) a
// proposito: esto es un anuncio de producto para TODOS los usuarios, no un
// evento de negocio individual.
const LATEST_ID = 'devoluciones-cambio-favor-2026-08-26';
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
              <Sparkles size={17} style={{ color: '#F39C12' }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Novedades</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Devoluciones con cambio y saldo a favor</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={dismiss}><X size={14} /></button>
        </div>

        <ul style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.9, margin: '0 0 18px', paddingLeft: 18 }}>
          <li><strong>Devolver solo algunos productos</strong>: si la venta tiene varios ítems, ahora elegís cuáles (y cuánta cantidad de cada uno) se devuelven, en vez de tener que devolver la venta entera.</li>
          <li><strong>Cambio por otro producto</strong>: en la misma devolución podés cargar qué se lleva el cliente a cambio, y el sistema calcula solo la diferencia.</li>
          <li><strong>Saldo a favor</strong>: si esa diferencia queda a favor del cliente, se le puede devolver en plata o dejarla acreditada en su cuenta corriente para su próxima compra.</li>
          <li><strong>Clientes</strong>: ahora se carga tipo de documento (DNI o CUIT) y condición frente al IVA (Responsable Inscripto, Monotributo, Consumidor Final, etc.).</li>
        </ul>

        <button className="btn btn-primary btn-sm" onClick={dismiss} style={{ width: '100%' }}>Entendido</button>
      </div>
    </div>
  );
}
