/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import { fmtMoney, normalizeArray, num } from '@/lib/helpers';
import { todayInputAR, firstDayOfMonthAR } from '@/lib/dateAR';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { PieChart as PieIcon, Download } from 'lucide-react';

const COLORS = ['#2563EB', '#00B4DB', '#22C55E', '#F39C12', '#6474BB', '#EF4444', '#2ECC71'];

export default function ReportesPage() {
  const [from, setFrom] = useState(firstDayOfMonthAR());
  const [to, setTo] = useState(todayInputAR());
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [dashRes, salesRes] = await Promise.all([
        api.get('/analytics/dashboard').catch(() => null),
        api.get('/sales', { params: { from, to, limit: 500 } }).catch(() => null),
      ]);
      const sales = normalizeArray<any>(salesRes?.data);

      // Aggregate by category
      const byCategory: Record<string, number> = {};
      const byDay: Record<string, { revenue: number; count: number }> = {};
      const byMethod: Record<string, number> = {};

      sales.forEach((s: any) => {
        const day = s.createdAt?.slice(0, 10) ?? 'Desconocido';
        if (!byDay[day]) byDay[day] = { revenue: 0, count: 0 };
        byDay[day].revenue += num(s.total);
        byDay[day].count += 1;
        const method = s.paymentMethod ?? 'Otro';
        byMethod[method] = (byMethod[method] ?? 0) + num(s.total);
      });

      setStats({
        overview: dashRes?.data ?? {},
        sales,
        byDay: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date: date.slice(5), ...v })),
        byMethod: Object.entries(byMethod).map(([name, value]) => ({ name, value })),
        total: sales.reduce((a: number, s: any) => a + num(s.total), 0),
        profit: sales.reduce((a: number, s: any) => a + num(s.grossProfit), 0),
        count: sales.length,
      });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [from, to]);

  const downloadExcel = async () => {
    try {
      const res = await api.get('/exports/sales', { params: { fromDate: from, toDate: to }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `ventas-${from}-${to}.xlsx`; a.click();
    } catch {}
  };

  return (
    <AppLayout
      title="Reportes"
      subtitle="Análisis de ventas y rendimiento"
      actions={
        <button onClick={downloadExcel} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
          <Download size={13} /> Exportar Excel
        </button>
      }
    >
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150, fontSize: 13 }} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150, fontSize: 13 }} />
        <button onClick={() => { setFrom(firstDayOfMonthAR()); setTo(todayInputAR()); }} className="btn btn-secondary btn-sm">Este mes</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><div className="spinner" /></div>
      ) : !stats ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 12 }}>
            {[
              { label: 'Ingresos', value: fmtMoney(stats.total), color: 'var(--accent)' },
              { label: 'Ganancia bruta', value: fmtMoney(stats.profit), color: 'var(--success)' },
              { label: 'Margen', value: stats.total > 0 ? `${((stats.profit / stats.total) * 100).toFixed(1)}%` : '—', color: 'var(--accent2)' },
              { label: 'Transacciones', value: String(stats.count), color: 'var(--accent3)' },
            ].map((s) => (
              <div key={s.label} className="card" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: s.color, marginTop: 4 }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
            {/* Revenue by day */}
            <div className="card" style={{ padding: '18px 16px' }}>
              <div style={{ marginBottom: 16 }}>
                <div className="section-title" style={{ fontSize: 14 }}>Ingresos por día</div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.byDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,187,0.1)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text3)', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text3)', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [fmtMoney(v), 'Ingresos']} />
                  <Bar dataKey="revenue" fill="#2563EB" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* By payment method */}
            <div className="card" style={{ padding: '18px 16px' }}>
              <div style={{ marginBottom: 16 }}>
                <div className="section-title" style={{ fontSize: 14 }}>Por método de pago</div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={stats.byMethod} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                    {stats.byMethod.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }} formatter={(v: any) => fmtMoney(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
