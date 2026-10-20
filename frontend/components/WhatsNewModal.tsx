'use client';

import { useEffect, useState } from 'react';
import { X, Sparkles } from 'lucide-react';

// Bump LATEST_ID (fecha + slug corto) cada vez que haya una novedad nueva
// para anunciar -- comparamos contra lo guardado en localStorage, asi que
// un id distinto alcanza para que se vuelva a mostrar una vez por usuario/
// navegador. No usa el store de notificaciones (Notification model) a
// proposito: esto es un anuncio de producto para TODOS los usuarios, no un
// evento de negocio individual.
const LATEST_ID = 'variantes-de-producto-2026-10-20';
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
      <div className="modal" style={{ maxWidth: 480, padding: 24, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(243,156,18,0.15)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Sparkles size={17} style={{ color: '#F39C12' }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Novedades</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Variantes de producto: talles, colores, sabores…</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={dismiss}><X size={14} /></button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, margin: '0 0 12px' }}>
          Ahora un mismo producto puede tener variantes (ej. una Remera en talles S, M, L y colores Rojo y Negro). Cada combinación tiene su propio SKU, precio, foto y stock por sucursal.
        </p>

        <ul style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, margin: '0 0 18px', paddingLeft: 18 }}>
          <li><strong>Cómo se carga</strong>: en Productos → Nuevo producto tildá &quot;Tiene variantes&quot;, cargá las opciones (Talle, Color…) con sus valores y se arma una variante por cada combinación. Podés cargar el stock inicial de cada una.</li>
          <li><strong>Precio</strong>: cargás un precio y un costo generales que se copian a todas. Si cambiás el de una variante queda &quot;personalizado&quot;; con &quot;volver al precio general&quot; lo revertís.</li>
          <li><strong>Vender</strong>: en el POS el producto aparece una sola vez; al tocarlo elegís la variante y ves su stock. Si escaneás el código de la variante, se agrega directo.</li>
          <li><strong>Stock, compras y cambios</strong>: todo es por variante. En Compras cargás cantidades de varias variantes de una (10 M, 5 L…) y en Devoluciones podés cambiar un M por un L.</li>
          <li><strong>Tickets, facturas y alertas</strong> muestran el nombre completo (&quot;Remera - M / Rojo&quot;). En Reportes elegís ver por variante o agrupar por producto.</li>
          <li><strong>Tienda online</strong>: el cliente elige talle y color; las combinaciones sin stock aparecen deshabilitadas.</li>
          <li><strong>¿Ya tenés el producto cargado?</strong> Usá &quot;Convertir a producto con variantes&quot; en el listado: podés convertirlo en la primera variante (conserva stock e historial) o empezar de cero.</li>
          <li>Solo el producto principal cuenta para el límite de tu plan; las variantes no.</li>
        </ul>

        <button className="btn btn-primary btn-sm" onClick={dismiss} style={{ width: '100%' }}>Entendido</button>
      </div>
    </div>
  );
}
