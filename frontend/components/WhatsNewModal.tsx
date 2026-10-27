'use client';

import { useEffect, useState } from 'react';
import { X, Sparkles, History } from 'lucide-react';
import { useParams } from 'next/navigation';

// Bump LATEST_ID (fecha + slug corto) cada vez que haya una novedad nueva
// para anunciar -- comparamos contra lo guardado en localStorage, asi que
// un id distinto alcanza para que se vuelva a mostrar una vez por usuario/
// navegador. No usa el store de notificaciones (Notification model) a
// proposito: esto es un anuncio de producto para TODOS los usuarios, no un
// evento de negocio individual.
const LATEST_ID = 'stock-respaldo-2026-10-27';
const STORAGE_KEY = 'comarpos-whatsnew-seen';

export default function WhatsNewModal() {
  const [open, setOpen] = useState(false);
  const { tenant } = useParams<{ tenant: string }>();

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
      <div className="modal" style={{ maxWidth: 480, padding: 24, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(243,156,18,0.15)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Sparkles size={17} style={{ color: '#F39C12' }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Novedades</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Stock de respaldo</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={dismiss}><X size={14} /></button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, margin: '0 0 12px' }}>
          Si tenés más de un depósito o sucursal, ya no se te frena una venta porque el local se quedó sin un producto que sí tenés en otro lado.
        </p>

        <ul style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, margin: '0 0 18px', paddingLeft: 18 }}>
          <li><strong>Activalo</strong> en Catálogo y stock → Config. de stock y elegí qué depósitos o sucursales sirven de respaldo, en orden de prioridad.</li>
          <li><strong>Vendés igual</strong>: si la sucursal no tiene stock, lo que falta se descuenta del respaldo automáticamente.</li>
          <li><strong>Queda registrado</strong>: cada uso aparece en Config. de stock y les llega un aviso a los administradores.</li>
          <li><strong>En el POS</strong> ves cuánto hay en la sucursal y cuánto en respaldo, y al cobrar te avisa si se usó.</li>
          <li><strong>Cancelaciones y devoluciones</strong> devuelven el stock a la ubicación de donde salió.</li>
        </ul>

        <div style={{ display: 'flex', gap: 8 }}>
          {tenant && (
            <a
              href={`/${tenant}/ayuda#versiones`}
              onClick={dismiss}
              className="btn btn-secondary btn-sm"
              style={{ flex: 1, gap: 6, textDecoration: 'none', justifyContent: 'center' }}
            >
              <History size={13} /> Historial de versiones
            </a>
          )}
          <button className="btn btn-primary btn-sm" onClick={dismiss} style={{ flex: 1 }}>Entendido</button>
        </div>
      </div>
    </div>
  );
}
