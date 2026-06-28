/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import { fmtDate, fmtMoney, normalizeArray } from '@/lib/helpers';
import { todayInputAR } from '@/lib/dateAR';
import { RefreshCw, DollarSign, Plus, X, Trash2, Edit2, Play } from 'lucide-react';

type RecurringExpense = {
  id: string;
  name: string;
  amount: number;
  category: string;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  nextDueDate: string;
  description?: string;
  isActive?: boolean;
};

const FREQ_LABEL: Record<string, string> = {
  DAILY: 'Diario',
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensual',
  YEARLY: 'Anual',
};

const emptyForm = () => ({
  name: '',
  amount: '',
  category: '',
  frequency: 'MONTHLY' as RecurringExpense['frequency'],
  nextDueDate: todayInputAR(),
  description: '',
});

export default function GastosRecurrentesPage() {
  const [expenses, setExpenses] = useState<RecurringExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<RecurringExpense | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/recurring-expenses');
      setExpenses(normalizeArray<RecurringExpense>(data));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setModal('create'); };
  const openEdit = (e: RecurringExpense) => {
    setEditing(e);
    setForm({ name: e.name, amount: String(e.amount), category: e.category, frequency: e.frequency, nextDueDate: e.nextDueDate?.slice(0, 10) ?? todayInputAR(), description: e.description ?? '' });
    setModal('edit');
  };

  const save = async () => {
    if (!form.name || !form.amount || !form.category) return;
    setSaving(true);
    try {
      const payload = { name: form.name, amount: Number(form.amount), category: form.category, frequency: form.frequency, nextDueDate: form.nextDueDate, description: form.description || undefined };
      if (modal === 'edit' && editing) {
        await api.put(`/recurring-expenses/${editing.id}`, payload);
        showToast('Gasto actualizado');
      } else {
        await api.post('/recurring-expenses', payload);
        showToast('Gasto creado');
      }
      setModal(null);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al guardar');
    } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!confirm('¿Eliminar este gasto recurrente?')) return;
    try {
      await api.delete(`/recurring-expenses/${id}`);
      showToast('Eliminado');
      load();
    } catch { showToast('Error al eliminar'); }
  };

  const processDue = async () => {
    setProcessing(true);
    try {
      const { data } = await api.post('/recurring-expenses/process');
      const count = data?.processed ?? data?.count ?? 0;
      showToast(`${count} gasto(s) procesado(s)`);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al procesar');
    } finally { setProcessing(false); }
  };

  const today = todayInputAR();
  const overdue = expenses.filter((e) => e.nextDueDate?.slice(0, 10) <= today && e.isActive !== false);

  return (
    <AppLayout
      title="Gastos Recurrentes"
      subtitle="Gastos periódicos automáticos"
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          {overdue.length > 0 && (
            <button onClick={processDue} disabled={processing} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
              {processing ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Play size={13} />}
              Procesar vencidos ({overdue.length})
            </button>
          )}
          <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
            <Plus size={13} /> Nuevo gasto
          </button>
        </div>
      }
    >
      {toast && (
        <div style={{ position: 'fixed', top: 70, right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)', animation: 'fadeIn 0.2s ease' }}>{toast}</div>
      )}

      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : expenses.length === 0 ? (
          <div className="empty-state"><DollarSign size={32} /><p>Sin gastos recurrentes registrados</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Categoría</th>
                  <th>Frecuencia</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                  <th>Próximo vencimiento</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => {
                  const isOverdue = e.nextDueDate?.slice(0, 10) <= today && e.isActive !== false;
                  return (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>
                        {e.name}
                        {e.description && <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>{e.description}</div>}
                      </td>
                      <td style={{ fontSize: 12 }}>{e.category}</td>
                      <td style={{ fontSize: 12 }}>{FREQ_LABEL[e.frequency] ?? e.frequency}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--danger)' }}>{fmtMoney(e.amount)}</td>
                      <td style={{ fontSize: 12, fontFamily: 'var(--mono)', color: isOverdue ? 'var(--danger)' : 'var(--text3)' }}>
                        {fmtDate(e.nextDueDate)}
                        {isOverdue && <span className="badge badge-red" style={{ marginLeft: 6, fontSize: 9 }}>VENCIDO</span>}
                      </td>
                      <td>
                        <span className={`badge ${e.isActive === false ? 'badge-red' : 'badge-green'}`}>
                          {e.isActive === false ? 'Inactivo' : 'Activo'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => openEdit(e)} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                          <button onClick={() => del(e.id)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
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
              <span style={{ fontWeight: 800 }}>{modal === 'edit' ? 'Editar gasto' : 'Nuevo gasto recurrente'}</span>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre *</label>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ej: Alquiler local" autoFocus />
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Monto *</label>
                  <input type="number" min="0" step="any" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} placeholder="0" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Categoría *</label>
                  <input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} placeholder="Ej: Alquiler" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Frecuencia</label>
                  <select value={form.frequency} onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value as any }))}>
                    {Object.entries(FREQ_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Próximo vencimiento</label>
                  <input type="date" value={form.nextDueDate} onChange={(e) => setForm((p) => ({ ...p, nextDueDate: e.target.value }))} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Descripción</label>
                <input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Opcional" />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={save} disabled={saving || !form.name || !form.amount || !form.category} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
