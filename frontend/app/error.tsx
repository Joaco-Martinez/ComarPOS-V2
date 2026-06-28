'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 56, fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--danger)', lineHeight: 1 }}>Error</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 14 }}>Algo salió mal</div>
        {error.message && (
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8, fontFamily: 'var(--mono)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', wordBreak: 'break-all' }}>
            {error.message}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 28 }}>
          <button onClick={reset} className="btn btn-primary btn-sm">Reintentar</button>
          <a href="/dashboard" className="btn btn-secondary btn-sm">Ir al Dashboard</a>
        </div>
      </div>
    </div>
  );
}
