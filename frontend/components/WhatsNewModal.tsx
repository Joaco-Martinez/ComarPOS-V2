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
const LATEST_ID = 'combos-compuestos-2026-11-19';
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
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Combos con tus productos</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={dismiss}><X size={14} /></button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, margin: '0 0 12px' }}>
          Ahora podés armar combos y promos con los productos que ya tenés cargados, y al venderlos se descuenta el stock de cada uno.
        </p>

        <ul style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, margin: '0 0 18px', paddingLeft: 18 }}>
          <li><strong>Dónde</strong>: en Productos → Nuevo producto, elegí Tipo = Compuesto.</li>
          <li><strong>Componentes</strong>: buscá los productos que lleva y poné la cantidad de cada uno (ej. 1 Fernet + 2 Coca-Cola).</li>
          <li><strong>Stock</strong>: el combo no tiene stock propio; te mostramos cuántos podés armar y al venderlo baja el stock de cada componente.</li>
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
