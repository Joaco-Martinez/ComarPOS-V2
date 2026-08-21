'use client';

import {
  ScanBarcode, Wallet, Receipt, PieChart, Settings, TrendingUp,
  Package, CheckCircle2, Search,
} from 'lucide-react';

const SIDEBAR_ICONS = [ScanBarcode, Wallet, Receipt, PieChart, Settings];

const STATS = [
  { icon: TrendingUp, label: 'Ventas hoy', value: '$284.500', color: '#18C15E' },
  { icon: Wallet, label: 'Ticket prom.', value: '$6.180', color: '#0D59E7' },
  { icon: Package, label: 'Productos vendidos', value: '46', color: '#0D59E7' },
  { icon: CheckCircle2, label: 'Caja', value: 'Abierta', color: '#18C15E' },
];

const ROWS = [
  { id: '#1284', desc: 'Coca-Cola 500ml x2, Yerba 1kg', total: '$18.400', status: 'Factura B' },
  { id: '#1283', desc: 'Pan lactal, Fideos 500g x3', total: '$4.860', status: 'Factura B' },
  { id: '#1282', desc: 'Aceite 1.5L, Detergente x2', total: '$3.880', status: 'Factura B' },
  { id: '#1281', desc: 'Yerba 1kg, Coca-Cola 500ml', total: '$4.650', status: 'Nota de crédito' },
];

export default function DesktopMockup() {
  return (
    <div className="desktop-frame">
      <div className="desktop-topbar">
        <span className="desktop-dot" style={{ background: '#FF5F57' }} />
        <span className="desktop-dot" style={{ background: '#FEBC2E' }} />
        <span className="desktop-dot" style={{ background: '#28C840' }} />
        <div className="desktop-url">app.comarpos.com/pos</div>
      </div>
      <div className="desktop-screen">
        <div className="desktop-sidebar">
          <div style={{
            width: 22, height: 22, borderRadius: 7, marginBottom: 6,
            background: 'linear-gradient(135deg, #0D59E7 0%, #093C9D 100%)',
          }} />
          {SIDEBAR_ICONS.map((Icon, i) => (
            <div key={i} className="desktop-sidebar-icon" style={i === 0 ? { background: '#0D59E7' } : undefined}>
              <Icon size={15} style={{ color: i === 0 ? '#fff' : '#8791A3' }} />
            </div>
          ))}
        </div>
        <div className="desktop-main">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 9.5, color: '#8791A3', fontWeight: 600 }}>Local Centro · Hoy</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0B1220' }}>Hola, Martina 👋</div>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, background: '#fff',
              border: '1px solid rgba(13,89,231,0.1)', borderRadius: 8, padding: '6px 10px',
            }}>
              <Search size={11} style={{ color: '#8791A3' }} />
              <span style={{ fontSize: 10, color: '#8791A3' }}>Buscar venta, producto…</span>
            </div>
          </div>

          <div className="desktop-stats-row" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            {STATS.map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="desktop-stat-card">
                <Icon size={13} style={{ color }} />
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0B1220', marginTop: 6 }}>{value}</div>
                <div style={{ fontSize: 9, color: '#8791A3', marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          <div className="desktop-table">
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#8791A3', marginBottom: 8 }}>ÚLTIMAS VENTAS</div>
            {ROWS.map((r) => (
              <div key={r.id} className="desktop-table-row">
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, color: '#0B1220' }}>{r.id} <span style={{ fontWeight: 500, color: '#8791A3' }}>· {r.desc}</span></span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, color: '#0D59E7', background: 'rgba(13,89,231,0.08)',
                    borderRadius: 999, padding: '2px 8px',
                  }}>{r.status}</span>
                  <span style={{ fontWeight: 800, color: '#0B1220' }}>{r.total}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
