'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'comarpos-pwa-install-dismissed';

function isStandaloneDisplay() {
  return (window.navigator as any).standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
}

// Safari es el único navegador de iOS que puede instalar (agregar a Inicio);
// Chrome/Firefox/etc en iPhone corren sobre WebKit y su user-agent también
// dice "Safari", así que hay que descartar sus propios tokens (CriOS, FxiOS...)
// para no ofrecerles instalar algo que no van a poder hacer.
function isIosSafari() {
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isOtherBrowser = /crios|fxios|opios|edgios/i.test(ua);
  return isIos && !isOtherBrowser;
}

export default function PwaRegister() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosBanner, setShowIosBanner] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Turbopack en dev reusa las mismas URLs de chunk entre recompilaciones (no
    // hay content-hash por build como en produccion), asi que un service worker
    // cache-first como el nuestro (ver public/sw.js) freezaria para siempre el
    // primer JS/CSS que haya visto y el hot-reload dejaria de reflejar cambios.
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    setDismissed(localStorage.getItem(DISMISS_KEY) === '1');

    // Safari no dispara beforeinstallprompt (no soporta instalación
    // programática): sin este chequeo, quien entra desde un iPhone nunca ve
    // ningún aviso de que la app se puede instalar.
    if (!isStandaloneDisplay() && isIosSafari()) {
      setShowIosBanner(true);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (dismissed || (!installEvent && !showIosBanner)) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  const install = async () => {
    // Se marca como descartado apenas se toca "Instalar", no solo con la X:
    // sin esto, el banner volvía a aparecer en la siguiente carga de página
    // (beforeinstallprompt se vuelve a disparar en Android, y en iOS
    // navegar a /instalar recarga la página) aunque la persona ya haya
    // iniciado la instalación.
    dismiss();
    if (installEvent) {
      await installEvent.prompt();
      await installEvent.userChoice;
      setInstallEvent(null);
      return;
    }
    window.location.href = '/instalar';
  };

  return (
    <div
      className="md:hidden"
      style={{
        position: 'fixed', left: 12, right: 12,
        bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))',
        zIndex: 2147483001,
        background: 'var(--m-gradient, var(--accent))', color: '#fff',
        borderRadius: 'var(--m-radius, 14px)',
        boxShadow: 'var(--m-shadow-lg, 0 12px 30px rgba(0,0,0,0.3))',
        padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
        animation: 'fadeIn 0.25s ease',
      }}
    >
      <Download size={18} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Instalar ComarPOS</div>
        <div style={{ fontSize: 11, opacity: 0.85 }}>Accedé más rápido desde tu pantalla de inicio</div>
      </div>
      <button onClick={install} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
        Instalar
      </button>
      <button onClick={dismiss} style={{ background: 'none', border: 'none', color: '#fff', opacity: 0.8, cursor: 'pointer', padding: 4 }}>
        <X size={14} />
      </button>
    </div>
  );
}
