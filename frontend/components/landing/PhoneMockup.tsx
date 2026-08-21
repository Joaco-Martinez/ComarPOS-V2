'use client';

import { useEffect, useRef } from 'react';
import {
  ScanBarcode, Wallet, Receipt, PieChart, Wifi, BatteryFull,
  TrendingUp, Package, ShoppingCart, CheckCircle2, Search, DollarSign,
} from 'lucide-react';

export const PHONE_SCREENS = [
  { key: 'vender', navLabel: 'Vender', navIcon: ScanBarcode },
  { key: 'cobrar', navLabel: 'Cobrar', navIcon: Wallet },
  { key: 'facturar', navLabel: 'Facturar', navIcon: Receipt },
  { key: 'negocio', navLabel: 'Negocio', navIcon: PieChart },
];

const PRODUCTS = [
  { name: 'Coca-Cola 500ml', price: '$1.200' },
  { name: 'Pan lactal', price: '$980' },
  { name: 'Yerba 1kg', price: '$3.450' },
  { name: 'Fideos 500g', price: '$890' },
];

const PAY_CHIPS = [
  { icon: DollarSign, label: 'Efectivo', selected: true },
  { icon: Wallet, label: 'Tarjeta', selected: false },
  { icon: Search, label: 'QR', selected: false },
  { icon: Receipt, label: 'Cta. cte.', selected: false },
];

const STAT_MINI = [
  { icon: TrendingUp, label: 'Ventas hoy', value: '$284.500', delta: '+12%', color: '#18C15E' },
  { icon: Wallet, label: 'Ticket prom.', value: '$6.180', delta: null, color: '#0D59E7' },
  { icon: Package, label: 'Productos vendidos', value: '46', delta: null, color: '#0D59E7' },
  { icon: CheckCircle2, label: 'Caja', value: 'Abierta', delta: null, color: '#18C15E' },
];

const AUTOPLAY_MS = 4200;

