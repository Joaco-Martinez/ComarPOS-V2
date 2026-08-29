'use client';

import { useState } from 'react';
import {
  ScanBarcode, Wallet, Receipt, PieChart, CheckCircle2,
  Star, Tag, FileCheck2, RotateCcw, Building2, Truck, MapPin, TrendingUp, Users,
} from 'lucide-react';
import PhoneMockup from './PhoneMockup';
import DesktopMockup from './DesktopMockup';

const TABS = [
  {
    icon: ScanBarcode, label: 'Vender',
    heading: 'Cobrá en segundos, con o sin código de barras',
    desc: 'Escaneo por cámara o lector, venta por unidad o por kilo. Armá el combo justo, parado en el mostrador.',
    bullets: ['Código de barras y escaneo por cámara', 'Venta por unidad, por kilo o en combos', 'Pensado para usarse rápido, en el mostrador'],
  },
  {
    icon: Wallet, label: 'Cobrar',
    heading: 'Todos los medios de pago, en la misma venta',
    desc: 'Efectivo, tarjeta, QR o cuenta corriente. Combiná lo que haga falta, sin abrir una planilla aparte.',
    bullets: ['Efectivo, débito, crédito, QR y transferencia', 'Cuenta corriente con límite de crédito por cliente', 'Podés combinar más de un método en el mismo ticket'],
  },
  {
    icon: Receipt, label: 'Facturar',
    heading: 'La factura sale con CAE, en el momento',
    desc: 'Integración directa con AFIP/ARCA: obtiene el CAE al toque y agrega el QR fiscal. Si AFIP está caído, reintenta solo.',
    bullets: ['Factura y nota de crédito con CAE real', 'QR fiscal automático en cada comprobante', 'Reintento automático si AFIP no responde'],
  },
  {
    icon: PieChart, label: 'Negocio',
    heading: 'Vas a saber exactamente cómo te está yendo',
    desc: 'Ventas, rentabilidad, stock y caja. Docenas de reportes gerenciales, sin armar una sola planilla.',
    bullets: ['Ventas por vendedor, por hora y por sucursal', 'Rentabilidad por producto y por categoría', 'Alertas automáticas de stock bajo'],
  },
];

const MORE_FEATURES = [
  { icon: Star, label: 'Fidelización por puntos' },
  { icon: Tag, label: 'Promociones y descuentos' },
  { icon: FileCheck2, label: 'Remitos electrónicos' },
  { icon: RotateCcw, label: 'Devoluciones' },
  { icon: Building2, label: 'Multi-sucursal' },
  { icon: Truck, label: 'Compras y proveedores' },
  { icon: MapPin, label: 'Delivery con ruteo real' },
  { icon: TrendingUp, label: 'Finanzas y gastos recurrentes' },
  { icon: Users, label: 'Clientes y cuenta corriente' },
];

export default function ShowcaseTabs() {
  const [active, setActive] = useState(0);
  const tab = TABS[active];

  return (
    <div>
      <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {TABS.map(({ icon: Icon, label, heading, desc, bullets }, i) => (
            <button
              key={label}
              className={`showcase-tab-btn${i === active ? ' active' : ''}`}
              onClick={() => setActive(i)}
            >
              <div className="showcase-tab-icon"><Icon size={17} /></div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>{label}</div>
                {/* Las 4 pestañas se renderizan siempre (antes solo la
                    activa se montaba via `i === active &&`) -- un crawler
                    sin JS solo veía el heading/desc/bullets de la primera.
                    display:none oculta visualmente las inactivas sin
                    sacarlas del HTML, y como el toggle es none->block (no
                    unmount/remount), la animation sigue reproduciendose
                    igual que antes al cambiar de pestaña. */}
                <div style={{ marginTop: 8, display: i === active ? 'block' : 'none', animation: i === active ? 'fadeIn 0.3s ease' : undefined }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6, lineHeight: 1.35 }}>
                    {heading}
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10 }}>{desc}</p>
                  <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {bullets.map((b) => (
                      <li key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12.5, color: 'var(--text2)' }}>
                        <CheckCircle2 size={13} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} /> {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div style={{ flex: '1 1 460px', display: 'flex', justifyContent: 'center', paddingTop: 8, minWidth: 0 }}>
          <div className="device-stage" style={{ width: '100%', boxSizing: 'border-box' }}>
            <DesktopMockup />
            <div className="device-phone-overlay">
              <PhoneMockup active={active} onChange={setActive} />
            </div>
          </div>
        </div>
      </div>

      <p style={{
        textAlign: 'center', fontSize: 12.5, color: 'var(--text3)', marginTop: 8,
      }}>
        Anda igual de bien en la compu del mostrador que en el celular, sin instalar nada.
      </p>

      <div style={{ marginTop: 40, paddingTop: 40, borderTop: '1px solid var(--border)' }}>
        <p style={{
          textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text3)',
          letterSpacing: 1.5, marginBottom: 18, fontFamily: 'var(--mono)',
        }}>
          Y ADEMÁS
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {MORE_FEATURES.map(({ icon: Icon, label }) => (
            <span key={label} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 999, padding: '7px 14px', fontSize: 12.5, color: 'var(--text2)',
            }}>
              <Icon size={13} style={{ color: 'var(--accent)' }} /> {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
