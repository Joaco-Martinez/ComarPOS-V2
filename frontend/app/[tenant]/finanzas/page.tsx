/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { FinanceAccount, FinanceEntry } from '@/types';
import { fmtDate, fmtMoney, normalizeArray, num } from '@/lib/helpers';
import { todayInputAR, firstDayOfMonthAR } from '@/lib/dateAR';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
import { TrendingUp, Plus, X, Search, Trash2 } from 'lucide-react';

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

export default function FinanzasPage() {
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(firstDayOfMonthAR());
  const [to, setTo] = useState(todayInputAR());
  const [typeFilter, setTypeFilter] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ type: 'INGRESO' as 'INGRESO' | 'EGRESO', amount: '', category: 'VENTA', financeAccountId: '', description: '', paymentMethod: 'EFECTIVO', date: todayInputAR() });
  const [saving, setSaving] = useState(false);
  // Plan de cuentas configurable por tenant (aditivo a CATEGORIES): selector
  // opcional en el modal de carga, además de la categoría clásica. Si el
  // tenant no creó ninguna cuenta (o no es ADMIN), esta lista queda vacía y
  // el selector directamente no se muestra — la carga sigue funcionando
  // igual que antes solo con category.
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/finance', { params: { from, to, type: typeFilter || undefined, limit: 200 } });
      setEntries(normalizeArray<FinanceEntry>(data));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [from, to, typeFilter]);
  useEffect(() => {
    api.get('/finance-accounts')
      .then(({ data }) => setAccounts(normalizeArray<FinanceAccount>(data)))
      .catch(() => setAccounts([])); // no ADMIN o sin plan de cuentas: selector queda oculto
  }, []);

  const accountsForType = accounts.filter((a) => a.type === form.type);

  const save = async () => {
    if (!form.amount || !form.category) return;
    setSaving(true);
    try {
      await api.post('/finance', { ...form, amount: Number(form.amount), financeAccountId: form.financeAccountId || undefined });
      toast.success(`${form.type === 'INGRESO' ? 'Ingreso' : 'Egreso'} registrado`);
      setModal(false);
      setForm({ type: 'INGRESO', amount: '', category: 'VENTA', financeAccountId: '', description: '', paymentMethod: 'EFECTIVO', date: todayInputAR() });
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al guardar');
    } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    try {
      await api.delete(`/finance/${id}`);
      toast.success('Eliminado');
      load();
    } catch { toast.error('Error al eliminar'); }
  };

  const ingresos = entries.filter((e) => e.type === 'INGRESO').reduce((a, e) => a + num(e.amount), 0);
  const egresos = entries.filter((e) => e.type === 'EGRESO').reduce((a, e) => a + num(e.amount), 0);
  const balance = ingresos - egresos;

  return (
    <AppLayout
      title="Finanzas"
      subtitle="Ingresos y egresos del negocio"
      actions={
        <button onClick={() => setModal(true)} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
          <Plus size={13} /> Registrar movimiento
        </button>
      }
    >
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Ingresos', value: fmtMoney(ingresos), color: 'var(--success)' },
          { label: 'Egresos', value: fmtMoney(egresos), color: 'var(--danger)' },
          { label: 'Balance neto', value: fmtMoney(balance), color: balance >= 0 ? 'var(--success)' : 'var(--danger)' },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: s.color, marginTop: 5 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="filter-bar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: 150 }}>
          <option value="">Todos</option>
          <option value="INGRESO">Ingresos</option>
          <option value="EGRESO">Egresos</option>
        </select>
        <button onClick={() => { setFrom(firstDayOfMonthAR()); setTo(todayInputAR()); }} className="btn btn-secondary btn-sm">Este mes</button>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : (
          <ResponsiveTable
            data={entries}
            keyFor={(e) => e.id}
            emptyIcon={TrendingUp}
            emptyMessage="Sin movimientos en el período"
            columns={[
              { key: 'fecha', header: 'Fecha', render: (e) => <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtDate(e.date)}</span> },
              { key: 'tipo', header: 'Tipo', render: (e) => <span className={`badge ${e.type === 'INGRESO' ? 'badge-green' : 'badge-red'}`}>{e.type}</span> },
              { key: 'categoria', header: 'Categoría', render: (e) => <span style={{ fontSize: 12 }}>{CATEGORY_LABEL[e.category] ?? e.category}</span> },
              { key: 'descripcion', header: 'Descripción', render: (e) => <span style={{ fontSize: 12, color: 'var(--text3)' }}>{e.description ?? '—'}</span> },
              { key: 'metodo', header: 'Método', render: (e) => <span style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>{e.paymentMethod ?? '—'}</span> },
              {
                key: 'monto', header: 'Monto', style: { textAlign: 'right' },
                render: (e) => (
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: e.type === 'INGRESO' ? 'var(--success)' : 'var(--danger)', fontSize: 13 }}>
                    {e.type === 'INGRESO' ? '+' : '−'}{fmtMoney(e.amount)}
                  </span>
                ),
              },
              {
                key: 'acciones', header: '', render: (e) => (
                  <button onClick={() => del(e.id)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
                ),
              },
            ] as ResponsiveTableColumn<FinanceEntry>[]}
            renderMobileCard={(e) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="mobile-card-head">
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>{fmtDate(e.date)}</span>
                  <span className={`badge ${e.type === 'INGRESO' ? 'badge-green' : 'badge-red'}`}>{e.type}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{CATEGORY_LABEL[e.category] ?? e.category}</div>
                {e.description && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{e.description}</div>}
                <div className="mobile-card-row">
                  <span>{e.paymentMethod ?? '—'}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: e.type === 'INGRESO' ? 'var(--success)' : 'var(--danger)' }}>
                    {e.type === 'INGRESO' ? '+' : '−'}{fmtMoney(e.amount)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={(ev) => { ev.stopPropagation(); del(e.id); }} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)', gap: 4 }}>
                    <Trash2 size={12} /> Eliminar
                  </button>
                </div>
              </div>
            )}
          />
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800 }}>Registrar movimiento</span>
              <button onClick={() => setModal(false)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tipo</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as any, financeAccountId: '' }))}
                  >
                    <option value="INGRESO">Ingreso</option>
                    <option value="EGRESO">Egreso</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Categoría</label>
                  <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              {accountsForType.length > 0 && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Cuenta (plan de cuentas)</label>
                  <select value={form.financeAccountId} onChange={(e) => setForm((p) => ({ ...p, financeAccountId: e.target.value }))}>
                    <option value="">Sin cuenta (solo categoría)</option>
                    {accountsForType.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Monto *</label>
                  <input type="number" min="0" step="any" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} placeholder="0" autoFocus />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Fecha</label>
                  <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Método de pago</label>
                  <select value={form.paymentMethod} onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))}>
                    {['EFECTIVO','TRANSFERENCIA','TARJETA','QR'].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Descripción</label>
                  <input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Opcional" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(false)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={save} disabled={saving || !form.amount} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
