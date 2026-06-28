/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import type { Supplier } from '@/types';
import { normalizeArray } from '@/lib/helpers';
import { Truck, Plus, Edit2, Trash2, X, Search } from 'lucide-react';

const emptyForm = { name: '', cuit: '', contactName: '', phone: '', email: '', address: '', notes: '' };

export default function ProveedoresPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Supplier | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/suppliers');
      setSuppliers(normalizeArray<Supplier>(data));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

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
        showToast('Proveedor creado');
      } else if (editing) {
        await api.put(`/suppliers/${editing.id}`, body);
        showToast('Proveedor actualizado');
      }
      setModal(null);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al guardar');
    } finally { setSaving(false); }
  };

  const del = async (s: Supplier) => {
    try {
      await api.delete(`/suppliers/${s.id}`);
      showToast('Proveedor eliminado');
      load();
    } catch { showToast('Error al eliminar'); }
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
      {toast && (
        <div style={{ position: 'fixed', top: 70, right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)', animation: 'fadeIn 0.2s ease' }}>{toast}</div>
      )}

      <div style={{ marginBottom: 14 }}>
        <div style={{ position: 'relative', maxWidth: 280 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar proveedor..." style={{ paddingLeft: 30, fontSize: 13 }} />
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><Truck size={32} /><p>Sin proveedores</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Nombre</th><th>CUIT</th><th>Contacto</th><th>Teléfono</th><th>Email</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>{s.name}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{s.cuit ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>{s.contactName ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>{s.phone ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{s.email ?? '—'}</td>
                    <td><span className={`badge ${s.isActive ? 'badge-green' : 'badge-gray'}`}>{s.isActive ? 'Activo' : 'Inactivo'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => openEdit(s)} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                        <button onClick={() => setConfirmDelete(s)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
