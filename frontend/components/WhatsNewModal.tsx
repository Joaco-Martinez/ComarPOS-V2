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
const LATEST_ID = 'contador-multinegocio-2026-10-23';
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
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Tu contador, sacar stock y etiquetas nuevas</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={dismiss}><X size={14} /></button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, margin: '0 0 12px' }}>
          Ahora tu contador puede entrar a ComarPOS con su propia cuenta, y una misma cuenta le sirve para todos los negocios que atiende.
        </p>

        <ul style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, margin: '0 0 18px', paddingLeft: 18 }}>
          <li><strong>Usuario Contador</strong>: en Usuarios → Nuevo usuario elegí el rol Contador. Solo ve el reporte Contador y las facturas, no vende y no ocupa un usuario de tu plan.</li>
          <li><strong>¿Tu contador ya usa ComarPOS con otro negocio?</strong> Poné solo su email: entra con su cuenta de siempre y elige tu negocio desde el menú. Le podés desactivar o quitar el acceso cuando quieras.</li>
          <li><strong>Sacar stock</strong>: en Stock → Movimiento elegí &quot;Egreso (sacar stock)&quot; para roturas, vencimientos o consumo interno.</li>
          <li><strong>Etiquetas</strong>: el nombre del producto se ve grande y en negrita, y podés filtrar por proveedor para imprimir lo que te llegó.</li>
          <li><strong>SKU solo con letras y números</strong>: sacamos guiones y puntos porque algunos lectores los leían mal. Las etiquetas que ya imprimiste se siguen escaneando bien.</li>
          <li><strong>POS</strong>: si elegís el cliente o la lista de precios al final, ahora se recalculan los precios del carrito.</li>
          <li><strong>PCs viejas</strong>: la pantalla ya no se corta en monitores chicos, y hay un agente de impresión para Windows 7 en Configuración → PrintBox.</li>
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
