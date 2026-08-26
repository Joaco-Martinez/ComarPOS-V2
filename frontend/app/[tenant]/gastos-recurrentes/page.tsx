/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import ConfirmModal, { type ConfirmState } from '@/components/ConfirmModal';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { fmtDate, fmtMoney, normalizeArray } from '@/lib/helpers';
import { todayInputAR, toDateInputAR } from '@/lib/dateAR';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
import { DollarSign, Plus, X, Trash2, Edit2, Play } from 'lucide-react';

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'VENTA',            label: 'Venta' },
  { value: 'COBRANZA',         label: 'Cobranza' },
  { value: 'CompraMercaderia', label: 'Compra mercadería' },
  { value: 'AlquilerL1',       label: 'Alquiler local 1' },
  { value: 'AlquilerF1',       label: 'Alquiler frío 1' },
  { value: 'Alarma',           label: 'Alarma' },
  { value: 'Sueldos',          label: 'Sueldos' },
  { value: 'MateriaPrima',     label: 'Materia prima' },
  { value: 'Impuestos',        label: 'Impuestos' },
  { value: 'VEP',              label: 'VEP' },
  { value: 'Contadora',        label: 'Contadora' },
  { value: 'Arca',             label: 'ARCA' },
  { value: 'Eenvios',          label: 'E-envíos' },
  { value: 'Publicidad',       label: 'Publicidad' },
  { value: 'Otro',             label: 'Otro' },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

type RecurringExpense = {
  id: string;
  name: string;
  amount: number;
  category: string;
  dayOfMonth: number;
  lastCreated?: string | null;
  notes?: string | null;
  isActive?: boolean;
};

const emptyForm = () => ({
  name: '',
  amount: '',
  category: 'Otro',
  dayOfMonth: '1',
  notes: '',
});

// Recurrencia es siempre mensual (dayOfMonth). Está vencido si hoy ya pasó
// el día del mes y todavía no se generó el gasto de este mes.
function isOverdue(e: RecurringExpense): boolean {
  if (e.isActive === false) return false;
  const todayStr = todayInputAR();
  const todayDay = Number(todayStr.slice(8, 10));
  if (todayDay < e.dayOfMonth) return false;
  if (!e.lastCreated) return true;
  const lastStr = toDateInputAR(e.lastCreated);
  return lastStr.slice(0, 7) !== todayStr.slice(0, 7);
}

export default function GastosRecurrentesPage() {
  const [expenses, setExpenses] = useState<RecurringExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<RecurringExpense | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [processing, setProcessing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/recurring-expenses');
      setExpenses(normalizeArray<RecurringExpense>(data));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);


  const openCreate = () => { setEditing(null); setForm(emptyForm()); setModal('create'); };
  const openEdit = (e: RecurringExpense) => {
    setEditing(e);
    setForm({ name: e.name, amount: String(e.amount), category: e.category, dayOfMonth: String(e.dayOfMonth), notes: e.notes ?? '' });
    setModal('edit');
  };

  const save = async () => {
    if (!form.name || !form.amount || !form.category) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        amount: Number(form.amount),
        category: form.category,
        dayOfMonth: Number(form.dayOfMonth),
        notes: form.notes || undefined,
      };
      if (modal === 'edit' && editing) {
        await api.put(`/recurring-expenses/${editing.id}`, payload);
        toast.success('Gasto actualizado');
      } else {
        await api.post('/recurring-expenses', payload);
        toast.success('Gasto creado');
      }
      setModal(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al guardar');
    } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    try {
      await api.delete(`/recurring-expenses/${id}`);
      toast.success('Eliminado');
      load();
    } catch { toast.error('Error al eliminar'); }
  };

  const askDel = (id: string) => setConfirmState({
    title: 'Eliminar gasto recurrente',
    message: '¿Eliminar este gasto recurrente?',
    onConfirm: () => del(id),
  });

  const processDue = async () => {
    setProcessing(true);
    try {
      const { data } = await api.post('/recurring-expenses/process');
      const count = data?.processed ?? 0;
      toast.success(`${count} gasto(s) procesado(s)`);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al procesar');
    } finally { setProcessing(false); }
  };

  const overdue = expenses.filter(isOverdue);

  return (
    <AppLayout
      title="Gastos Recurrentes"
      subtitle="Gastos mensuales automáticos"
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
      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : (
          <ResponsiveTable
            data={expenses}
            keyFor={(e) => e.id}
            emptyIcon={DollarSign}
            emptyMessage="Sin gastos recurrentes registrados"
            columns={[
              {
                key: 'nombre', header: 'Nombre', render: (e) => (
                  <span style={{ fontWeight: 600, fontSize: 13 }}>
                    {e.name}
                    {e.notes && <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>{e.notes}</div>}
                  </span>
                ),
              },
              { key: 'categoria', header: 'Categoría', render: (e) => <span style={{ fontSize: 12 }}>{CATEGORY_LABEL[e.category] ?? e.category}</span> },
              {
                key: 'dia', header: 'Día del mes', render: (e) => (
                  <span style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>
                    Día {e.dayOfMonth}
                    {isOverdue(e) && <span className="badge badge-red" style={{ marginLeft: 6, fontSize: 9 }}>VENCIDO</span>}
                  </span>
                ),
              },
              {
                key: 'monto', header: 'Monto', style: { textAlign: 'right' },
                render: (e) => <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--danger)' }}>{fmtMoney(e.amount)}</span>,
              },
              { key: 'ultimo', header: 'Último generado', render: (e) => <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{e.lastCreated ? fmtDate(e.lastCreated) : '—'}</span> },
              {
                key: 'estado', header: 'Estado', render: (e) => (
                  <span className={`badge ${e.isActive === false ? 'badge-red' : 'badge-green'}`}>
                    {e.isActive === false ? 'Inactivo' : 'Activo'}
                  </span>
                ),
              },
              {
                key: 'acciones', header: '', render: (e) => (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => openEdit(e)} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                    <button onClick={() => askDel(e.id)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
                  </div>
                ),
              },
            ] as ResponsiveTableColumn<RecurringExpense>[]}
            renderMobileCard={(e) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="mobile-card-head">
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{e.name}</span>
                  <span className={`badge ${e.isActive === false ? 'badge-red' : 'badge-green'}`}>
                    {e.isActive === false ? 'Inactivo' : 'Activo'}
                  </span>
                </div>
                {e.notes && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{e.notes}</div>}
                <div className="mobile-card-row">
                  <span>{CATEGORY_LABEL[e.category] ?? e.category}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--danger)' }}>{fmtMoney(e.amount)}</span>
                </div>
                <div className="mobile-card-row">
                  <span>
                    Día {e.dayOfMonth}
                    {isOverdue(e) && <span className="badge badge-red" style={{ marginLeft: 6, fontSize: 9 }}>VENCIDO</span>}
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{e.lastCreated ? fmtDate(e.lastCreated) : '—'}</span>
                </div>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button onClick={() => openEdit(e)} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                  <button onClick={() => askDel(e.id)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
                </div>
              </div>
            )}
          />
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
                  <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Día del mes (1-31) *</label>
                <input type="number" min="1" max="31" value={form.dayOfMonth} onChange={(e) => setForm((p) => ({ ...p, dayOfMonth: e.target.value }))} placeholder="1" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Notas</label>
                <input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Opcional" />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button
                onClick={save}
                disabled={saving || !form.name || !form.amount || !form.category || !form.dayOfMonth || Number(form.dayOfMonth) < 1 || Number(form.dayOfMonth) > 31}
                className="btn btn-primary btn-sm"
              >
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
    </AppLayout>
  );
}
