/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import PlatformAdminLayout from '@/components/PlatformAdminLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { SalesLead, SalesLeadStatus, SalesLeadContactRole } from '@/types';
import { fmtDate, normalizeArray } from '@/lib/helpers';
import { Plus, X, Edit2, Trash2, Phone, MapPin, Store, UserCheck, AlertTriangle } from 'lucide-react';

const CONTACT_ROLE_LABEL: Record<SalesLeadContactRole, string> = {
  DUENO: 'Dueño',
  EMPLEADO: 'Empleado',
};

const STATUS_TABS: { key: SalesLeadStatus | ''; label: string }[] = [
  { key: '', label: 'Todos' },
  { key: 'PENDIENTE', label: 'Pendiente' },
  { key: 'VISITADO', label: 'Visitado' },
  { key: 'INTERESADO', label: 'Interesado' },
  { key: 'NO_INTERESADO', label: 'No interesado' },
  { key: 'CLIENTE', label: 'Cliente' },
];

const STATUS_BADGE: Record<SalesLeadStatus, { label: string; className: string }> = {
  PENDIENTE: { label: 'Pendiente', className: 'badge-gray' },
  VISITADO: { label: 'Visitado', className: 'badge-blue' },
  INTERESADO: { label: 'Interesado', className: 'badge-amber' },
  NO_INTERESADO: { label: 'No interesado', className: 'badge-red' },
  CLIENTE: { label: 'Cliente', className: 'badge-green' },
};

const emptyForm = {
  businessName: '', address: '', contactName: '', phone: '', notes: '', status: 'PENDIENTE' as SalesLeadStatus,
  contactRole: '' as SalesLeadContactRole | '',
};

export default function PlatformAdminCrmPage() {
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<SalesLeadStatus | ''>('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<SalesLead | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/platform-admin/sales-leads');
      setLeads(normalizeArray<SalesLead>(data));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = statusFilter ? leads.filter((l) => l.status === statusFilter) : leads;

  const f = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const openCreate = () => { setForm(emptyForm); setEditing(null); setModal('create'); };
  const openEdit = (l: SalesLead) => {
    setEditing(l);
    setForm({
      businessName: l.businessName,
      address: l.address ?? '',
      contactName: l.contactName ?? '',
      phone: l.phone ?? '',
      notes: l.notes ?? '',
      status: l.status,
      contactRole: l.contactRole ?? '',
    });
    setModal('edit');
  };

  const save = async () => {
    if (!form.businessName.trim()) return;
    setSaving(true);
    try {
      if (modal === 'create') {
        await api.post('/platform-admin/sales-leads', form);
        toast.success('Prospecto agregado');
      } else if (editing) {
        await api.patch(`/platform-admin/sales-leads/${editing.id}`, form);
        toast.success('Prospecto actualizado');
      }
      setModal(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (l: SalesLead) => {
    if (!confirm(`¿Eliminar "${l.businessName}" del CRM?`)) return;
    try {
      await api.delete(`/platform-admin/sales-leads/${l.id}`);
      toast.success('Prospecto eliminado');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo eliminar');
    }
  };

  return (
    <PlatformAdminLayout
      title="CRM"
      subtitle="Visitas a locales — prospección puerta a puerta"
      actions={
        <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
          <Plus size={13} /> Nuevo prospecto
        </button>
      }
    >
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`btn btn-sm ${statusFilter === tab.key ? 'btn-primary' : 'btn-secondary'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: 60 }}>
            <Store size={28} />
            <p>Sin prospectos {statusFilter ? 'en este estado' : 'cargados todavía'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Local</th>
                  <th>Dirección</th>
                  <th>Contacto</th>
                  <th>Notas</th>
                  <th>Estado</th>
                  <th>Cargado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => {
                  const badge = STATUS_BADGE[l.status];
                  return (
                    <tr key={l.id}>
                      <td style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{l.businessName}</td>
                      <td style={{ fontSize: 12, color: 'var(--text2)' }}>
                        {l.address ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <MapPin size={11} style={{ flexShrink: 0, color: 'var(--text3)' }} /> {l.address}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text2)' }}>
                        {l.contactName || '—'}
                        {l.contactRole && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text3)', marginTop: 2 }}>
                            <UserCheck size={11} /> {CONTACT_ROLE_LABEL[l.contactRole]}
                          </div>
                        )}
                        {l.phone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text3)', marginTop: 2 }}>
                            <Phone size={11} /> {l.phone}
                          </div>
                        )}
                        {l.contactRole === 'EMPLEADO' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--warning, #F79009)', marginTop: 2, fontWeight: 600 }}>
                            <AlertTriangle size={11} /> Preguntar por el dueño
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text3)', maxWidth: 260, whiteSpace: 'pre-wrap' }}>{l.notes || '—'}</td>
                      <td><span className={`badge ${badge.className}`}>{badge.label}</span></td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{fmtDate(l.createdAt)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => openEdit(l)} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                          <button onClick={() => remove(l)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
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
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800, fontSize: 15 }}>{modal === 'create' ? 'Nuevo prospecto' : 'Editar prospecto'}</span>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre del local *</label>
                <input value={form.businessName} onChange={f('businessName')} placeholder="Ej: Almacén Don José" autoFocus />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Dirección</label>
                <input value={form.address} onChange={f('address')} placeholder="Calle y número" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre de la persona con la que hablaste</label>
                <input value={form.contactName} onChange={f('contactName')} placeholder="Ej: María" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">¿Con quién hablaste?</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['', 'DUENO', 'EMPLEADO'] as const).map((role) => (
                    <button
                      key={role || 'none'}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, contactRole: role }))}
                      className={`btn btn-xs ${form.contactRole === role ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1 }}
                    >
                      {role ? CONTACT_ROLE_LABEL[role] : 'Sin especificar'}
                    </button>
                  ))}
                </div>
                {form.contactRole === 'EMPLEADO' && (
                  <p style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--warning, #F79009)', marginTop: 6 }}>
                    <AlertTriangle size={12} /> Recordá preguntar por el dueño en la próxima visita.
                  </p>
                )}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Teléfono</label>
                <input value={form.phone} onChange={f('phone')} placeholder="011 1234-5678" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Estado</label>
                <select value={form.status} onChange={f('status')}>
                  {STATUS_TABS.filter((t) => t.key).map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Requerimiento especial / algo que quería probar</label>
                <textarea value={form.notes} onChange={f('notes')} rows={3} placeholder="Notas de la visita..." style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={save} disabled={saving || !form.businessName.trim()} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : modal === 'create' ? 'Agregar' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PlatformAdminLayout>
  );
}
