'use client';

import { useEffect, useState } from 'react';
import { X, Sparkles } from 'lucide-react';

// Bump LATEST_ID (fecha + slug corto) cada vez que haya una novedad nueva
// para anunciar -- comparamos contra lo guardado en localStorage, asi que
// un id distinto alcanza para que se vuelva a mostrar una vez por usuario/
// navegador. No usa el store de notificaciones (Notification model) a
// proposito: esto es un anuncio de producto para TODOS los usuarios, no un
// evento de negocio individual.
const LATEST_ID = 'libro-iva-digital-2026-08-26';
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
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Libro IVA Digital, y devoluciones con cambio</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={dismiss}><X size={14} /></button>
        </div>

        <ul style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.9, margin: '0 0 18px', paddingLeft: 18 }}>
          <li><strong>Libro IVA Digital</strong>: nueva sección con Ventas y Compras del mes, lista para descargar en CSV y presentar en el Portal IVA de AFIP/ARCA o pasarle a tu contador.</li>
          <li><strong>Compras</strong>: ahora se cargan los datos fiscales del comprobante (CUIT del proveedor, tipo, punto de venta, número, IVA por producto) para poder armar ese archivo.</li>
          <li><strong>Devolver solo algunos productos</strong>: si la venta tiene varios ítems, ahora elegís cuáles (y cuánta cantidad de cada uno) se devuelven, en vez de tener que devolver la venta entera.</li>
          <li><strong>Cambio por otro producto y saldo a favor</strong>: en la misma devolución podés cargar qué se lleva el cliente a cambio; si sobra plata a favor, se le devuelve o queda acreditada en su cuenta corriente.</li>
          <li><strong>Clientes</strong>: ahora se carga tipo de documento (DNI o CUIT) y condición frente al IVA (Responsable Inscripto, Monotributo, Consumidor Final, etc.).</li>
        </ul>

        <button className="btn btn-primary btn-sm" onClick={dismiss} style={{ width: '100%' }}>Entendido</button>
      </div>
    </div>
  );
}
