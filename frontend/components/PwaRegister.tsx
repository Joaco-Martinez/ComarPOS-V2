'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'comarpos-pwa-install-dismissed';

export default function PwaRegister() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    setDismissed(localStorage.getItem(DISMISS_KEY) === '1');

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!installEvent || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  const install = async () => {
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
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