export default function PhoneMockup({
  active, onChange, autoplay = true,
}: {
  active: number;
  onChange: (i: number) => void;
  autoplay?: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (!autoplay) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => onChange((activeRef.current + 1) % PHONE_SCREENS.length), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [autoplay, onChange]);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = frameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `rotateX(${(-y * 8).toFixed(2)}deg) rotateY(${(x * 12).toFixed(2)}deg)`;
  };
  const handleLeave = () => {
    const el = frameRef.current;
    if (el) el.style.transform = 'rotateX(0deg) rotateY(0deg)';
  };

  return (
    <div className="phone-stage">
      <div className="phone-float">
        <div ref={frameRef} className="phone-frame" onMouseMove={handleMove} onMouseLeave={handleLeave}>
          <div className="phone-vol phone-vol-1" />
          <div className="phone-vol phone-vol-2" />
          <div className="phone-screen">
            <div className="phone-notch" />
            <div className="phone-statusbar">
              <span>9:41</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Wifi size={12} /> <BatteryFull size={14} />
              </span>
            </div>

            {/* Vender */}
            <div className={`phone-panel${active === 0 ? ' active' : ''}`}>
              <div style={{ padding: '0 14px 10px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, background: '#fff',
                  border: '1px solid rgba(13,89,231,0.1)', borderRadius: 12, padding: '9px 12px',
                }}>
                  <Search size={13} style={{ color: '#8791A3' }} />
                  <span style={{ fontSize: 11, color: '#8791A3' }}>Buscar o escanear…</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 14px' }}>
                {PRODUCTS.map((p) => (
                  <div key={p.name} style={{ background: '#fff', border: '1px solid rgba(13,89,231,0.08)', borderRadius: 12, padding: '9px 10px' }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 7, background: 'rgba(13,89,231,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6,
                    }}>
                      <Package size={11} style={{ color: '#0D59E7' }} />
                    </div>
                    <div style={{ fontSize: 10, color: '#0B1220', fontWeight: 600, lineHeight: 1.3 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#0D59E7', fontWeight: 800, marginTop: 3 }}>{p.price}</div>
                  </div>
                ))}
              </div>
              <div style={{
                position: 'absolute', left: 12, right: 12, bottom: 66,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'linear-gradient(135deg, #0D59E7 0%, #093C9D 100%)', borderRadius: 16,
                padding: '10px 14px', boxShadow: '0 10px 24px rgba(13,89,231,0.4)',
              }}>
                <span style={{ fontSize: 11, color: '#fff', fontWeight: 700 }}>3 productos</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fff', fontSize: 12, fontWeight: 800 }}>
                  $18.400 <ShoppingCart size={13} />
                </span>
              </div>
            </div>

            {/* Cobrar */}
            <div className={`phone-panel${active === 1 ? ' active' : ''}`}>
              <div style={{ textAlign: 'center', padding: '4px 14px 14px' }}>
                <div style={{ fontSize: 10, color: '#8791A3', fontWeight: 600 }}>Total a cobrar</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#0B1220' }}>$18.400</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 14px' }}>
                {PAY_CHIPS.map(({ icon: Icon, label, selected }) => (
                  <div key={label} style={{
                    display: 'flex', alignItems: 'center', gap: 7, borderRadius: 12, padding: '10px 12px',
                    background: selected ? 'rgba(13,89,231,0.08)' : '#fff',
                    border: selected ? '1.5px solid #0D59E7' : '1px solid rgba(13,89,231,0.08)',
                  }}>
                    <Icon size={13} style={{ color: selected ? '#0D59E7' : '#8791A3' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: selected ? '#0D59E7' : '#0B1220' }}>{label}</span>
                    {selected && <CheckCircle2 size={12} style={{ color: '#0D59E7', marginLeft: 'auto' }} />}
                  </div>
                ))}
              </div>
              <div style={{
                position: 'absolute', left: 12, right: 12, bottom: 66,
                background: 'linear-gradient(135deg, #0D59E7 0%, #093C9D 100%)', borderRadius: 16,
                padding: '11px 14px', textAlign: 'center',
                boxShadow: '0 10px 24px rgba(13,89,231,0.4)',
              }}>
                <span style={{ fontSize: 12, color: '#fff', fontWeight: 800 }}>Confirmar cobro</span>
              </div>
            </div>

            {/* Facturar */}
            <div className={`phone-panel${active === 2 ? ' active' : ''}`}>
              <div style={{ margin: '4px 20px 0', background: '#fff', borderRadius: 16, padding: '16px 16px 18px', border: '1px solid rgba(13,89,231,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#0B1220' }}>Almacén Don José</span>
                  <span style={{
                    fontSize: 9, fontWeight: 800, color: '#0D59E7', background: 'rgba(13,89,231,0.1)',
                    borderRadius: 999, padding: '2px 8px', fontFamily: 'var(--mono)',
                  }}>FACTURA B</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
                  {[
                    { name: 'Coca-Cola 500ml x2', price: '$2.400' },
                    { name: 'Yerba 1kg', price: '$3.450' },
                    { name: 'Fideos 500g x3', price: '$2.670' },
                  ].map((it) => (
                    <div key={it.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#5B6478' }}>
                      <span>{it.name}</span><span style={{ fontWeight: 700, color: '#0B1220' }}>{it.price}</span>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: '1px dashed rgba(13,89,231,0.2)', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#0B1220' }}>Total</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#0D59E7' }}>$18.400</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
                  <div className="fiscal-qr" style={{ width: 40, height: 40 }} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 700, color: '#18C15E' }}>
                      <CheckCircle2 size={10} /> Emitida ante AFIP
                    </div>
                    <div style={{ fontSize: 8, color: '#8791A3', fontFamily: 'var(--mono)', marginTop: 2 }}>CAE 71305829384756</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Negocio */}
            <div className={`phone-panel${active === 3 ? ' active' : ''}`}>
              <div style={{
                margin: '0 14px', borderRadius: 20, padding: '16px 18px', color: '#fff',
                background: 'linear-gradient(135deg, #0D59E7 0%, #093C9D 100%)',
              }}>
                <div style={{ fontSize: 11, opacity: 0.85 }}>Local Centro · Hoy</div>
                <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>Hola, Martina 👋</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, padding: 14 }}>
                {STAT_MINI.map(({ icon: Icon, label, value, delta, color }) => (
                  <div key={label} style={{ background: '#fff', border: '1px solid rgba(13,89,231,0.08)', borderRadius: 14, padding: '10px 12px' }}>
                    <Icon size={13} style={{ color }} />
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#0B1220', marginTop: 6 }}>{value}</div>
                    <div style={{ fontSize: 9, color: '#8791A3', marginTop: 1 }}>{label}</div>
                    {delta && <div style={{ fontSize: 9, fontWeight: 700, color: '#18C15E', marginTop: 2 }}>{delta}</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom nav */}
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, height: 56,
              display: 'flex', alignItems: 'center', justifyContent: 'space-around',
              background: '#fff', borderTop: '1px solid rgba(13,89,231,0.08)', zIndex: 3,
            }}>
              {PHONE_SCREENS.map(({ navIcon: NavIcon, navLabel }, i) => (
                <button
                  key={navLabel}
                  onClick={() => onChange(i)}
                  aria-label={navLabel}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    background: 'none', border: 'none', padding: 4,
                  }}
                >
                  <NavIcon size={16} style={{ color: i === active ? '#0D59E7' : '#8791A3' }} />
                  <span style={{ fontSize: 8, fontWeight: 700, color: i === active ? '#0D59E7' : '#8791A3' }}>{navLabel}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
