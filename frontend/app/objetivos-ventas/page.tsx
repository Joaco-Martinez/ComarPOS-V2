/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import { fmtDate, fmtMoney, normalizeArray, num } from '@/lib/helpers';
import { todayInputAR, firstDayOfMonthAR } from '@/lib/dateAR';
import { Target, TrendingUp, Plus, X, Trash2, Edit2 } from 'lucide-react';

type Metric = 'REVENUE' | 'GROSS_PROFIT' | 'UNITS_SOLD' | 'SALES_COUNT';

type Goal = {
  id: string;
  title: string;
  description?: string | null;
  metric: Metric;
  targetAmount: number;
  periodStart: string;
  periodEnd: string;
  isActive: boolean;
  createdAt: string;
};

type Progress = {
  goal: Goal;
  currentValue: number;
  progressPercent: number;
  remaining: number;
  timeProgressPercent: number;
  onTrack: boolean;
};

const metricLabel: Record<Metric, string> = {
  REVENUE: 'Ingresos',
  GROSS_PROFIT: 'Ganancia bruta',
  UNITS_SOLD: 'Unidades vendidas',
  SALES_COUNT: 'Cantidad de ventas',
};

const emptyForm = () => ({
  title: '',
  targetAmount: '',
  periodStart: firstDayOfMonthAR(),
  periodEnd: todayInputAR(),
  metric: 'REVENUE' as Metric,
});

function goalStatus(g: Goal, pct: number): 'CUMPLIDO' | 'EN_CURSO' | 'VENCIDO' {
  if (pct >= 100) return 'CUMPLIDO';
  const now = todayInputAR();
  if (g.periodEnd < now) return 'VENCIDO';
  return 'EN_CURSO';
}

const statusBadge: Record<string, string> = {
  CUMPLIDO: 'badge-green',
  EN_CURSO: 'badge-cyan',
  VENCIDO: 'badge-red',
};

export default function ObjetivosVentasPage() {
  const [progresses, setProgresses] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/sales-goals');
      setProgresses(normalizeArray<Progress>(data));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setModal('create'); };
  const openEdit = (g: Goal) => {
    setEditing(g);
    setForm({
      title: g.title,
      targetAmount: String(g.targetAmount),
      periodStart: g.periodStart?.slice(0, 10) ?? '',
      periodEnd: g.periodEnd?.slice(0, 10) ?? '',
      metric: g.metric,
    });
    setModal('edit');
  };

  const save = async () => {
    if (!form.title || !form.targetAmount) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        targetAmount: Number(form.targetAmount),
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        metric: form.metric,
      };
      if (modal === 'edit' && editing) {
        await api.put(`/sales-goals/${editing.id}`, payload);
        showToast('Objetivo actualizado');
      } else {
        await api.post('/sales-goals', payload);
        showToast('Objetivo creado');
      }
      setModal(null);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al guardar');
    } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!confirm('¿Eliminar este objetivo?')) return;
    try {
      await api.delete(`/sales-goals/${id}`);
      showToast('Objetivo eliminado');
      load();
    } catch { showToast('Error al eliminar'); }
  };

  const activeProgresses = progresses.filter((p) => goalStatus(p.goal, p.progressPercent) === 'EN_CURSO');

  return (
    <AppLayout
      title="Objetivos de Ventas"
      subtitle="Metas de rendimiento y seguimiento"
      actions={
        <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
          <Plus size={13} /> Nuevo objetivo
        </button>
      }
    >
      {toast && (
        <div style={{ position: 'fixed', top: 70, right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)', animation: 'fadeIn 0.2s ease' }}>{toast}</div>
      )}

      {/* Active goals cards */}
      {activeProgresses.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div className="section-title" style={{ marginBottom: 10 }}>Objetivos activos</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12 }}>
            {activeProgresses.map((p) => {
              const g = p.goal;
              const pct = Math.min(num(p.progressPercent), 100);
              return (
                <div key={g.id} className="card" style={{ padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Target size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{g.title}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 10 }}>
                    {fmtDate(g.periodStart)} → {fmtDate(g.periodEnd)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: 'var(--text3)' }}>Progreso</span>
                    <span style={{ fontWeight: 700, fontFamily: 'var(--mono)', color: pct >= 100 ? 'var(--success)' : 'var(--accent)' }}>{pct.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border2)', borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? 'var(--success)' : 'var(--accent)', borderRadius: 3, transition: 'width 0.4s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text3)' }}>{fmtMoney(p.currentValue)} / {fmtMoney(g.targetAmount)}</span>
                    {p.remaining > 0 && (
                      <span style={{ color: 'var(--text3)' }}>Resta {fmtMoney(p.remaining)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All goals table */}
      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : progresses.length === 0 ? (
          <div className="empty-state"><TrendingUp size={32} /><p>Sin objetivos registrados</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Métrica</th>
                  <th>Período</th>
                  <th style={{ textAlign: 'right' }}>Meta</th>
                  <th style={{ textAlign: 'right' }}>Progreso</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {progresses.map((p) => {
                  const g = p.goal;
                  const pct = Math.min(num(p.progressPercent), 100);
                  const status = goalStatus(g, pct);
                  return (
                    <tr key={g.id}>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>{g.title}</td>
                      <td style={{ fontSize: 12, color: 'var(--text3)' }}>{metricLabel[g.metric]}</td>
                      <td style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{fmtDate(g.periodStart)} → {fmtDate(g.periodEnd)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmtMoney(g.targetAmount)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: pct >= 100 ? 'var(--success)' : 'var(--accent)' }}>{pct.toFixed(1)}%</td>
                      <td><span className={`badge ${statusBadge[status]}`}>{status.replace('_', ' ')}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => openEdit(g)} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                          <button onClick={() => del(g.id)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800 }}>{modal === 'edit' ? 'Editar objetivo' : 'Nuevo objetivo'}</span>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre *</label>
                <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Ej: Meta mensual enero" autoFocus />
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Monto objetivo *</label>
                  <input type="number" min="0" step="any" value={form.targetAmount} onChange={(e) => setForm((p) => ({ ...p, targetAmount: e.target.value }))} placeholder="0" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Métrica</label>
                  <select value={form.metric} onChange={(e) => setForm((p) => ({ ...p, metric: e.target.value as Metric }))}>
                    {Object.entries(metricLabel).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Fecha inicio</label>
                  <input type="date" value={form.periodStart} onChange={(e) => setForm((p) => ({ ...p, periodStart: e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Fecha fin</label>
                  <input type="date" value={form.periodEnd} onChange={(e) => setForm((p) => ({ ...p, periodEnd: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={save} disabled={saving || !form.title || !form.targetAmount} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
