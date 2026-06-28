import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 88, fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--accent)', lineHeight: 1, letterSpacing: -4 }}>404</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 16 }}>Página no encontrada</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 6 }}>La ruta que buscás no existe en ComarPOS.</div>
        <div style={{ marginTop: 28 }}>
          <Link href="/dashboard" className="btn btn-primary btn-sm">Ir al Dashboard</Link>
        </div>
      </div>
    </div>
  );
}
