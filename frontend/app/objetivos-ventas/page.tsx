/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import { fmtDate, fmtMoney, normalizeArray, num } from '@/lib/helpers';
import { todayInputAR, firstDayOfMonthAR } from '@/lib/dateAR';
import { Target, TrendingUp, Plus, X, Trash2, Edit2 } from 'lucide-react';

type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  startDate: string;
  endDate: string;
  type?: string;
  userId?: string;
  locationId?: string;
  createdAt: string;
};

type Progress = {
  goal?: any;
  current: number;
  percentage: number;
  remaining: number;
  daysLeft: number;
};

const emptyForm = () => ({
  name: '',
  targetAmount: '',
  startDate: firstDayOfMonthAR(),
  endDate: todayInputAR(),
  type: '',
});

function goalStatus(g: Goal): 'CUMPLIDO' | 'EN_CURSO' | 'VENCIDO' {
  const now = new Date().toISOString().slice(0, 10);
  if (g.endDate < now) return 'VENCIDO';
  return 'EN_CURSO';
}

const statusBadge: Record<string, string> = {
  CUMPLIDO: 'badge-green',
  EN_CURSO: 'badge-cyan',
  VENCIDO: 'badge-red',
};

export default function ObjetivosVentasPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, Progress>>({});
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
      const list = normalizeArray<Goal>(data);
      setGoals(list);
      const progresses = await Promise.allSettled(
        list.map((g) => api.get(`/sales-goals/${g.id}/progress`).then((r) => ({ id: g.id, data: r.data })))
      );
      const map: Record<string, Progress> = {};
      progresses.forEach((r) => {
        if (r.status === 'fulfilled') map[r.value.id] = r.value.data;
      });
      setProgressMap(map);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setModal('create'); };
  const openEdit = (g: Goal) => {
    setEditing(g);
    setForm({ name: g.name, targetAmount: String(g.targetAmount), startDate: g.startDate?.slice(0, 10) ?? '', endDate: g.endDate?.slice(0, 10) ?? '', type: g.type ?? '' });
    setModal('edit');
  };

  const save = async () => {
    if (!form.name || !form.targetAmount) return;
    setSaving(true);
    try {
      const payload = { name: form.name, targetAmount: Number(form.targetAmount), startDate: form.startDate, endDate: form.endDate, type: form.type || undefined };
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

  const activeGoals = goals.filter((g) => goalStatus(g) === 'EN_CURSO');

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
      {activeGoals.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div className="section-title" style={{ marginBottom: 10 }}>Objetivos activos</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12 }}>
            {activeGoals.map((g) => {
              const prog = progressMap[g.id];
              const pct = Math.min(num(prog?.percentage), 100);
              return (
                <div key={g.id} className="card" style={{ padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Target size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{g.name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 10 }}>
                    {fmtDate(g.startDate)} → {fmtDate(g.endDate)}
                    {prog?.daysLeft != null && prog.daysLeft >= 0 && (
                      <span style={{ marginLeft: 8, color: 'var(--accent2)' }}>· {prog.daysLeft} días restantes</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: 'var(--text3)' }}>Progreso</span>
                    <span style={{ fontWeight: 700, fontFamily: 'var(--mono)', color: pct >= 100 ? 'var(--success)' : 'var(--accent)' }}>{pct.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border2)', borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? 'var(--success)' : 'var(--accent)', borderRadius: 3, transition: 'width 0.4s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text3)' }}>{prog ? fmtMoney(prog.current) : '—'} / {fmtMoney(g.targetAmount)}</span>
                    {prog?.remaining != null && prog.remaining > 0 && (
                      <span style={{ color: 'var(--text3)' }}>Resta {fmtMoney(prog.remaining)}</span>
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
        ) : goals.length === 0 ? (
          <div className="empty-state"><TrendingUp size={32} /><p>Sin objetivos registrados</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Período</th>
                  <th style={{ textAlign: 'right' }}>Meta</th>
                  <th style={{ textAlign: 'right' }}>Progreso</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {goals.map((g) => {
                  const prog = progressMap[g.id];
                  const pct = Math.min(num(prog?.percentage), 100);
                  const status = pct >= 100 ? 'CUMPLIDO' : goalStatus(g);
                  return (
                    <tr key={g.id}>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</td>
                      <td style={{ fontSize: 12, color: 'var(--text3)' }}>{g.type ?? '—'}</td>
                      <td style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{fmtDate(g.startDate)} → {fmtDate(g.endDate)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmtMoney(g.targetAmount)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: pct >= 100 ? 'var(--success)' : 'var(--accent)' }}>{prog ? `${pct.toFixed(1)}%` : '—'}</td>
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
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ej: Meta mensual enero" autoFocus />
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Monto objetivo *</label>
                  <input type="number" min="0" step="any" value={form.targetAmount} onChange={(e) => setForm((p) => ({ ...p, targetAmount: e.target.value }))} placeholder="0" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tipo</label>
                  <input value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} placeholder="Ej: MENSUAL" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Fecha inicio</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Fecha fin</label>
                  <input type="date" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={save} disabled={saving || !form.name || !form.targetAmount} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
