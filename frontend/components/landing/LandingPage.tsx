import {
  ArrowRight, Store, ShieldCheck, Zap, Layers, Target, CheckCircle2,
} from 'lucide-react';
import FiscalMoment from './FiscalMoment';
import ShowcaseTabs from './ShowcaseTabs';
import TiltCard from './TiltCard';
import Reveal from './Reveal';
import LandingFade from './LandingFade';
import RubroPill from './RubroPill';
import SiteFooter from './SiteFooter';
import LandingChatWidget from './LandingChatWidget';
import { waLink } from './siteConfig';
import { VERTICALS, type Vertical } from './verticals';
import { PLANS, LAUNCH_PRICE_ENDS_LABEL, isLaunchPriceActive } from './plans';
import LaunchCountdown from './LaunchCountdown';

const CTA_LABEL = 'Pedir una demo por WhatsApp';

const NAV_LINKS = [
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#rubros', label: 'Rubros' },
  { href: '#planes', label: 'Planes' },
  { href: '#preguntas', label: 'Preguntas frecuentes' },
];

const ALL_BUSINESS_TYPES: Array<{ slug: string | null; icon: typeof Store; label: string }> = [
  ...VERTICALS.map((v) => ({ slug: v.slug as string | null, icon: v.icon, label: v.label })),
  { slug: null, icon: Store, label: 'Y cualquier otro rubro' },
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

export default function LandingPage({ vertical }: { vertical?: Vertical } = {}) {
  // Se evalua en cada render -- LandingPage cuelga de una pagina que ya usa
  // headers() (ver app/page.tsx/isMarketingHost), asi que Next la sirve
  // dinamica por request, no cacheada -- una vez pasada la fecha, el precio
  // de lanzamiento deja de mostrarse solo, sin redeploy.
  const launchActive = isLaunchPriceActive();

  return (
    <>
    <LandingFade className="landing-root" style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', position: 'relative', overflowX: 'hidden', maxWidth: '100vw', contain: 'paint' }}>
      {/* Ambient glow (no grid technique: warm, soft, not "dev tool") */}
      <div style={{
        position: 'absolute', top: '-8%', left: '58%', transform: 'translateX(-50%)',
        width: 'min(900px, 100vw)', height: 700, background: 'radial-gradient(circle, rgba(13,89,231,0.14) 0%, transparent 68%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: '6%', left: '2%',
        width: 'min(460px, 90vw)', height: 460, background: 'radial-gradient(circle, rgba(243,156,18,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Nav */}
      <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(247,249,252,0.85)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--border)' }}>
        <Section style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
            <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
              <img src="/brand/isologo.png" alt="ComarPOS" width={34} height={34} style={{ objectFit: 'contain', flexShrink: 0 }} />
              <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.5, color: 'var(--text)' }}>
                omar<span style={{ color: 'var(--accent)' }}>POS</span>
              </span>
            </a>
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
            {vertical && <Eyebrow align="left">{vertical.label.toUpperCase()}</Eyebrow>}
            <h1 style={{ fontSize: 'clamp(32px, 4.6vw, 52px)', fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.02em', marginBottom: 20 }}>
              {vertical ? <>El sistema para tu {vertical.headline}</> : 'Vendé, facturá y controlá tu negocio, todo en un solo lugar'}
            </h1>
            <p style={{ fontSize: 16.5, color: 'var(--text2)', maxWidth: 480, marginBottom: 32, lineHeight: 1.6 }}>
              {vertical ? vertical.heroDescription : 'ComarPOS junta punto de venta, factura electrónica con CAE de ARCA/AFIP, stock, caja y reportes. Pensado para el mostrador de tu local, no para una oficina de sistemas.'}
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

      {/* Problem (solo en páginas por rubro) */}
      {vertical && (
        <Section style={{ padding: '0 24px 72px' }}>
          <Reveal>
            <div className="card" style={{
              padding: '40px 36px',
              background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface2) 100%)',
            }}>
              <Eyebrow align="left">EL PROBLEMA</Eyebrow>
              <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 14, letterSpacing: '-0.01em', maxWidth: 600 }}>
                {vertical.problemTitle}
              </h2>
              <p style={{ fontSize: 14.5, color: 'var(--text2)', lineHeight: 1.7, maxWidth: 660, marginBottom: 24 }}>
                {vertical.problemDescription}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {vertical.tags.map((tag) => (
                  <span key={tag} style={{
                    display: 'inline-flex', alignItems: 'center', fontSize: 12.5, fontWeight: 600,
                    color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid var(--border2)',
                    borderRadius: 999, padding: '6px 14px',
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </Section>
      )}

      {/* Features específicas del rubro (solo en páginas por rubro) */}
      {vertical && (
        <Section style={{ padding: '0 24px 80px' }}>
          <Eyebrow>QUÉ INCLUYE PARA VOS</Eyebrow>
          <h2 style={{ fontSize: 26, fontWeight: 800, textAlign: 'center', marginBottom: 36, letterSpacing: '-0.01em' }}>
            Hecho a medida para tu {vertical.headline}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {vertical.features.map(({ icon: Icon, title, desc }, i) => (
              <Reveal key={title} delay={i * 0.08}>
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
      )}

      {/* Business types */}
      <Section id="rubros" style={{ padding: '40px 24px 80px', position: 'relative' }}>
        <Reveal>
          <Eyebrow>{vertical ? 'CAMBIAR DE RUBRO' : 'UN SISTEMA, CUALQUIER RUBRO'}</Eyebrow>
          <h2 style={{ fontSize: 26, fontWeight: 800, textAlign: 'center', marginBottom: 28, letterSpacing: '-0.01em' }}>
            {vertical ? 'También usado en estos rubros' : 'Se adapta a como vendés vos'}
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {ALL_BUSINESS_TYPES.map(({ slug, icon: Icon, label }) => {
              const active = !!vertical && slug === vertical.slug;
              const pillStyle: React.CSSProperties = {
                display: 'inline-flex', alignItems: 'center', gap: 7,
                background: active ? 'var(--accent-dim)' : 'var(--surface)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 999, padding: '8px 16px', fontSize: 13,
                color: active ? 'var(--accent)' : 'var(--text2)',
                fontWeight: active ? 700 : 400,
                textDecoration: 'none', transition: 'all 0.12s',
              };
              return slug ? (
                <RubroPill key={label} href={`/para/${slug}`} style={pillStyle}>
                  <Icon size={14} style={{ color: 'var(--accent)' }} /> {label}
                </RubroPill>
              ) : (
                <a
                  key={label}
                  href={waLink('¡Hola! Mi rubro no está en la lista, quiero consultar si ComarPOS me sirve.')}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={pillStyle}
                >
                  <Icon size={14} style={{ color: 'var(--accent)' }} /> {label}
                </a>
              );
            })}
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
          Un plan para cada tamaño de negocio
        </h2>
        <p style={{ fontSize: 14.5, color: 'var(--text3)', textAlign: 'center', marginBottom: 12, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
          Probalo gratis 7 días con cualquier plan, o suscribite directamente si ya lo tenés decidido.
        </p>
        {launchActive && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 40 }}>
            <LaunchCountdown />
            <p style={{ fontSize: 11.5, color: 'var(--text3)', textAlign: 'center' }}>
              Precio de lanzamiento válido hasta el {LAUNCH_PRICE_ENDS_LABEL} — después pasa al precio de lista
            </p>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, alignItems: 'start', maxWidth: 1000, margin: '0 auto' }}>
          {PLANS.map((plan, i) => (
            <Reveal key={plan.id} delay={i * 0.06}>
              <TiltCard className="card" style={{
                padding: '32px 26px', textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column',
                position: 'relative',
                ...(plan.highlighted
                  ? { border: '1.5px solid var(--accent)', background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface2) 100%)', transform: 'scale(1.03)', boxShadow: '0 16px 40px rgba(13,89,231,0.18)' }
                  : {}),
              }}>
                {plan.highlighted && (
                  <div style={{
                    position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--accent)', color: '#fff', fontSize: 10.5, fontWeight: 800,
                    letterSpacing: 0.5, padding: '5px 14px', borderRadius: 999, fontFamily: 'var(--mono)',
                    whiteSpace: 'nowrap',
                  }}>
                    ⭐ EL MÁS ELEGIDO
                  </div>
                )}

                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 4, marginTop: plan.highlighted ? 6 : 0 }}>
                  {plan.name}
                </div>
                <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 18, minHeight: 32 }}>{plan.tagline}</p>

                {launchActive && (
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 7, marginBottom: 2 }}>
                    <span style={{ fontSize: 14, color: 'var(--text3)', textDecoration: 'line-through', fontFamily: 'var(--mono)' }}>
                      ${plan.regularPriceArs.toLocaleString('es-AR')}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                    ${(launchActive ? plan.priceArs : plan.regularPriceArs).toLocaleString('es-AR')}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 600 }}>/mes</span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 22 }}>
                  {launchActive ? 'Precio de lanzamiento, fijo de por vida' : 'Precio fijo de por vida'}
                </p>

                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9, textAlign: 'left', marginBottom: 24, flex: 1 }}>
                  {plan.perks.map((p) => (
                    <li key={p} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                      <CheckCircle2 size={15} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 1 }} /> {p}
                    </li>
                  ))}
                </ul>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <a
                    href={`/prueba-gratis?planId=${plan.id}`}
                    className={plan.highlighted ? 'btn btn-primary' : 'btn btn-secondary'}
                    style={{ gap: 8, justifyContent: 'center' }}
                  >
                    Probar gratis 7 días <ArrowRight size={14} />
                  </a>
                  <a href={`/prueba-gratis?planId=${plan.id}&plan=directo`} className="btn btn-ghost btn-sm" style={{ justifyContent: 'center' }}>
                    Elegir este plan ahora
                  </a>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
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

      {/* Brand identity */}
      <Section style={{ padding: '0 24px 88px', textAlign: 'center' }}>
        <Reveal>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <img src="/brand/isologo.png" alt="ComarPOS" width={96} height={96} style={{ objectFit: 'contain' }} />
            <span style={{ fontSize: 56, fontWeight: 800, letterSpacing: -1.5, color: 'var(--text)' }}>
              omar<span style={{ color: 'var(--accent)' }}>POS</span>
            </span>
          </div>
        </Reveal>
      </Section>

      <SiteFooter productLinks={NAV_LINKS} />
    </LandingFade>
    {/* Fuera de LandingFade a proposito: LandingFade anima con `transform`
        (translateY), y CUALQUIER transform en un ancestro -- incluso
        translateY(0) en reposo -- crea un containing block nuevo para sus
        descendientes position:fixed. El widget quedaba "fixed" respecto a
        LandingFade (alto = toda la pagina, ~7000px) en vez del viewport, y
        terminaba renderizado bien abajo del scroll, invisible. Mismo bug
        que .animate-fade-opacity ya evita a proposito (ver ese comentario
        en globals.css) -- ahi la solucion fue no usar transform; aca es mas
        simple sacar el widget de adentro del contenedor animado. */}
    <LandingChatWidget />
    </>
  );
}
