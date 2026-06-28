'use client';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import type { Toast } from '@/hooks/useToast';

export default function Toasts({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.type === 'success' && <CheckCircle size={15} style={{ color: 'var(--success)', flexShrink: 0 }} />}
          {t.type === 'error'   && <XCircle     size={15} style={{ color: 'var(--danger)', flexShrink: 0 }} />}
          {t.type === 'warn'    && <AlertTriangle size={15} style={{ color: 'var(--warn)', flexShrink: 0 }} />}
          <span style={{ fontSize: 13, color: 'var(--text)' }}>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
