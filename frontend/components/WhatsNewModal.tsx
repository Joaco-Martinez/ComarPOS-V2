'use client';

import { useEffect, useState } from 'react';
import { X, Sparkles } from 'lucide-react';

// Bump LATEST_ID (fecha + slug corto) cada vez que haya una novedad nueva
// para anunciar -- comparamos contra lo guardado en localStorage, asi que
// un id distinto alcanza para que se vuelva a mostrar una vez por usuario/
// navegador. No usa el store de notificaciones (Notification model) a
// proposito: esto es un anuncio de producto para TODOS los usuarios, no un
// evento de negocio individual.
const LATEST_ID = 'mobile-navegacion-2026-08-27';
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
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Mejoras de navegación en celular</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={dismiss}><X size={14} /></button>
        </div>

        <ul style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.9, margin: '0 0 18px', paddingLeft: 18 }}>
          <li><strong>Vender ya no se traba</strong>: el aviso de instalar la app podía taparte los botones de "Confirmar venta" en el carrito del POS. Arreglado.</li>
          <li><strong>Panel "Más" reorganizado</strong>: las secciones ahora están agrupadas por tema (Ventas, Productos y stock, Facturación, Clientes, Administración, Compras, Finanzas, Ayuda), se pueden achicar tocando el título, y la app se acuerda cuáles dejaste abiertas.</li>
          <li><strong>Se sabe dónde estás</strong>: abrir y cerrar ese panel ahora es una animación suave en vez de un salto brusco.</li>
          <li><strong>Editor de accesos rápidos</strong>: el botón de opciones de cada sección no abría su menú. Arreglado.</li>
          <li><strong>Avisos arriba a la derecha</strong>: los mensajes de "creado", "guardado", etc. ya no aparecen abajo tapando la navegación.</li>
          <li><strong>Notificaciones</strong>: el panel de la campanita ya no se corta en pantallas angostas.</li>
          <li>Botones del header más grandes y fáciles de tocar, y otros ajustes chicos de mobile.</li>
        </ul>

        <button className="btn btn-primary btn-sm" onClick={dismiss} style={{ width: '100%' }}>Entendido</button>
      </div>
    </div>
  );
}
