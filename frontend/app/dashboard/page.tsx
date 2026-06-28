/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import { fmtMoney, normalizeArray, num } from '@/lib/helpers';
import { formatShortDateAR, todayInputAR } from '@/lib/dateAR';
import type { Sale } from '@/types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import {
  TrendingUp, ShoppingCart, Receipt, AlertTriangle, ArrowUpRight,
  CreditCard, TrendingDown, RefreshCcw,
} from 'lucide-react';

interface DailyStat { date: string; revenue: number; count: number }

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up = pct >= 0;
  return (
    <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: up ? 'var(--success)' : 'var(--danger)', background: up ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', borderRadius: 4, padding: '2px 5px', marginLeft: 6 }}>
      {up ? '+' : ''}{pct.toFixed(1)}%
    </span>
  );
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [dash, setDash] = useState<any>(null);
  const [todaySales, setTodaySales] = useState<Sale[]>([]);
  const [weeklyStats, setWeeklyStats] = useState<DailyStat[]>([]);

  const today = todayInputAR();

  useEffect(() => {
    const load = async () => {
      try {
        const from7 = new Date();
        from7.setDate(from7.getDate() - 6);
        const from7str = from7.toISOString().slice(0, 10);

        const [dashRes, salesTodayRes, salesWeekRes] = await Promise.all([
          api.get('/analytics/dashboard').catch(() => null),
          api.get('/sales', { params: { from: today, to: today, limit: 50 } }).catch(() => null),
          api.get('/sales', { params: { from: from7str, to: today, limit: 500 } }).catch(() => null),
        ]);

        setDash(dashRes?.data ?? null);
        setTodaySales(normalizeArray<Sale>(salesTodayRes?.data));

        // Build weekly chart
        const wMap: Record<string, { revenue: number; count: number }> = {};
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          wMap[d.toISOString().slice(0, 10)] = { revenue: 0, count: 0 };
        }
        normalizeArray<Sale>(salesWeekRes?.data).forEach((s) => {
          const key = s.createdAt?.slice(0, 10);
          if (key && wMap[key]) { wMap[key].revenue += num(s.total); wMap[key].count += 1; }
        });
        setWeeklyStats(
          Object.entries(wMap).map(([date, v]) => ({ date: formatShortDateAR(date), ...v }))
        );
      } finally { setLoading(false); }
    };
    load();
  }, []);

  const d = dash;

  return (
    <AppLayout
      title="Dashboard"
      subtitle="Resumen del negocio"
      actions={
        <button onClick={() => { setLoading(true); setDash(null); }} className="btn btn-ghost btn-sm" title="Recargar">
          <RefreshCcw size={13} />
        </button>
      }
    >
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><div className="spinner" /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Row 1 — today KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {[
              {
                label: 'Ventas hoy', icon: TrendingUp, color: '#2563EB',
                value: fmtMoney(d?.today?.revenue ?? 0),
                sub: `${d?.today?.salesCount ?? 0} tickets`,
                pct: d?.today?.vsYesterday?.revenuePercent ?? null,
              },
              {
                label: 'Ganancia bruta', icon: ShoppingCart, color: '#22C55E',
                value: fmtMoney(d?.today?.grossProfit ?? 0),
                sub: d?.today?.revenue > 0 ? `${d.today.grossMarginPercent?.toFixed(1) ?? '—'}% margen` : '—',
                pct: null,
              },
              {
                label: 'Ticket promedio', icon: Receipt, color: '#00B4DB',
                value: fmtMoney(d?.today?.avgTicket ?? 0),
                sub: `mes: ${fmtMoney(d?.thisMonth?.avgTicket ?? 0)}`,
                pct: null,
              },
              {
                label: 'Alertas stock', icon: AlertTriangle, color: (d?.activeAlerts ?? 0) > 0 ? '#EF4444' : '#22C55E',
                value: String(d?.activeAlerts ?? 0),
                sub: (d?.activeAlerts ?? 0) > 0 ? 'productos con bajo stock' : 'sin alertas activas',
                pct: null,
              },
            ].map((s) => (
              <div key={s.label} className="stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 14, right: 14, width: 34, height: 34, borderRadius: 8, background: `${s.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <s.icon size={17} style={{ color: s.color }} />
                </div>
                <div className="stat-label" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
                  <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
                  <DeltaBadge pct={s.pct} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5, fontFamily: 'var(--mono)' }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Row 2 — week/month/receivables */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            {[
              { label: 'Esta semana', value: fmtMoney(d?.thisWeek?.revenue ?? 0), sub: `${d?.thisWeek?.salesCount ?? 0} ventas`, pct: d?.thisWeek?.vsLastWeek?.revenuePercent ?? null, color: '#6474BB' },
              { label: 'Este mes', value: fmtMoney(d?.thisMonth?.revenue ?? 0), sub: `${d?.thisMonth?.salesCount ?? 0} ventas`, pct: null, color: '#6474BB' },
              { label: 'Cuentas por cobrar', value: fmtMoney(d?.receivables?.totalPending ?? 0), sub: `${d?.receivables?.clientsWithDebt ?? 0} clientes con deuda`, pct: null, color: d?.receivables?.totalPending > 0 ? '#F39C12' : '#22C55E' },
              { label: 'Gastos hoy', value: fmtMoney(d?.today?.expenses ?? 0), sub: 'egresos registrados', pct: null, color: '#EF4444' },
            ].map((s) => (
              <div key={s.label} className="card" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', marginTop: 6 }}>
                  <div style={{ fontSize: 19, fontWeight: 800, fontFamily: 'var(--mono)', color: s.color }}>{s.value}</div>
                  <DeltaBadge pct={s.pct} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--mono)' }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card" style={{ padding: '18px 16px' }}>
              <div style={{ marginBottom: 14 }}>
                <div className="section-title" style={{ fontSize: 14 }}>Ventas últimos 7 días</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Ingresos diarios</div>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={weeklyStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,187,0.12)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text3)', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text3)', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [fmtMoney(v), 'Ingresos']} />
                  <Line type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={2} dot={{ fill: '#2563EB', r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="card" style={{ padding: '18px 16px' }}>
              <div style={{ marginBottom: 14 }}>
                <div className="section-title" style={{ fontSize: 14 }}>Tickets por día</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Cantidad de ventas</div>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={weeklyStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,187,0.12)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text3)', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text3)', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [v, 'Tickets']} />
                  <Bar dataKey="count" fill="#00B4DB" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent sales */}
          <div className="card">
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="section-title" style={{ fontSize: 14 }}>Ventas de hoy</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{today}</div>
              </div>
              <a href="/ventas" className="btn btn-ghost btn-sm" style={{ gap: 5 }}>Ver todas <ArrowUpRight size={13} /></a>
            </div>
            {todaySales.length === 0 ? (
              <div className="empty-state"><ShoppingCart size={36} /><p>Sin ventas registradas hoy</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Hora</th><th>Cliente</th><th>Método</th><th>Tipo</th><th>Estado</th><th style={{ textAlign: 'right' }}>Total</th></tr>
                  </thead>
                  <tbody>
                    {todaySales.slice(0, 15).map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                          {new Date(s.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ color: 'var(--text)' }}>
                          {s.client ? `${s.client.nombre} ${s.client.apellido}` : 'Consumidor final'}
                        </td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{s.paymentMethod}</td>
                        <td><span className={s.receiptType === 'FACTURA' ? 'badge badge-blue' : 'badge badge-gray'}>{s.receiptType}</span></td>
                        <td>
                          <span className={s.status === 'COMPLETED' ? 'badge badge-green' : s.status === 'PENDING' ? 'badge badge-amber' : 'badge badge-red'}>
                            {s.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmtMoney(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
