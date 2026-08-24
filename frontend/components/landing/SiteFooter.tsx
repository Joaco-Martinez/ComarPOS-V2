import { waLink } from './siteConfig';

function Section({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <section style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', ...style }}>{children}</section>;
}

const LEGAL_LINKS = [
  { href: '/terminos', label: 'Términos y condiciones' },
  { href: '/privacidad', label: 'Política de privacidad' },
];

// Compartido entre la landing y las paginas legales -- antes el footer
// (incluido el WhatsApp de contacto) estaba duplicado inline en
// LandingPage.tsx; extraido aca para no repetir el mismo link en 3
// archivos distintos.
export default function SiteFooter({ productLinks }: { productLinks?: Array<{ href: string; label: string }> }) {
  return (
    <footer style={{ borderTop: '1px solid var(--border)', padding: '40px 24px 24px', position: 'relative' }}>
      <Section style={{ display: 'flex', gap: 32, flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ maxWidth: 280 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 14 }}>
            <img src="/brand/isologo.png" alt="ComarPOS" width={40} height={40} style={{ objectFit: 'contain' }} />
            <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.6, color: 'var(--text)' }}>
              omar<span style={{ color: 'var(--accent)' }}>POS</span>
            </span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text3)', lineHeight: 1.6 }}>
            Sistema de gestión (ERP + punto de venta) para comercios de cualquier rubro,
            con facturación electrónica AFIP integrada.
          </p>
        </div>
        {productLinks && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: 1, marginBottom: 10, fontFamily: 'var(--mono)' }}>PRODUCTO</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {productLinks.map((l) => (
                <a key={l.href} href={l.href} style={{ fontSize: 13, color: 'var(--text2)' }}>{l.label}</a>
              ))}
            </div>
          </div>
        )}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: 1, marginBottom: 10, fontFamily: 'var(--mono)' }}>CONTACTO</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <a href={waLink()} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--text2)' }}>WhatsApp</a>
            <a href="/login" style={{ fontSize: 13, color: 'var(--text2)' }}>Ya soy cliente, iniciar sesión</a>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: 1, marginBottom: 10, fontFamily: 'var(--mono)' }}>LEGAL</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {LEGAL_LINKS.map((l) => (
              <a key={l.href} href={l.href} style={{ fontSize: 13, color: 'var(--text2)' }}>{l.label}</a>
            ))}
          </div>
        </div>
      </Section>
      <Section style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
        <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
          © {new Date().getFullYear()} ComarPOS · Sistema de gestión para comercios
        </span>
      </Section>
    </footer>
  );
}
