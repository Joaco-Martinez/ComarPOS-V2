/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useRef, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import { clientName, fmtDate, fmtMoney, normalizeArray, num } from '@/lib/helpers';
import { todayInputAR, firstDayOfMonthAR } from '@/lib/dateAR';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import { Download, AlertTriangle, Lightbulb } from 'lucide-react';

const COLORS = ['#0D59E7', '#00B4DB', '#18C15E', '#F39C12', '#6474BB', '#EF4444', '#2ECC71', '#9B59B6'];

const TABS = [
  { key: 'ventas',        label: 'Ventas' },
  { key: 'rentabilidad',  label: 'Rentabilidad' },
  { key: 'clientes',      label: 'Clientes' },
  { key: 'inventario',    label: 'Inventario' },
  { key: 'compras',       label: 'Compras' },
  { key: 'cashflow',      label: 'Cashflow' },
  { key: 'insights',      label: 'Insights' },
];

const tooltipStyle = { background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 };
const axisStyle = { fontSize: 10, fill: 'var(--text3)', fontFamily: 'JetBrains Mono' };

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)', color: color ?? 'var(--accent)', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function SimpleTable({ cols, rows }: { cols: { key: string; label: string; mono?: boolean; money?: boolean }[]; rows: any[] }) {
  if (!rows?.length) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Sin datos</div>;
  return (
    <div className="table-wrap">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {cols.map((c) => (
              <th key={c.key} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              {cols.map((c) => (
                <td key={c.key} style={{ padding: '8px 12px', fontFamily: c.mono ? 'var(--mono)' : undefined, color: c.mono ? 'var(--text2)' : 'var(--text)' }}>
                  {c.money ? fmtMoney(num(r[c.key])) : (r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportesPage() {
  const [tab, setTab] = useState('ventas');
  const [from, setFrom] = useState(firstDayOfMonthAR());
  const [to, setTo] = useState(todayInputAR());
  const loaded = useRef<Set<string>>(new Set());

  // Per-tab data
  const [ventas, setVentas] = useState<any>(null);
  const [rentabilidad, setRentabilidad] = useState<any>(null);
  const [clientes, setClientes] = useState<any>(null);
  const [inventario, setInventario] = useState<any>(null);
  const [compras, setCompras] = useState<any>(null);
  const [cashflow, setCashflow] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);

  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const setLoad = (k: string, v: boolean) => setLoading((p) => ({ ...p, [k]: v }));

  const params = { from, to };

  const loadVentas = async () => {
    setLoad('ventas', true);
    try {
      const [summary, trend, byPayment, byHour, byWeekday, byEmployee, byLocation, discounts] = await Promise.all([
        api.get('/analytics/sales/summary', { params }).catch(() => ({ data: {} })),
        api.get('/analytics/sales/trend', { params }).catch(() => ({ data: [] })),
        api.get('/analytics/sales/by-payment-method', { params }).catch(() => ({ data: [] })),
        api.get('/analytics/sales/by-hour', { params }).catch(() => ({ data: [] })),
        api.get('/analytics/sales/by-weekday', { params }).catch(() => ({ data: [] })),
        api.get('/analytics/sales/by-employee', { params }).catch(() => ({ data: [] })),
        api.get('/analytics/sales/by-location', { params }).catch(() => ({ data: [] })),
        api.get('/analytics/sales/discounts', { params }).catch(() => ({ data: {} })),
      ]);
      setVentas({
        summary: summary.data,
        trend: normalizeArray(trend.data),
        byPayment: normalizeArray(byPayment.data),
        byHour: normalizeArray(byHour.data),
        byWeekday: normalizeArray(byWeekday.data),
        byEmployee: normalizeArray<any>(byEmployee.data).map((r: any) => ({
          employeeName: r.user?.name ?? '—', total: r.revenue, count: r.salesCount,
        })),
        byLocation: normalizeArray<any>(byLocation.data).map((r: any) => ({
          locationName: r.location?.name ?? 'Sin sucursal', total: r.revenue, count: r.salesCount,
        })),
        discounts: discounts.data,
      });
    } finally { setLoad('ventas', false); }
  };

  const loadRentabilidad = async () => {
    setLoad('rentabilidad', true);
    try {
      const [summary, byProduct, byCategory, lowMargin] = await Promise.all([
        api.get('/analytics/profitability/summary', { params }).catch(() => ({ data: {} })),
        api.get('/analytics/profitability/by-product', { params }).catch(() => ({ data: [] })),
        api.get('/analytics/profitability/by-category', { params }).catch(() => ({ data: [] })),
        api.get('/analytics/profitability/low-margin-products', { params }).catch(() => ({ data: [] })),
      ]);
      setRentabilidad({
        summary: summary.data,
        byProduct: normalizeArray<any>(byProduct.data).map((r: any) => ({
          productName: r.product?.name ?? '—', grossProfit: r.profit, margin: r.marginPercent,
        })),
        byCategory: normalizeArray<any>(byCategory.data).map((r: any) => ({
          categoryName: r.categoryName ?? 'Sin categoría', grossProfit: r.profit, margin: r.marginPercent,
        })),
        lowMargin: normalizeArray<any>(lowMargin.data).map((r: any) => ({
          productName: r.product?.name ?? '—', margin: r.marginPercent, revenue: r.revenue,
        })),
      });
    } finally { setLoad('rentabilidad', false); }
  };

  const loadClientes = async () => {
    setLoad('clientes', true);
    try {
      const [top, newVsReturning, inactive, debtAging] = await Promise.all([
        api.get('/analytics/clients/top', { params }).catch(() => ({ data: [] })),
        api.get('/analytics/clients/new-vs-returning', { params }).catch(() => ({ data: {} })),
        api.get('/analytics/clients/inactive').catch(() => ({ data: [] })),
        api.get('/analytics/clients/debt-aging').catch(() => ({ data: [] })),
      ]);
      setClientes({
        top: normalizeArray<any>(top.data).map((r: any) => ({
          clientName: clientName(r.client), total: r.revenue, count: r.salesCount,
        })),
        newVsReturning: newVsReturning.data,
        inactive: normalizeArray<any>(inactive.data).map((r: any) => ({
          clientName: clientName(r.client),
          lastPurchase: r.lastSaleDate ? fmtDate(r.lastSaleDate) : 'Nunca compró',
          total: r.lastSaleAmount ?? 0,
        })),
        debtAging: (debtAging.data?.details ?? []).map((r: any) => ({
          clientName: clientName(r.client), debt: r.balance, daysOverdue: r.daysSinceLastDebt ?? '—',
        })),
      });
    } finally { setLoad('clientes', false); }
  };

  const loadInventario = async () => {
    setLoad('inventario', true);
    try {
      const [value, deadStock, lowStock, rotation] = await Promise.all([
        api.get('/analytics/inventory/value').catch(() => ({ data: {} })),
        api.get('/analytics/inventory/dead-stock').catch(() => ({ data: [] })),
        api.get('/analytics/inventory/low-stock').catch(() => ({ data: [] })),
        api.get('/analytics/inventory/rotation', { params }).catch(() => ({ data: [] })),
      ]);
      setInventario({
        value: value.data,
        deadStock: normalizeArray<any>(deadStock.data).map((r: any) => ({
          productName: r.product?.name ?? '—', stock: r.totalStock, lastSale: 'Sin ventas',
        })),
        lowStock: normalizeArray<any>(lowStock.data).map((r: any) => ({
          productName: r.product?.name ?? '—', stock: r.stockLocal, minStock: r.minStockLocal,
        })),
        rotation: normalizeArray<any>(rotation.data).map((r: any) => ({
          productName: r.product?.name ?? '—', rotationRate: r.rotationIndex, unitsSold: r.qtySold, avgStock: r.currentStock,
        })),
      });
    } finally { setLoad('inventario', false); }
  };

  const loadCompras = async () => {
    setLoad('compras', true);
    try {
      const [summary, vsSales] = await Promise.all([
        api.get('/analytics/purchases/summary', { params }).catch(() => ({ data: {} })),
        api.get('/analytics/purchases/vs-sales', { params }).catch(() => ({ data: [] })),
      ]);
      setCompras({
        summary: summary.data,
        vsSales: normalizeArray(vsSales.data),
      });
    } finally { setLoad('compras', false); }
  };

  const loadCashflow = async () => {
    setLoad('cashflow', true);
    try {
      const [summary, trend, pendingReceivables, riskAlerts] = await Promise.all([
        api.get('/analytics/cashflow/summary', { params }).catch(() => ({ data: {} })),
        api.get('/analytics/cashflow/trend', { params }).catch(() => ({ data: [] })),
        api.get('/analytics/cashflow/pending-receivables').catch(() => ({ data: [] })),
        api.get('/analytics/risk-alerts').catch(() => ({ data: [] })),
      ]);
      setCashflow({
        summary: summary.data,
        trend: normalizeArray(trend.data),
        pendingReceivables: (pendingReceivables.data?.clients ?? []).map((r: any) => ({
          clientName: clientName(r), amount: r.balance,
          daysOverdue: r.lastDebtDate ? Math.floor((Date.now() - new Date(r.lastDebtDate).getTime()) / 86400000) : '—',
        })),
        riskAlerts: normalizeArray(riskAlerts.data),
      });
    } finally { setLoad('cashflow', false); }
  };

  const loadInsights = async () => {
    setLoad('insights', true);
    try {
      const [ins, growth] = await Promise.all([
        api.get('/analytics/insights').catch(() => ({ data: [] })),
        api.get('/analytics/growth-opportunities').catch(() => ({ data: [] })),
      ]);
      setInsights({
        insights: normalizeArray(ins.data),
        growth: normalizeArray(growth.data),
      });
    } finally { setLoad('insights', false); }
  };

  const loaders: Record<string, () => void> = {
    ventas: loadVentas,
    rentabilidad: loadRentabilidad,
    clientes: loadClientes,
    inventario: loadInventario,
    compras: loadCompras,
    cashflow: loadCashflow,
    insights: loadInsights,
  };

  // Load tab on activation (lazy). Reload date-sensitive tabs when dates change.
  useEffect(() => {
    loaded.current.delete(tab);
    loaded.current.add(tab);
    loaders[tab]?.();
  }, [tab]);

  const DATE_SENSITIVE = ['ventas', 'rentabilidad', 'compras', 'cashflow'];
  useEffect(() => {
    DATE_SENSITIVE.filter((t) => loaded.current.has(t)).forEach((t) => loaders[t]?.());
  }, [from, to]);

  const downloadExcel = async () => {
    try {
      const res = await api.get('/exports/sales', { params: { fromDate: from, toDate: to }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `ventas-${from}-${to}.xlsx`; a.click();
    } catch {}
  };

  const isLoading = loading[tab];

  return (
    <AppLayout
      title="Reportes"
      subtitle="Análisis de negocio y rendimiento"
      actions={
        <button onClick={downloadExcel} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
          <Download size={13} /> Exportar Excel
        </button>
      }
    >
      {/* Date filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150, fontSize: 13 }} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150, fontSize: 13 }} />
        <button onClick={() => { setFrom(firstDayOfMonthAR()); setTo(todayInputAR()); }} className="btn btn-secondary btn-sm">Este mes</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="btn btn-ghost btn-sm"
            style={{
              borderRadius: '6px 6px 0 0',
              borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t.key ? 'var(--accent)' : 'var(--text3)',
              fontWeight: tab === t.key ? 700 : 500,
              fontSize: 13,
              paddingBottom: 8,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : (
        <>
          {/* ── VENTAS ── */}
          {tab === 'ventas' && ventas && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 12 }}>
                <StatCard label="Total ventas" value={fmtMoney(num(ventas.summary?.total ?? ventas.summary?.revenue))} />
                <StatCard label="Ticket promedio" value={fmtMoney(num(ventas.summary?.averageTicket ?? ventas.summary?.avgTicket))} color="var(--accent2)" />
                <StatCard label="Transacciones" value={String(num(ventas.summary?.count ?? ventas.summary?.transactions ?? ventas.summary?.salesCount))} color="var(--accent3)" />
                <StatCard label="Descuentos" value={fmtMoney(num(ventas.discounts?.totalDiscounts ?? ventas.discounts?.total ?? ventas.discounts?.totalDiscountGiven))} color="var(--success)" />
              </div>

              <div className="grid-responsive" style={{ ['--gtc' as any]: '1.5fr 1fr', gap: 16 }}>
                <div className="card" style={{ padding: '18px 16px' }}>
                  <div className="section-title" style={{ fontSize: 13, marginBottom: 14 }}>Tendencia de ventas</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={ventas.trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,187,0.1)" />
                      <XAxis dataKey="period" tick={axisStyle} axisLine={false} tickLine={false} />
                      <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [fmtMoney(v), 'Ventas']} />
                      <Bar dataKey="revenue" fill="#0D59E7" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="card" style={{ padding: '18px 16px' }}>
                  <div className="section-title" style={{ fontSize: 13, marginBottom: 14 }}>Por método de pago</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={ventas.byPayment} dataKey="totalAmount" nameKey="method" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }: any) => `${name} ${((percent ?? 0)*100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                        {ventas.byPayment.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => fmtMoney(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid-responsive" style={{ gap: 16 }}>
                <div className="card" style={{ padding: '18px 16px' }}>
                  <div className="section-title" style={{ fontSize: 13, marginBottom: 14 }}>Por hora del día</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={ventas.byHour}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,187,0.1)" />
                      <XAxis dataKey="hour" tick={axisStyle} axisLine={false} tickLine={false} />
                      <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="salesCount" fill="#00B4DB" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="card" style={{ padding: '18px 16px' }}>
                  <div className="section-title" style={{ fontSize: 13, marginBottom: 14 }}>Por día de semana</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={ventas.byWeekday}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,187,0.1)" />
                      <XAxis dataKey="dayName" tick={axisStyle} axisLine={false} tickLine={false} />
                      <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="revenue" fill="#18C15E" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid-responsive" style={{ gap: 16 }}>
                <div className="card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Por empleado</div>
                  <SimpleTable
                    cols={[{ key: 'employeeName', label: 'Empleado' }, { key: 'total', label: 'Total', money: true }, { key: 'count', label: 'Ventas', mono: true }]}
                    rows={ventas.byEmployee}
                  />
                </div>
                <div className="card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Por sucursal</div>
                  <SimpleTable
                    cols={[{ key: 'locationName', label: 'Sucursal' }, { key: 'total', label: 'Total', money: true }, { key: 'count', label: 'Ventas', mono: true }]}
                    rows={ventas.byLocation}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── RENTABILIDAD ── */}
          {tab === 'rentabilidad' && rentabilidad && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 12 }}>
                <StatCard label="Ingresos" value={fmtMoney(num(rentabilidad.summary?.revenue ?? rentabilidad.summary?.totalRevenue))} />
                <StatCard label="Costo" value={fmtMoney(num(rentabilidad.summary?.cost ?? rentabilidad.summary?.totalCost ?? rentabilidad.summary?.cogs))} color="var(--accent3)" />
                <StatCard label="Ganancia bruta" value={fmtMoney(num(rentabilidad.summary?.grossProfit))} color="var(--success)" />
                <StatCard label="Margen" value={`${num(rentabilidad.summary?.grossMargin ?? rentabilidad.summary?.margin ?? rentabilidad.summary?.grossMarginPercent).toFixed(1)}%`} color="var(--accent2)" />
              </div>

              <div className="grid-responsive" style={{ gap: 16 }}>
                <div className="card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Top productos por rentabilidad</div>
                  <SimpleTable
                    cols={[{ key: 'productName', label: 'Producto' }, { key: 'grossProfit', label: 'Ganancia', money: true }, { key: 'margin', label: 'Margen %', mono: true }]}
                    rows={rentabilidad.byProduct.slice(0, 10)}
                  />
                </div>
                <div className="card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Por categoría</div>
                  <SimpleTable
                    cols={[{ key: 'categoryName', label: 'Categoría' }, { key: 'grossProfit', label: 'Ganancia', money: true }, { key: 'margin', label: 'Margen %', mono: true }]}
                    rows={rentabilidad.byCategory}
                  />
                </div>
              </div>

              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}>
                  <AlertTriangle size={14} style={{ color: 'var(--accent3)' }} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>Productos de bajo margen</span>
                </div>
                <SimpleTable
                  cols={[{ key: 'productName', label: 'Producto' }, { key: 'margin', label: 'Margen %', mono: true }, { key: 'revenue', label: 'Ingresos', money: true }]}
                  rows={rentabilidad.lowMargin}
                />
              </div>
            </div>
          )}

          {/* ── CLIENTES ── */}
          {tab === 'clientes' && clientes && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="grid-responsive" style={{ ['--gtc' as any]: '1.5fr 1fr', gap: 16 }}>
                <div className="card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Mejores clientes</div>
                  <SimpleTable
                    cols={[{ key: 'clientName', label: 'Cliente' }, { key: 'total', label: 'Total compras', money: true }, { key: 'count', label: 'Transacciones', mono: true }]}
                    rows={clientes.top}
                  />
                </div>
                <div className="card" style={{ padding: '18px 16px' }}>
                  <div className="section-title" style={{ fontSize: 13, marginBottom: 14 }}>Nuevos vs recurrentes</div>
                  {clientes.newVsReturning && (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Nuevos', value: num(clientes.newVsReturning.newClients ?? clientes.newVsReturning.new) },
                            { name: 'Recurrentes', value: num(clientes.newVsReturning.returningClients ?? clientes.newVsReturning.returning) },
                          ]}
                          dataKey="value"
                          nameKey="name"
                          cx="50%" cy="50%" outerRadius={75}
                          label={({ name, percent }: any) => `${name} ${((percent ?? 0)*100).toFixed(0)}%`}
                          labelLine={false}
                          style={{ fontSize: 10 }}
                        >
                          <Cell fill="#0D59E7" />
                          <Cell fill="#18C15E" />
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="grid-responsive" style={{ gap: 16 }}>
                <div className="card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Clientes inactivos</div>
                  <SimpleTable
                    cols={[{ key: 'clientName', label: 'Cliente' }, { key: 'lastPurchase', label: 'Última compra', mono: true }, { key: 'total', label: 'Total histórico', money: true }]}
                    rows={clientes.inactive}
                  />
                </div>
                <div className="card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Antigüedad de deuda</div>
                  <SimpleTable
                    cols={[{ key: 'clientName', label: 'Cliente' }, { key: 'debt', label: 'Deuda', money: true }, { key: 'daysOverdue', label: 'Días venc.', mono: true }]}
                    rows={clientes.debtAging}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── INVENTARIO ── */}
          {tab === 'inventario' && inventario && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 12 }}>
                <StatCard label="Valor total inventario" value={fmtMoney(num(inventario.value?.totalValue ?? inventario.value?.value ?? inventario.value?.summary?.totalCostValue))} />
                <StatCard label="Productos en stock" value={String(num(inventario.value?.productCount ?? inventario.value?.count ?? inventario.value?.summary?.productCount))} color="var(--accent2)" />
                <StatCard label="Stock muerto (items)" value={String(inventario.deadStock?.length ?? 0)} color="var(--accent3)" />
                <StatCard label="Bajo stock (items)" value={String(inventario.lowStock?.length ?? 0)} color="var(--success)" />
              </div>

              <div className="grid-responsive" style={{ gap: 16 }}>
                <div className="card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}>
                    <AlertTriangle size={14} style={{ color: 'var(--accent3)' }} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Stock muerto</span>
                  </div>
                  <SimpleTable
                    cols={[{ key: 'productName', label: 'Producto' }, { key: 'stock', label: 'Stock', mono: true }, { key: 'lastSale', label: 'Última venta', mono: true }]}
                    rows={inventario.deadStock}
                  />
                </div>
                <div className="card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}>
                    <AlertTriangle size={14} style={{ color: '#F39C12' }} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Bajo stock</span>
                  </div>
                  <SimpleTable
                    cols={[{ key: 'productName', label: 'Producto' }, { key: 'stock', label: 'Stock actual', mono: true }, { key: 'minStock', label: 'Mínimo', mono: true }]}
                    rows={inventario.lowStock}
                  />
                </div>
              </div>

              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Rotación de inventario</div>
                <SimpleTable
                  cols={[{ key: 'productName', label: 'Producto' }, { key: 'rotationRate', label: 'Rotación', mono: true }, { key: 'unitsSold', label: 'Unidades vendidas', mono: true }, { key: 'avgStock', label: 'Stock promedio', mono: true }]}
                  rows={inventario.rotation}
                />
              </div>
            </div>
          )}

          {/* ── COMPRAS ── */}
          {tab === 'compras' && compras && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 12 }}>
                <StatCard label="Total compras" value={fmtMoney(num(compras.summary?.total ?? compras.summary?.totalCost ?? compras.summary?.totalSpent))} />
                <StatCard label="Órdenes" value={String(num(compras.summary?.count ?? compras.summary?.orders ?? compras.summary?.purchaseCount))} color="var(--accent2)" />
                <StatCard label="Costo promedio" value={fmtMoney(num(compras.summary?.averageOrder ?? compras.summary?.avgOrder ?? compras.summary?.avgPurchaseAmount))} color="var(--accent3)" />
              </div>

              <div className="card" style={{ padding: '18px 16px' }}>
                <div className="section-title" style={{ fontSize: 13, marginBottom: 14 }}>Compras vs Ventas</div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={compras.vsSales}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,187,0.1)" />
                    <XAxis dataKey="period" tick={axisStyle} axisLine={false} tickLine={false} />
                    <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => fmtMoney(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="purchases" name="Compras" fill="#EF4444" radius={[3,3,0,0]} />
                    <Bar dataKey="salesRevenue" name="Ventas" fill="#0D59E7" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── CASHFLOW ── */}
          {tab === 'cashflow' && cashflow && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 12 }}>
                <StatCard label="Ingresos" value={fmtMoney(num(cashflow.summary?.inflows ?? cashflow.summary?.income ?? cashflow.summary?.totalIncome))} color="var(--success)" />
                <StatCard label="Egresos" value={fmtMoney(num(cashflow.summary?.outflows ?? cashflow.summary?.expenses ?? cashflow.summary?.totalExpenses))} color="var(--accent3)" />
                <StatCard label="Balance neto" value={fmtMoney(num(cashflow.summary?.netCashflow ?? cashflow.summary?.net))} />
                <StatCard label="Cobranzas pendientes" value={fmtMoney(cashflow.pendingReceivables.reduce((a: number, r: any) => a + num(r.amount ?? r.debt), 0))} color="var(--accent2)" />
              </div>

              <div className="card" style={{ padding: '18px 16px' }}>
                <div className="section-title" style={{ fontSize: 13, marginBottom: 14 }}>Tendencia de cashflow</div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={cashflow.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,187,0.1)" />
                    <XAxis dataKey="period" tick={axisStyle} axisLine={false} tickLine={false} />
                    <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => fmtMoney(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="income" name="Ingresos" stroke="#18C15E" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="expenses" name="Egresos" stroke="#EF4444" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="net" name="Neto" stroke="#0D59E7" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="grid-responsive" style={{ gap: 16 }}>
                <div className="card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px 10px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)' }}>Cobranzas pendientes</div>
                  <SimpleTable
                    cols={[{ key: 'clientName', label: 'Cliente' }, { key: 'amount', label: 'Monto', money: true }, { key: 'daysOverdue', label: 'Días', mono: true }]}
                    rows={cashflow.pendingReceivables}
                  />
                </div>
                <div className="card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}>
                    <AlertTriangle size={14} style={{ color: '#EF4444' }} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Alertas de riesgo</span>
                  </div>
                  {cashflow.riskAlerts.length === 0 ? (
                    <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Sin alertas</div>
                  ) : (
                    <div style={{ padding: '8px 0' }}>
                      {cashflow.riskAlerts.map((alert: any, i: number) => (
                        <div key={i} style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <AlertTriangle size={13} style={{ color: '#EF4444', flexShrink: 0, marginTop: 2 }} />
                          <span style={{ color: 'var(--text2)' }}>{typeof alert === 'string' ? alert : (alert.message ?? alert.description ?? JSON.stringify(alert))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── INSIGHTS ── */}
          {tab === 'insights' && insights && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {insights.insights.length > 0 && (
                <div>
                  <div className="section-title" style={{ marginBottom: 12 }}>Insights automáticos</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 12 }}>
                    {insights.insights.map((ins: any, i: number) => (
                      <div key={i} className="card" style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <Lightbulb size={16} style={{ color: '#F39C12', flexShrink: 0, marginTop: 2 }} />
                        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                          {typeof ins === 'string' ? ins : (ins.message ?? ins.description ?? ins.title ?? JSON.stringify(ins))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {insights.growth.length > 0 && (
                <div>
                  <div className="section-title" style={{ marginBottom: 12 }}>Oportunidades de crecimiento</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 12 }}>
                    {insights.growth.map((g: any, i: number) => (
                      <div key={i} className="card" style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start', borderLeft: '3px solid var(--success)' }}>
                        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                          {typeof g === 'string' ? g : (g.message ?? g.description ?? g.title ?? JSON.stringify(g))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {insights.insights.length === 0 && insights.growth.length === 0 && (
                <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
                  <Lightbulb size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                  No hay insights disponibles por el momento
                </div>
              )}
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}
