import {
  Receipt, ArrowRight, ShoppingBag, PawPrint, Wrench,
  Cpu, Candy, Shirt, Hammer, Truck, Pill, BookOpen, Wine,
  Sparkles, Store, ShieldCheck, Zap, Layers, Target, CheckCircle2,
} from 'lucide-react';
import FiscalMoment from './FiscalMoment';
import ShowcaseTabs from './ShowcaseTabs';
import TiltCard from './TiltCard';
import Reveal from './Reveal';

// TODO: reemplazar por el número real (con código de país, sin +, ej: 5493511234567)
const WHATSAPP_NUMBER = '5490000000000';
const WHATSAPP_MESSAGE = '¡Hola! Quiero conocer más sobre ComarPOS para mi negocio.';
const waLink = (extra?: string) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(extra ?? WHATSAPP_MESSAGE)}`;

const CTA_LABEL = 'Pedir una demo por WhatsApp';

const NAV_LINKS = [
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#rubros', label: 'Rubros' },
  { href: '#planes', label: 'Planes' },
  { href: '#preguntas', label: 'Preguntas frecuentes' },
];

// Mantener en sync con backend/src/config/billing.ts (PLAN.priceArs).
const PLAN_PRICE_ARS = 35000;
const PLAN_PERKS = [
  'Punto de venta, facturación AFIP, stock, caja y reportes incluidos',
  'Usuarios y sucursales sin límite',
  'Precio de lanzamiento fijo de por vida, por tiempo limitado',
];

const BUSINESS_TYPES = [
  { icon: ShoppingBag, label: 'Kioscos y almacenes' },
  { icon: PawPrint, label: 'Veterinarias' },
  { icon: Wrench, label: 'Talleres mecánicos' },
  { icon: Cpu, label: 'Electrónica' },
  { icon: Candy, label: 'Chocolaterías y golosinas' },
  { icon: Shirt, label: 'Indumentaria' },
  { icon: Hammer, label: 'Ferreterías' },
  { icon: Truck, label: 'Distribuidoras' },
  { icon: Pill, label: 'Farmacias' },
  { icon: BookOpen, label: 'Librerías' },
  { icon: Wine, label: 'Vinotecas' },
  { icon: Sparkles, label: 'Perfumerías' },
  { icon: Store, label: 'Y cualquier otro rubro' },
];

const DIFFERENTIATORS = [
  { icon: Layers, title: 'Todo en un solo lugar', desc: 'Ventas, facturación, stock, caja y finanzas conectados entre sí. Nada de planillas sueltas ni sistemas que no se hablan.' },
  { icon: ShieldCheck, title: 'Facturación AFIP real', desc: 'No es un "próximamente": ya emite factura electrónica con CAE y reintenta solo si AFIP está caído.' },
  { icon: Zap, title: 'Se adapta a tu rubro', desc: 'Vendas por unidad, por kilo, en combos o con lista de precios propia por cliente, el sistema se ajusta a como vendés vos.' },
  { icon: Target, title: 'Crece con tu negocio', desc: 'Sumá sucursales, usuarios y stock sin migrar de sistema ni perder el historial.' },
];

const FAQS = [
  { q: '¿Necesito instalar algo?', a: 'No. ComarPOS es 100% web: se usa desde cualquier navegador, en la computadora del local, y también se instala como app en el celular sin pasar por ninguna tienda de aplicaciones.' },
  { q: '¿Emite factura electrónica de verdad?', a: 'Sí. Está integrado directo con los web services de AFIP/ARCA: obtiene el CAE en el momento y agrega el código QR fiscal al comprobante, como exige la normativa.' },
  { q: '¿Sirve para mi rubro específico?', a: 'Sí. No está armado para un solo tipo de comercio: se configura con tus categorías, tus precios y tu forma de vender (por unidad, por kilo o en combos).' },
  { q: '¿Puedo tener más de un local?', a: 'Sí, es multi-sucursal desde el diseño: cada local o depósito tiene su propio stock y caja, y podés comparar el rendimiento entre todos desde los reportes.' },
  { q: '¿Qué pasa si AFIP no responde?', a: 'La venta no se pierde: queda marcada como pendiente y el sistema reintenta solo, en segundo plano, hasta lograr la factura.' },
  { q: '¿Cómo empiezo?', a: 'Podés crear tu cuenta ahora mismo y probar ComarPOS gratis durante 7 días, sin tarjeta de crédito. Si preferís, también podés escribirnos por WhatsApp y coordinamos una demo.' },
];

function Section({ children, style, id }: { children: React.ReactNode; style?: React.CSSProperties; id?: string }) {
  return (
    <section id={id} style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', ...style }}>
      {children}
    </section>
  );
}

function Eyebrow({ children, align = 'center' }: { children: React.ReactNode; align?: 'center' | 'left' }) {
  return (
    <p style={{ textAlign: align, fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1.5, marginBottom: 12, fontFamily: 'var(--mono)' }}>
      {children}
    </p>
  );
}

export default function LandingPage() {
  return (
    <div className="landing-root" style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', position: 'relative', overflowX: 'hidden' }}>
      {/* Ambient glow (no grid technique: warm, soft, not "dev tool") */}
      <div style={{
        position: 'absolute', top: '-8%', left: '58%', transform: 'translateX(-50%)',
        width: 900, height: 700, background: 'radial-gradient(circle, rgba(13,89,231,0.14) 0%, transparent 68%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: '6%', left: '2%',
        width: 460, height: 460, background: 'radial-gradient(circle, rgba(243,156,18,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Nav */}
      <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(247,249,252,0.85)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border)' }}>
        <Section style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
            <img src="/brand/logo-horizontal-positivo.svg" alt="ComarPOS" style={{ height: 28 }} />
            <nav style={{ gap: 20 }} className="hidden md:flex">
              {NAV_LINKS.map((l) => (
                <a key={l.href} href={l.href} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>{l.label}</a>
              ))}
            </nav>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <a href="/login" className="btn btn-ghost btn-sm">Iniciar sesión</a>
            <a href="/prueba-gratis" className="btn btn-primary btn-sm" style={{ gap: 6 }}>
              Probar gratis <ArrowRight size={14} />
            </a>
          </div>
        </Section>
      </header>

      {/* Hero */}
      <Section style={{ position: 'relative', padding: '72px 24px 48px' }}>
        <div style={{ display: 'flex', gap: 56, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 440px', animation: 'fadeIn 0.5s ease' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
              color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid var(--border2)',
              borderRadius: 999, padding: '6px 14px', marginBottom: 22, fontFamily: 'var(--mono)',
            }}>
              <Receipt size={13} /> FACTURACIÓN ELECTRÓNICA AFIP EN TIEMPO REAL
            </div>
            <h1 style={{ fontSize: 'clamp(32px, 4.6vw, 52px)', fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.02em', marginBottom: 20 }}>
              Vendé, facturá y controlá tu negocio, todo en un solo lugar
            </h1>
            <p style={{ fontSize: 16.5, color: 'var(--text2)', maxWidth: 480, marginBottom: 32, lineHeight: 1.6 }}>
              ComarPOS junta punto de venta, factura electrónica con CAE de ARCA/AFIP, stock, caja y
              reportes. Pensado para el mostrador de tu local, no para una oficina de sistemas.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 40 }}>
              <a href="/prueba-gratis" className="btn btn-primary btn-lg" style={{ gap: 8 }}>
                Probar gratis 7 días <ArrowRight size={16} />
              </a>
              <a href={waLink()} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-lg">
                {CTA_LABEL}
              </a>
            </div>

            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', maxWidth: 460 }}>
              {[
                ['7 días', 'gratis, sin tarjeta'],
                ['AFIP', 'CAE real, no una demo'],
                ['PWA', 'se instala en 1 minuto'],
              ].map(([n, l]) => (
                <div key={l} style={{ minWidth: 120 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{n}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.4 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ flex: '0 1 400px', display: 'flex', justifyContent: 'center', minWidth: 0 }}>
            <FiscalMoment />
          </div>
        </div>
      </Section>

      {/* Business types */}
      <Section id="rubros" style={{ padding: '40px 24px 80px', position: 'relative' }}>
        <Reveal>
          <Eyebrow>UN SISTEMA, CUALQUIER RUBRO</Eyebrow>
          <h2 style={{ fontSize: 26, fontWeight: 800, textAlign: 'center', marginBottom: 28, letterSpacing: '-0.01em' }}>
            Se adapta a como vendés vos
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {BUSINESS_TYPES.map(({ icon: Icon, label }) => (
              <span key={label} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 999, padding: '8px 16px', fontSize: 13, color: 'var(--text2)',
              }}>
                <Icon size={14} style={{ color: 'var(--accent)' }} /> {label}
              </span>
            ))}
          </div>
        </Reveal>
      </Section>

      {/* Showcase (tabs + phone) */}
      <Section id="como-funciona" style={{ padding: '0 24px 100px', position: 'relative' }}>
        <Eyebrow>ASÍ SE VE UN DÍA DE TRABAJO</Eyebrow>
        <h2 style={{ fontSize: 30, fontWeight: 800, textAlign: 'center', marginBottom: 12, letterSpacing: '-0.01em' }}>
          Un sistema, de la venta al reporte
        </h2>
        <p style={{ fontSize: 14.5, color: 'var(--text3)', textAlign: 'center', marginBottom: 44 }}>
          Elegí un momento del día y mirá cómo se ve, tal cual, adentro de ComarPOS.
        </p>
        <Reveal>
          <ShowcaseTabs />
        </Reveal>
      </Section>

      {/* Differentiators */}
      <Section style={{ padding: '0 24px 96px' }}>
        <Eyebrow>POR QUÉ COMARPOS</Eyebrow>
        <h2 style={{ fontSize: 28, fontWeight: 800, textAlign: 'center', marginBottom: 40, letterSpacing: '-0.01em' }}>
          Se adapta a tu negocio, no al revés
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          {DIFFERENTIATORS.map(({ icon: Icon, title, desc }, i) => (
            <Reveal key={title} delay={i * 0.1}>
              <TiltCard className="card" style={{ padding: 22, height: '100%' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, background: 'var(--accent-dim)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
                }}>
                  <Icon size={20} style={{ color: 'var(--accent)' }} />
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6 }}>{desc}</p>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* Planes */}
      <Section id="planes" style={{ padding: '0 24px 96px' }}>
        <Eyebrow>PLANES</Eyebrow>
        <h2 style={{ fontSize: 28, fontWeight: 800, textAlign: 'center', marginBottom: 12, letterSpacing: '-0.01em' }}>
          Un plan simple, para cualquier rubro
        </h2>
        <p style={{ fontSize: 14.5, color: 'var(--text3)', textAlign: 'center', marginBottom: 40, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
          Sin planes escalonados ni letra chica: un solo precio con todo incluido. Probalo gratis
          o suscribite directamente si ya lo tenés decidido.
        </p>
        <Reveal>
          <TiltCard className="card" style={{
            maxWidth: 460, margin: '0 auto', padding: '36px 32px', textAlign: 'center',
            background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface2) 100%)',
          }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700,
              color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid var(--border2)',
              borderRadius: 999, padding: '5px 12px', marginBottom: 18, fontFamily: 'var(--mono)',
            }}>
              PRECIO DE LANZAMIENTO
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.02em', fontFamily: 'var(--mono)' }}>
                ${PLAN_PRICE_ARS.toLocaleString('es-AR')}
              </span>
              <span style={{ fontSize: 15, color: 'var(--text3)', fontWeight: 600 }}>/mes</span>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 24 }}>
              Fijo de por vida para quien se suscribe ahora, por tiempo limitado
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', marginBottom: 28 }}>
              {PLAN_PERKS.map((p) => (
                <li key={p} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.5 }}>
                  <CheckCircle2 size={16} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 1 }} /> {p}
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              <a href="/prueba-gratis" className="btn btn-primary btn-lg" style={{ gap: 8, flex: '1 1 auto' }}>
                Probar gratis 7 días <ArrowRight size={16} />
              </a>
              <a href="/prueba-gratis?plan=directo" className="btn btn-secondary btn-lg" style={{ flex: '1 1 auto' }}>
                Elegir este plan ahora
              </a>
            </div>
          </TiltCard>
        </Reveal>
      </Section>

      {/* FAQ */}
      <Section id="preguntas" style={{ padding: '0 24px 96px' }}>
        <Eyebrow>PREGUNTAS FRECUENTES</Eyebrow>
        <h2 style={{ fontSize: 28, fontWeight: 800, textAlign: 'center', marginBottom: 32, letterSpacing: '-0.01em' }}>
          Lo que más nos preguntan
        </h2>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FAQS.map(({ q, a }, i) => (
            <Reveal key={q} delay={i * 0.05}>
              <details className="card" style={{ padding: '16px 20px' }}>
                <summary style={{ fontSize: 14, fontWeight: 700, cursor: 'pointer', color: 'var(--text)' }}>
                  {q}
                </summary>
                <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6, marginTop: 10 }}>{a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* Final CTA */}
      <Section style={{ padding: '0 24px 100px' }}>
        <Reveal>
          <div className="card" style={{
            padding: '52px 40px', textAlign: 'center',
            background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface2) 100%)',
          }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 14, letterSpacing: '-0.01em' }}>
              ¿Le damos una vuelta a cómo vendés?
            </h2>
            <p style={{ fontSize: 14.5, color: 'var(--text3)', marginBottom: 28, maxWidth: 460, margin: '0 auto 28px' }}>
              Contanos de tu negocio y te mostramos ComarPOS funcionando con tus propios productos,
              sin compromiso.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <a href="/prueba-gratis" className="btn btn-primary btn-lg" style={{ gap: 8 }}>
                Probar gratis 7 días <ArrowRight size={16} />
              </a>
              <a href={waLink('¡Hola! Quiero pedir una demo de ComarPOS.')} target="_blank" rel="noopener noreferrer"
                className="btn btn-secondary btn-lg">
                {CTA_LABEL}
              </a>
            </div>
            <ul style={{
              listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '10px 24px',
              justifyContent: 'center', marginTop: 28,
            }}>
              {[
                'Sin instalar nada para arrancar',
                'Multi-sucursal y multi-usuario desde el día uno',
                'Sumás rubros, locales y stock sin perder historial',
              ].map((t) => (
                <li key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text3)' }}>
                  <CheckCircle2 size={13} style={{ color: 'var(--success)' }} /> {t}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </Section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '40px 24px 24px', position: 'relative' }}>
        <Section style={{ display: 'flex', gap: 32, flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ maxWidth: 280 }}>
            <img src="/brand/logo-horizontal-positivo.svg" alt="ComarPOS" style={{ height: 24, marginBottom: 12 }} />
            <p style={{ fontSize: 12.5, color: 'var(--text3)', lineHeight: 1.6 }}>
              Sistema de gestión (ERP + punto de venta) para comercios de cualquier rubro,
              con facturación electrónica AFIP integrada.
            </p>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: 1, marginBottom: 10, fontFamily: 'var(--mono)' }}>PRODUCTO</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {NAV_LINKS.map((l) => (
                <a key={l.href} href={l.href} style={{ fontSize: 13, color: 'var(--text2)' }}>{l.label}</a>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: 1, marginBottom: 10, fontFamily: 'var(--mono)' }}>CONTACTO</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <a href={waLink()} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--text2)' }}>WhatsApp</a>
              <a href="/login" style={{ fontSize: 13, color: 'var(--text2)' }}>Ya soy cliente, iniciar sesión</a>
            </div>
          </div>
        </Section>
        <Section style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
          <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
            © {new Date().getFullYear()} ComarPOS · Sistema de gestión para comercios
          </span>
        </Section>
      </footer>
    </div>
  );
}
