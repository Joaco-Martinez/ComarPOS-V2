'use client';

import { useEffect, useState } from 'react';
import { X, Sparkles } from 'lucide-react';

// Bump LATEST_ID (fecha + slug corto) cada vez que haya una novedad nueva
// para anunciar -- comparamos contra lo guardado en localStorage, asi que
// un id distinto alcanza para que se vuelva a mostrar una vez por usuario/
// navegador. No usa el store de notificaciones (Notification model) a
// proposito: esto es un anuncio de producto para TODOS los usuarios, no un
// evento de negocio individual.
const LATEST_ID = 'servicios-iva-clientes-2026-08-25';
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
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Mejoras en Servicios, Clientes y ARCA</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={dismiss}><X size={14} /></button>
        </div>

        <ul style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.9, margin: '0 0 18px', paddingLeft: 18 }}>
          <li><strong>Alta rápida de clientes</strong>: en POS, Servicios y Cuentas Corrientes, si buscás un cliente y no aparece, ahora podés cargarlo al toque desde ahí mismo — solo pedimos el nombre, el resto es opcional.</li>
          <li><strong>Servicios</strong>: el presupuesto de reparación ahora discrimina IVA por ítem y se puede descargar en PDF (también desde el link público que ve el cliente).</li>
          <li><strong>Empresa / ARCA</strong>: separamos Razón Social de Nombre de Fantasía, sumamos un botón para autocompletar ARCA con los datos de Empresa, y al configurar ARCA por primera vez creamos la primera sucursal sola.</li>
          <li><strong>Remitos</strong>: si todavía no tenés un CAI activo, te avisamos antes de intentar crear uno, con el link directo a ARCA.</li>
        </ul>

        <button className="btn btn-primary btn-sm" onClick={dismiss} style={{ width: '100%' }}>Entendido</button>
      </div>
    </div>
  );
}
