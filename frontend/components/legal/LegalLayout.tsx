import SiteFooter from '../landing/SiteFooter';
import { CONTACT_EMAIL } from '../landing/siteConfig';

export function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginTop: 32, marginBottom: 10 }}>
      {children}
    </h2>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 12 }}>
      {children}
    </p>
  );
}

export function Ul({ children }: { children: React.ReactNode }) {
  return (
    <ul style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 12, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {children}
    </ul>
  );
}

export function Mail({ children = CONTACT_EMAIL }: { children?: string }) {
  return <a href={`mailto:${children}`} style={{ color: 'var(--accent)' }}>{children}</a>;
}

export default function LegalLayout({ title, updatedAt, children }: { title: string; updatedAt: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(247,249,252,0.85)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
            <img src="/brand/isologo.png" alt="ComarPOS" width={30} height={30} style={{ objectFit: 'contain', flexShrink: 0 }} />
            <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.5, color: 'var(--text)' }}>
              omar<span style={{ color: 'var(--accent)' }}>POS</span>
            </span>
          </a>
          <a href="/" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>Volver al inicio</a>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 64px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>{title}</h1>
        <p style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 32 }}>
          Última actualización: {updatedAt}
        </p>
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
