/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import ConfirmModal, { type ConfirmState } from '@/components/ConfirmModal';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { normalizeArray } from '@/lib/helpers';
import type { FinanceAccount } from '@/types';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
import { Landmark, Plus, X, Trash2, Edit2 } from 'lucide-react';

const emptyForm = () => ({ name: '', type: 'EGRESO' as 'INGRESO' | 'EGRESO' });

export default function PlanDeCuentasPage() {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<FinanceAccount | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/finance-accounts', { params: { includeInactive: true } });
      setAccounts(normalizeArray<FinanceAccount>(data));
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al cargar el plan de cuentas');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const visible = useMemo(
    () => accounts.filter((a) => showInactive || a.isActive),
    [accounts, showInactive]
  );

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setModal('create'); };
  const openEdit = (a: FinanceAccount) => { setEditing(a); setForm({ name: a.name, type: a.type }); setModal('edit'); };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (modal === 'edit' && editing) {
        await api.put(`/finance-accounts/${editing.id}`, { name: form.name, type: form.type });
        toast.success('Cuenta actualizada');
      } else {
        await api.post('/finance-accounts', { name: form.name, type: form.type });
        toast.success('Cuenta creada');
      }
      setModal(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al guardar la cuenta');
    } finally { setSaving(false); }
  };

  const toggleActive = async (a: FinanceAccount) => {
    try {
      await api.put(`/finance-accounts/${a.id}`, { isActive: !a.isActive });
      toast.success(a.isActive ? 'Cuenta desactivada' : 'Cuenta activada');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al actualizar la cuenta');
    }
  };

  const del = async (a: FinanceAccount) => {
    try {
      const { data } = await api.delete(`/finance-accounts/${a.id}`);
      toast.success(data?.account?.isActive === false ? 'Cuenta desactivada (tiene movimientos asociados)' : 'Cuenta eliminada');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al eliminar la cuenta');
    }
  };

  const askDel = (a: FinanceAccount) => setConfirmState({
    title: 'Eliminar cuenta',
    message: a.isSystem
      ? 'Esta es una cuenta del sistema. Si tiene movimientos asociados se desactivará en vez de eliminarse.'
      : '¿Eliminar esta cuenta? Si tiene movimientos asociados se desactivará en vez de eliminarse.',
    onConfirm: () => del(a),
  });

  return (
    <AppLayout
      title="Plan de Cuentas"
      subtitle="Cuentas de ingresos y egresos para la carga de caja"
      actions={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text3)' }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Mostrar desactivadas
          </label>
          <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
            <Plus size={13} /> Nueva cuenta
          </button>
        </div>
      }
    >
      <div className="card" style={{ padding: '12px 16px', marginBottom: 14, fontSize: 12, color: 'var(--text3)' }}>
        Estas cuentas aparecen como opción al registrar un ingreso o egreso en{' '}
        <strong>Finanzas</strong>, además de la categoría clásica. Las marcadas como{' '}
        <strong>Sistema</strong> se crearon automáticamente a partir de las categorías existentes.
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : (
          <ResponsiveTable
            data={visible}
            keyFor={(a) => a.id}
            emptyIcon={Landmark}
            emptyMessage="Sin cuentas registradas"
            columns={[
              { key: 'nombre', header: 'Nombre', render: (a) => <span style={{ fontWeight: 600, fontSize: 13 }}>{a.name}</span> },
              { key: 'tipo', header: 'Tipo', render: (a) => <span className={`badge ${a.type === 'INGRESO' ? 'badge-green' : 'badge-red'}`}>{a.type}</span> },
              {
                key: 'origen', header: 'Origen', render: (a) => (
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{a.isSystem ? 'Sistema' : 'Personalizada'}</span>
                ),
              },
              {
                key: 'estado', header: 'Estado', render: (a) => (
                  <span className={`badge ${a.isActive ? 'badge-green' : 'badge-red'}`}>{a.isActive ? 'Activa' : 'Inactiva'}</span>
                ),
              },
              {
                key: 'acciones', header: '', render: (a) => (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => openEdit(a)} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                    <button
                      onClick={() => toggleActive(a)}
                      className="btn btn-ghost btn-xs"
                      title={a.isActive ? 'Desactivar' : 'Activar'}
                    >
                      {a.isActive ? 'Desactivar' : 'Activar'}
                    </button>
                    <button onClick={() => askDel(a)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
                  </div>
                ),
              },
            ] as ResponsiveTableColumn<FinanceAccount>[]}
            renderMobileCard={(a) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="mobile-card-head">
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{a.name}</span>
                  <span className={`badge ${a.type === 'INGRESO' ? 'badge-green' : 'badge-red'}`}>{a.type}</span>
                </div>
                <div className="mobile-card-row">
                  <span>{a.isSystem ? 'Sistema' : 'Personalizada'}</span>
                  <span className={`badge ${a.isActive ? 'badge-green' : 'badge-red'}`}>{a.isActive ? 'Activa' : 'Inactiva'}</span>
                </div>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button onClick={() => openEdit(a)} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                  <button onClick={() => toggleActive(a)} className="btn btn-ghost btn-xs">{a.isActive ? 'Desactivar' : 'Activar'}</button>
                  <button onClick={() => askDel(a)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
                </div>
              </div>
            )}
          />
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800 }}>{modal === 'edit' ? 'Editar cuenta' : 'Nueva cuenta'}</span>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre *</label>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ej: Comisiones Mercado Pago" autoFocus />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tipo *</label>
                <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as any }))}>
                  <option value="INGRESO">Ingreso</option>
                  <option value="EGRESO">Egreso</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={save} disabled={saving || !form.name.trim()} className="btn btn-primary btn-sm">
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
