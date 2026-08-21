'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Receipt } from 'lucide-react';

const ITEMS = [
  { name: 'Aceite 1.5L', price: '$2.100' },
  { name: 'Detergente x2', price: '$1.780' },
  { name: 'Pan', price: '$980' },
];
const TOTAL = '$4.860';

const PHASES: { key: 'armando' | 'emitiendo' | 'emitida'; ms: number }[] = [
  { key: 'armando', ms: 2400 },
  { key: 'emitiendo', ms: 1500 },
  { key: 'emitida', ms: 3400 },
];

export default function FiscalMoment() {
  const [phase, setPhase] = useState(0);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = typeof window !== 'undefined'
      && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion.current) {
      setPhase(2);
      return;
    }
    let cancelled = false;
    const run = (i: number) => {
      const timer = setTimeout(() => {
        if (cancelled) return;
        const next = (i + 1) % PHASES.length;
        setPhase(next);
        run(next);
      }, PHASES[i].ms);
      return timer;
    };
    const t = run(0);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  return (
    <div className="fiscal-card">
      <div className="fiscal-tab">VENTA #1284 · MOSTRADOR</div>

      {/* Armando la venta */}
      <div className={`fiscal-panel${phase === 0 ? ' active' : ''}`}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 16, marginTop: 4 }}>
          Armando la venta…
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {ITEMS.map((it) => (
            <div key={it.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--text2)' }}>
              <span>{it.name}</span>
              <span style={{ fontWeight: 700, color: 'var(--text)' }}>{it.price}</span>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px dashed var(--border2)', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Total</span>
          <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)' }}>{TOTAL}</span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 8 }}>Efectivo · Mostrador</div>
      </div>

      {/* Emitiendo a AFIP */}
      <div className={`fiscal-panel${phase === 1 ? ' active' : ''}`} style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24, marginTop: 4 }}>{TOTAL} · Factura B</div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <Loader2 size={30} className="animate-spin" style={{ color: 'var(--accent)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Emitiendo a AFIP…</div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 3 }}>Punto de venta 0003</div>
          </div>
          <div className="fiscal-progress" style={{ width: 140 }} />
        </div>
      </div>

      {/* Emitida */}
      <div className={`fiscal-panel${phase === 2 ? ' active' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, marginTop: 4 }}>
          <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Factura emitida</span>
        </div>
        <div style={{
          background: 'var(--surface2)', borderRadius: 12, padding: '12px 14px', marginBottom: 16,
        }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, letterSpacing: 0.5, fontFamily: 'var(--mono)' }}>CAE</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--mono)', marginTop: 2 }}>71305829384756</div>
          <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 4 }}>Vence 12/09/2026</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="fiscal-qr" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Factura B · {TOTAL}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--text3)', marginTop: 4 }}>
              <Receipt size={12} /> Lista para imprimir o mandar por WhatsApp
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
