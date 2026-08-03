import {
  ScanBarcode, Receipt, Boxes, Users, Wallet, BarChart3,
  Store, ArrowRight, CheckCircle2, ShoppingBag, PawPrint, Wrench,
  Cpu, Candy, Shirt, Hammer, Truck, Star, ClipboardList, TrendingUp,
  PieChart, Building2, RotateCcw, MapPin, Tag, CreditCard, DollarSign,
  Smartphone, RefreshCw, FileCheck2, ShieldCheck, Pill, BookOpen, Wine,
  Sparkles, Zap, Layers, Target,
} from 'lucide-react';
import Hero3DLoader from './Hero3DLoader';
import TiltCard from './TiltCard';
import Reveal from './Reveal';

// TODO: reemplazar por el número real (con código de país, sin +, ej: 5493511234567)
const WHATSAPP_NUMBER = '5490000000000';
const WHATSAPP_MESSAGE = '¡Hola! Quiero conocer más sobre ComarPOS para mi negocio.';
const waLink = (extra?: string) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(extra ?? WHATSAPP_MESSAGE)}`;

const NAV_LINKS = [
  { href: '#funcionalidades', label: 'Funcionalidades' },
  { href: '#rubros', label: 'Rubros' },
  { href: '#reportes', label: 'Reportes' },
  { href: '#preguntas', label: 'Preguntas frecuentes' },
];

const FEATURES = [
  { icon: ScanBarcode, title: 'Punto de venta rápido', desc: 'Código de barras, escaneo por cámara, venta por unidad o por kilo. Pensado para el mostrador.' },
  { icon: Receipt, title: 'Facturación electrónica AFIP', desc: 'Factura y nota de crédito con CAE en tiempo real, QR fiscal automático. Integración directa con ARCA.' },
  { icon: Boxes, title: 'Stock e inventario', desc: 'Múltiples depósitos, alertas de stock bajo y conteo de inventario con diferencias automáticas.' },
  { icon: Wallet, title: 'Caja y arqueo', desc: 'Apertura y cierre de caja por turno, con cálculo automático de sobrante o faltante.' },
  { icon: Users, title: 'Clientes y cuenta corriente', desc: 'Ficha completa, límite de crédito, historial de movimientos y bloqueo automático si se pasa del límite.' },
  { icon: Star, title: 'Fidelización por puntos', desc: 'Tus clientes suman puntos con cada compra y los canjean. Los puntos inactivos expiran solos.' },
  { icon: Truck, title: 'Compras y proveedores', desc: 'Ficha de proveedores, órdenes de compra con recepción parcial, historial de precios de compra.' },
  { icon: FileCheck2, title: 'Remitos electrónicos', desc: 'Remito digital con CAI propio o formulario preimpreso, con control de vencimiento automático.' },
  { icon: RotateCcw, title: 'Devoluciones', desc: 'Devolvé una venta con motivo y forma de reintegro. Revierte stock y cuenta corriente solo.' },
  { icon: TrendingUp, title: 'Finanzas y gastos recurrentes', desc: 'Ingresos y egresos categorizados. Los gastos fijos (alquiler, sueldos) se generan solos cada mes.' },
  { icon: Tag, title: 'Promociones', desc: 'Descuentos por producto, categoría o carrito completo, con vigencia y monto mínimo configurables.' },
  { icon: Building2, title: 'Multi-sucursal', desc: 'Varios locales o depósitos bajo un mismo sistema, con stock y caja independientes por sucursal.' },
  { icon: MapPin, title: 'Delivery con ruteo real', desc: 'Costo de envío calculado por distancia real en calle, no en línea recta. Seguimiento de estado.' },
  { icon: PieChart, title: 'Reportes gerenciales', desc: 'Ventas, rentabilidad, clientes, stock y flujo de caja. Decisiones con números, no a ojo.' },
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

const PAYMENT_METHODS = [
  { icon: DollarSign, label: 'Efectivo' },
  { icon: CreditCard, label: 'Tarjeta débito y crédito' },
  { icon: Smartphone, label: 'QR (Mercado Pago / QR Nación)' },
  { icon: RefreshCw, label: 'Transferencia' },
  { icon: FileCheck2, label: 'Cuenta corriente' },
];

const REPORT_GROUPS = [
  'Ventas: resumen, evolución, por vendedor, por hora, por sucursal',
  'Rentabilidad: margen por producto y por categoría',
  'Clientes: mejores clientes, LTV, inactivos, cobranza',
  'Inventario: stock muerto, rotación, valorización',
  'Compras: evolución de costos por proveedor',
  'Flujo de caja: cobros pendientes, burn rate',
  'Alertas de riesgo e insights automáticos',
];

const DIFFERENTIATORS = [
  { icon: Layers, title: 'Todo en un solo lugar', desc: 'Ventas, facturación, stock, caja y finanzas conectados entre sí. Nada de planillas sueltas ni sistemas que no se hablan.' },
  { icon: ShieldCheck, title: 'Facturación AFIP real', desc: 'No es un "próximamente": ya emite factura electrónica con CAE y reintenta solo si AFIP está caído.' },
  { icon: Zap, title: 'Se adapta a tu rubro', desc: 'Vendas por unidad, por kilo, en combos o con lista de precios propia por cliente, el sistema se ajusta a como vendés vos.' },
  { icon: Target, title: 'Crece con tu negocio', desc: 'Sumá sucursales, usuarios y stock sin migrar de sistema ni perder el historial.' },
];

const FAQS = [
  { q: '¿Necesito instalar algo?', a: 'No. ComarPOS es 100% web: se usa desde cualquier navegador, en la computadora del local, sin instalar nada especial.' },
  { q: '¿Emite factura electrónica de verdad?', a: 'Sí. Está integrado directo con los web services de AFIP/ARCA: obtiene el CAE en el momento y agrega el código QR fiscal al comprobante, como exige la normativa.' },
  { q: '¿Sirve para mi rubro específico?', a: 'Sí. No está armado para un solo tipo de comercio: se configura con tus categorías, tus precios y tu forma de vender (por unidad, por kilo o en combos).' },
  { q: '¿Puedo tener más de un local?', a: 'Sí, es multi-sucursal desde el diseño: cada local o depósito tiene su propio stock y caja, y podés comparar el rendimiento entre todos desde los reportes.' },
  { q: '¿Qué pasa si AFIP no responde?', a: 'La venta no se pierde: queda marcada como pendiente y el sistema reintenta solo, en segundo plano, hasta lograr la factura.' },
  { q: '¿Cómo empiezo?', a: 'Escribinos por WhatsApp, nos contás de tu negocio y coordinamos una demo sin compromiso.' },
];

function Section({ children, style, id }: { children: React.ReactNode; style?: React.CSSProperties; id?: string }) {
  return (
    <section id={id} style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px', ...style }}>
      {children}
    </section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1.5, marginBottom: 12, fontFamily: 'var(--mono)' }}>
      {children}
    </p>
  );
}

export default function LandingPage() {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', position: 'relative', overflowX: 'hidden' }}>
      {/* Grid bg */}
      <div style={{
        position: 'absolute', inset: 0, height: 720,
        backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
        backgroundSize: '48px 48px', opacity: 0.4, pointerEvents: 'none',
      }} />
      <div style={{ position: 'absolute', top: '5%', left: '50%', transform: 'translateX(-50%)', width: 720, height: 720, background: 'radial-gradient(circle, rgba(13,89,231,0.10) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Nav */}
      <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        <Section style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
            <img src="/brand/logo-horizontal-negativo.svg" alt="ComarPOS" className="brand-logo-dark" style={{ height: 30 }} />
            <img src="/brand/logo-horizontal-positivo.svg" alt="ComarPOS" className="brand-logo-light" style={{ height: 30 }} />
            <nav style={{ display: 'flex', gap: 20 }} className="hidden md:flex">
              {NAV_LINKS.map((l) => (
                <a key={l.href} href={l.href} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>{l.label}</a>
              ))}
            </nav>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <a href="/login" className="btn btn-ghost btn-sm">Iniciar sesión</a>
            <a href={waLink()} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm" style={{ gap: 6 }}>
              Pedir demo <ArrowRight size={14} />
            </a>
          </div>
        </Section>
      </header>

      {/* Hero */}
      <Section style={{ position: 'relative', textAlign: 'center', padding: '96px 24px 56px', animation: 'fadeIn 0.5s ease' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
          color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid var(--border2)',
          borderRadius: 999, padding: '6px 14px', marginBottom: 24, fontFamily: 'var(--mono)',
        }}>
          <Store size={13} /> SISTEMA DE GESTIÓN PARA COMERCIOS
        </div>
        <h1 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 20 }}>
          Un solo sistema para vender,<br />facturar y controlar tu negocio
        </h1>
        <p style={{ fontSize: 18, color: 'var(--text2)', maxWidth: 640, margin: '0 auto 36px', lineHeight: 1.6 }}>
          ComarPOS junta punto de venta, facturación electrónica AFIP, stock, caja, clientes y
          reportes gerenciales en un solo lugar. Sin planillas sueltas, sin sistemas que no se
          hablan entre sí.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 40 }}>
          <a href={waLink()} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-lg" style={{ gap: 8 }}>
            Quiero probarlo <ArrowRight size={16} />
          </a>
          <a href="#funcionalidades" className="btn btn-secondary btn-lg">Ver funcionalidades</a>
        </div>

        {/* Stat strip */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 0, flexWrap: 'wrap', maxWidth: 720, margin: '0 auto' }}>
          {[
            ['14+', 'módulos integrados'],
            ['AFIP', 'facturación electrónica real'],
            ['∞', 'sucursales y usuarios'],
          ].map(([n, l], i) => (
            <div key={l} style={{
              flex: '1 1 160px', padding: '16px 20px',
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{n}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>{l}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* 3D showcase */}
      <div style={{ position: 'relative', height: 440, margin: '0 0 24px' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <Hero3DLoader />
        </div>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end',
          justifyContent: 'center', paddingBottom: 20, pointerEvents: 'none',
        }}>
          <span style={{
            fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text3)',
            letterSpacing: 1, background: 'var(--bg)', padding: '4px 12px', borderRadius: 999,
            border: '1px solid var(--border)',
          }}>
            MOVÉ EL MOUSE · TODO TU NEGOCIO, EN UNA SOLA PIEZA
          </span>
        </div>
      </div>

      {/* Business types */}
      <Section id="rubros" style={{ padding: '24px 24px 80px', position: 'relative' }}>
        <Reveal>
          <Eyebrow>UN SISTEMA, CUALQUIER RUBRO</Eyebrow>
          <h2 style={{ fontSize: 28, fontWeight: 800, textAlign: 'center', marginBottom: 32, letterSpacing: '-0.01em' }}>
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

      {/* Features */}
      <Section id="funcionalidades" style={{ padding: '0 24px 96px', position: 'relative' }}>
        <Eyebrow>FUNCIONALIDADES</Eyebrow>
        <h2 style={{ fontSize: 32, fontWeight: 800, textAlign: 'center', marginBottom: 12, letterSpacing: '-0.01em' }}>
          Todo lo que tu negocio necesita
        </h2>
        <p style={{ fontSize: 15, color: 'var(--text3)', textAlign: 'center', marginBottom: 48 }}>
          Catorce módulos conectados entre sí. Sin integraciones raras.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {FEATURES.map(({ icon: Icon, title, desc }, i) => (
            <Reveal key={title} delay={(i % 3) * 0.08}>
              <TiltCard className="card" style={{ padding: 22, height: '100%' }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10, background: 'var(--accent-dim)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
                }}>
                  <Icon size={18} style={{ color: 'var(--accent)' }} />
                </div>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{title}</h3>
                <p style={{ fontSize: 12.5, color: 'var(--text3)', lineHeight: 1.6 }}>{desc}</p>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* Payment methods */}
      <Section style={{ padding: '0 24px 96px' }}>
        <Reveal>
          <div className="card" style={{ padding: '40px 32px', textAlign: 'center' }}>
            <Eyebrow>COBRÁS COMO VOS QUIERAS</Eyebrow>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 28, letterSpacing: '-0.01em' }}>
              Todos los medios de pago, en una misma venta
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
              {PAYMENT_METHODS.map(({ icon: Icon, label }) => (
                <span key={label} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'var(--surface2)', border: '1px solid var(--border2)',
                  borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text)',
                }}>
                  <Icon size={16} style={{ color: 'var(--accent2)' }} /> {label}
                </span>
              ))}
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 20, maxWidth: 480, margin: '20px auto 0' }}>
              Podés combinar varios métodos en un mismo ticket, incluida la cuenta corriente del cliente.
            </p>
          </div>
        </Reveal>
      </Section>

      {/* Reports spotlight */}
      <Section id="reportes" style={{ padding: '0 24px 96px' }}>
        <Reveal>
          <div style={{
            display: 'flex', gap: 40, flexWrap: 'wrap', alignItems: 'center',
            background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface2) 100%)',
            border: '1px solid var(--border)', borderRadius: 16, padding: '48px 40px',
          }}>
            <div style={{ flex: '1 1 320px' }}>
              <Eyebrow>REPORTES Y ANALYTICS</Eyebrow>
              <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 14, letterSpacing: '-0.01em' }}>
                Decisiones con números, no a ojo
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 4 }}>
                Docenas de reportes gerenciales listos para usar, organizados por tema.
              </p>
            </div>
            <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {REPORT_GROUPS.map((r) => (
                <div key={r} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
                  <BarChart3 size={15} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} /> {r}
                </div>
              ))}
            </div>
          </div>
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
              <div>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, background: 'var(--accent-dim)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
                }}>
                  <Icon size={20} style={{ color: 'var(--accent)' }} />
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6 }}>{desc}</p>
              </div>
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

      {/* Why card / CTA intermedio */}
      <Section style={{ padding: '0 24px 96px' }}>
        <div className="card" style={{
          padding: '48px 40px', display: 'flex', gap: 40, flexWrap: 'wrap',
          alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface2) 100%)',
        }}>
          <div style={{ flex: '1 1 320px' }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 14, letterSpacing: '-0.01em' }}>
              Andá creciendo sin migrar de sistema
            </h2>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                'Configurás rubros, categorías y precios como vos vendés',
                'Multi-sucursal y multi-usuario con permisos por rol',
                'Vendé por unidad, por kilo o armá combos y kits',
                'Sumá vendedores, sucursales y stock sin perder historial',
              ].map((t) => (
                <li key={t} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, color: 'var(--text2)' }}>
                  <CheckCircle2 size={16} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} /> {t}
                </li>
              ))}
            </ul>
          </div>
          <a href={waLink('¡Hola! Quiero pedir una demo de ComarPOS.')} target="_blank" rel="noopener noreferrer"
            className="btn btn-primary btn-lg" style={{ gap: 8, flexShrink: 0 }}>
            Pedir una demo <ArrowRight size={16} />
          </a>
        </div>
      </Section>

      {/* Final CTA */}
      <Section style={{ padding: '0 24px 100px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 30, fontWeight: 800, marginBottom: 14, letterSpacing: '-0.01em' }}>
          ¿Le damos una vuelta a cómo vendés?
        </h2>
        <p style={{ fontSize: 15, color: 'var(--text3)', marginBottom: 28, maxWidth: 480, margin: '0 auto 28px' }}>
          Contanos de tu negocio y te mostramos ComarPOS funcionando, sin compromiso.
        </p>
        <a href={waLink()} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-lg" style={{ gap: 8 }}>
          Escribinos por WhatsApp <ArrowRight size={16} />
        </a>
      </Section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '40px 24px 24px', position: 'relative' }}>
        <Section style={{ display: 'flex', gap: 32, flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ maxWidth: 280 }}>
            <img src="/brand/logo-horizontal-negativo.svg" alt="ComarPOS" className="brand-logo-dark" style={{ height: 26, marginBottom: 12 }} />
            <img src="/brand/logo-horizontal-positivo.svg" alt="ComarPOS" className="brand-logo-light" style={{ height: 26, marginBottom: 12 }} />
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
