'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';
import { waLink } from './siteConfig';

const DISMISS_KEY = 'comarpos-chat-dismissed';
const AUTO_OPEN_DELAY_MS = 4500;
const MESSAGE_GAP_MS = 1400;
const TYPING_MS = 900;

const SCRIPT = [
  '¡Hola! 👋 Soy el asistente de ComarPOS.',
  'Te cuento rapidísimo qué hace el sistema: vendé desde el mostrador o el celu, facturá con AFIP al toque y controlá tu stock, todo en un solo lugar.',
  '¿Querés ver cómo se adapta a tu rubro, o preferís probarlo gratis 7 días ya mismo?',
];

// Popup de bienvenida tipo chat para la landing -- pensado para levantar la
// tasa de contacto por WhatsApp de gente que entra y se va sin escribir.
// Solo vive en LandingPage (host de marketing), nunca en el layout de la
// app logueada.
export default function LandingChatWidget() {
  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const [typing, setTyping] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-apertura una sola vez por visitante, y solo si no la cerró
  // definitivamente antes ("No volver a mostrar" -> localStorage).
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === 'true';
    } catch { /* localStorage puede fallar en modo privado; asumimos no-dismissed */ }
    if (dismissed) return;

    const t = setTimeout(() => {
      setOpen(true);
      setEverOpened(true);
    }, AUTO_OPEN_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // Revela los mensajes del guion de a uno, con un indicador de "escribiendo"
  // antes de cada uno -- mismo patrón que un chat en vivo, aunque acá es
  // solo un guion fijo (no hay IA ni respuesta libre del visitante).
  useEffect(() => {
    if (!open || visibleCount >= SCRIPT.length) return;
    setTyping(true);
    const t1 = setTimeout(() => {
      setTyping(false);
      setVisibleCount((c) => c + 1);
    }, TYPING_MS);
    return () => clearTimeout(t1);
  }, [open, visibleCount]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [visibleCount, typing]);

  const closePanel = () => setOpen(false);

  const dismissForever = () => {
    try { localStorage.setItem(DISMISS_KEY, 'true'); } catch { /* ignorar */ }
    setOpen(false);
  };

  const openPanel = () => {
    setOpen(true);
    setEverOpened(true);
  };

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 200 }}>
      {open && (
        <div
          style={{
            width: 340, maxWidth: 'calc(100vw - 40px)', marginBottom: 12,
            background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 16,
            boxShadow: '0 20px 60px rgba(0,0,0,0.35)', overflow: 'hidden',
            animation: 'fadeIn 0.25s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <img src="/brand/isologo.png" alt="" width={34} height={34} style={{ objectFit: 'contain', borderRadius: '50%', background: 'var(--surface2)', padding: 4 }} />
              <span style={{ position: 'absolute', bottom: -1, right: -1, width: 9, height: 9, borderRadius: '50%', background: 'var(--success)', border: '2px solid var(--surface)' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Asistente ComarPOS</div>
              <div style={{ fontSize: 11, color: 'var(--success)' }}>En línea</div>
            </div>
            <button onClick={closePanel} aria-label="Cerrar" className="btn btn-ghost btn-xs" style={{ padding: 5 }}>
              <X size={14} />
            </button>
          </div>

          <div ref={scrollRef} style={{ maxHeight: 320, overflowY: 'auto', padding: '14px 14px 4px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SCRIPT.slice(0, visibleCount).map((msg, i) => (
              <div key={i} style={{
                alignSelf: 'flex-start', maxWidth: '88%', background: 'var(--surface2)', color: 'var(--text)',
                fontSize: 13, lineHeight: 1.5, padding: '9px 12px', borderRadius: '4px 14px 14px 14px',
                animation: 'fadeIn 0.25s ease',
              }}>
                {msg}
              </div>
            ))}
            {typing && (
              <div style={{ alignSelf: 'flex-start', background: 'var(--surface2)', padding: '10px 14px', borderRadius: '4px 14px 14px 14px', display: 'flex', gap: 4 }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: '50%', background: 'var(--text3)',
                    animation: 'chatTypingBounce 1s ease-in-out infinite', animationDelay: `${i * 0.15}s`,
                  }} />
                ))}
              </div>
            )}
          </div>

          {visibleCount >= SCRIPT.length && !typing && (
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border)' }}>
              <a
                href={waLink('¡Hola! Vi el asistente en la web y quiero saber más de ComarPOS.')}
                target="_blank" rel="noopener noreferrer"
                className="btn btn-primary btn-sm" style={{ gap: 6, justifyContent: 'center' }}
              >
                <Send size={13} /> Escribinos por WhatsApp
              </a>
              <a href="/prueba-gratis" className="btn btn-secondary btn-sm" style={{ justifyContent: 'center' }}>
                Prefiero probarlo gratis 7 días
              </a>
              <button onClick={dismissForever} className="btn btn-ghost btn-xs" style={{ fontSize: 11, color: 'var(--text3)', alignSelf: 'center' }}>
                No volver a mostrar
              </button>
            </div>
          )}
        </div>
      )}

      {!open && (
        <button
          onClick={openPanel}
          aria-label="Abrir chat de ComarPOS"
          style={{
            width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 10px 28px rgba(13,89,231,0.45)', position: 'relative',
          }}
        >
          <MessageCircle size={24} />
          {!everOpened && (
            <span style={{
              position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid var(--accent)',
              animation: 'pulse-glow 2s ease infinite',
            }} />
          )}
        </button>
      )}
    </div>
  );
}
