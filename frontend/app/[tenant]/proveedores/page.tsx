/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { Supplier } from '@/types';
import { normalizeArray } from '@/lib/helpers';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
import FilterBar from '@/components/mobile/FilterBar';
import { Truck, Plus, Edit2, Trash2, X } from 'lucide-react';

const emptyForm = { name: '', cuit: '', contactName: '', phone: '', email: '', address: '', notes: '' };

export default function ProveedoresPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Supplier | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/suppliers');
      setSuppliers(normalizeArray<Supplier>(data));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);


  const openCreate = () => { setForm(emptyForm); setEditing(null); setModal('create'); };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name: s.name, cuit: s.cuit ?? '', contactName: s.contactName ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '', notes: s.notes ?? '' });
    setModal('edit');
  };

  const f = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
      if (modal === 'create') {
        await api.post('/suppliers', body);
        toast.success('Proveedor creado');
      } else if (editing) {
        await api.put(`/suppliers/${editing.id}`, body);
        toast.success('Proveedor actualizado');
      }
      setModal(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al guardar');
    } finally { setSaving(false); }
  };

  const del = async (s: Supplier) => {
    try {
      await api.delete(`/suppliers/${s.id}`);
      toast.success('Proveedor eliminado');
      load();
    } catch { toast.error('Error al eliminar'); }
    setConfirmDelete(null);
  };

  const filtered = search.trim()
    ? suppliers.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.cuit?.includes(search))
    : suppliers;

  return (
    <AppLayout
      title="Proveedores"
      subtitle={`${suppliers.length} proveedores`}
      actions={
        <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
          <Plus size={13} /> Nuevo proveedor
        </button>
      }
    >
      <div style={{ marginBottom: 14 }}>
        <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Buscar proveedor..." />
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : (
          <ResponsiveTable
            data={filtered}
            keyFor={(s) => s.id}
            emptyIcon={Truck}
            emptyMessage="Sin proveedores"
            columns={[
              { key: 'nombre', header: 'Nombre', render: (s) => <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>{s.name}</span> },
              { key: 'cuit', header: 'CUIT', render: (s) => <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{s.cuit ?? '—'}</span> },
              { key: 'contacto', header: 'Contacto', render: (s) => <span style={{ fontSize: 12 }}>{s.contactName ?? '—'}</span> },
              { key: 'telefono', header: 'Teléfono', render: (s) => <span style={{ fontSize: 12 }}>{s.phone ?? '—'}</span> },
              { key: 'email', header: 'Email', render: (s) => <span style={{ fontSize: 12, color: 'var(--text3)' }}>{s.email ?? '—'}</span> },
              { key: 'estado', header: 'Estado', render: (s) => <span className={`badge ${s.isActive ? 'badge-green' : 'badge-gray'}`}>{s.isActive ? 'Activo' : 'Inactivo'}</span> },
              {
                key: 'acciones', header: '', render: (s) => (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => openEdit(s)} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                    <button onClick={() => setConfirmDelete(s)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
                  </div>
                ),
              },
            ] as ResponsiveTableColumn<Supplier>[]}
            renderMobileCard={(s) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="mobile-card-head">
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.name}</span>
                  <span className={`badge ${s.isActive ? 'badge-green' : 'badge-gray'}`}>{s.isActive ? 'Activo' : 'Inactivo'}</span>
                </div>
                <div className="mobile-card-row">
                  <span>CUIT</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{s.cuit ?? '—'}</span>
                </div>
                <div className="mobile-card-row">
                  <span>Contacto</span>
                  <span>{s.contactName ?? '—'}</span>
                </div>
                <div className="mobile-card-row">
                  <span>Teléfono</span>
                  <span>{s.phone ?? '—'}</span>
                </div>
                <div className="mobile-card-row">
                  <span>Email</span>
                  <span>{s.email ?? '—'}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button onClick={(e) => { e.stopPropagation(); openEdit(s); }} className="btn btn-ghost btn-xs" style={{ gap: 4 }}>
                    <Edit2 size={12} /> Editar
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(s); }} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)', gap: 4 }}>
                    <Trash2 size={12} /> Eliminar
                  </button>
                </div>
              </div>
            )}
          />
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800, fontSize: 15 }}>{modal === 'create' ? 'Nuevo proveedor' : 'Editar proveedor'}</span>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Nombre *</label>
                  <input value={form.name} onChange={f('name')} placeholder="Razón social" autoFocus />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">CUIT</label>
                  <input value={form.cuit} onChange={f('cuit')} placeholder="20-12345678-9" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Contacto</label>
                  <input value={form.contactName} onChange={f('contactName')} placeholder="Nombre del contacto" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Teléfono</label>
                  <input value={form.phone} onChange={f('phone')} placeholder="+54 351 000-0000" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Email</label>
                  <input type="email" value={form.email} onChange={f('email')} placeholder="proveedor@empresa.com" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Dirección</label>
                  <input value={form.address} onChange={f('address')} placeholder="Av. Colón 1234, Córdoba" />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Notas</label>
                <textarea value={form.notes} onChange={f('notes')} rows={2} placeholder="Notas internas" style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={save} disabled={saving || !form.name.trim()} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : modal === 'create' ? 'Crear' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 340 }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700 }}>Eliminar proveedor</span>
              <button onClick={() => setConfirmDelete(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: 'var(--text2)' }}>¿Eliminar <strong style={{ color: 'var(--text)' }}>{confirmDelete.name}</strong>?</p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setConfirmDelete(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={() => del(confirmDelete)} className="btn btn-danger btn-sm">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
