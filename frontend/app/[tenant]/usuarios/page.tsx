/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import type { User } from '@/types';
import { fmtDate, normalizeArray } from '@/lib/helpers';
import { UserCog, Plus, Edit2, X, ShieldCheck } from 'lucide-react';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
import FilterBar from '@/components/mobile/FilterBar';

const roleBadge = (r: string) =>
  r === 'ADMIN' ? 'badge-blue' : r === 'EMPLEADO' ? 'badge-green' : 'badge-gray';

const emptyForm = { name: '', email: '', password: '', role: 'EMPLEADO' };

export default function UsuariosPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/users');
      setUsers(normalizeArray<User>(data));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const f = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const openCreate = () => { setForm(emptyForm); setEditing(null); setModal('create'); };
  const openEdit = (u: User) => {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: '', role: u.role });
    setModal('edit');
  };

  const save = async () => {
    if (!form.name.trim() || !form.email.trim()) return;
    setSaving(true);
    try {
      const body: Record<string, any> = { name: form.name, email: form.email, role: form.role };
      if (form.password) body.password = form.password;
      if (modal === 'create') {
        await api.post('/users', { ...body, password: form.password });
        showToast('Usuario creado');
      } else if (editing) {
        await api.put(`/users/${editing.id}`, body);
        showToast('Usuario actualizado');
      }
      setModal(null);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al guardar');
    } finally { setSaving(false); }
  };

  const toggleActive = async (u: User) => {
    try {
      await api.put(`/users/${u.id}`, { isActive: !u.isActive });
      load();
    } catch { showToast('Error al cambiar estado'); }
  };

  const filtered = search.trim()
    ? users.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
    : users;

  return (
    <AppLayout
      title="Usuarios"
      subtitle={`${users.length} usuarios registrados`}
      actions={
        <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
          <Plus size={13} /> Nuevo usuario
        </button>
      }
    >
      {toast && (
        <div style={{ position: 'fixed', top: 'calc(var(--app-header-height, 56px) + 14px)', right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)', animation: 'fadeIn 0.2s ease' }}>{toast}</div>
      )}

      <div style={{ marginBottom: 14 }}>
        <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Buscar usuario..." />
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : (
          <ResponsiveTable
            data={filtered}
            keyFor={(u) => u.id}
            emptyIcon={UserCog}
            emptyMessage="Sin usuarios"
            columns={[
              {
                key: 'usuario', header: 'Usuario', render: (u) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-dim)', border: '1px solid rgba(13,89,231,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
                      {u.name[0].toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{u.name}</span>
                    {u.role === 'ADMIN' && <ShieldCheck size={13} style={{ color: 'var(--accent)' }} />}
                  </div>
                ),
              },
              { key: 'email', header: 'Email', render: (u) => <span style={{ fontSize: 12, color: 'var(--text2)' }}>{u.email}</span> },
              { key: 'rol', header: 'Rol', render: (u) => <span className={`badge ${roleBadge(u.role)}`}>{u.role}</span> },
              { key: 'creado', header: 'Creado', render: (u) => <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{fmtDate(u.createdAt)}</span> },
              {
                key: 'estado', header: 'Estado', render: (u) => (
                  <button onClick={() => toggleActive(u)} className={`badge ${u.isActive !== false ? 'badge-green' : 'badge-gray'}`} style={{ cursor: 'pointer', border: 'none', background: undefined }}>
                    {u.isActive !== false ? 'Activo' : 'Inactivo'}
                  </button>
                ),
              },
              {
                key: 'acciones', header: '', render: (u) => (
                  <button onClick={() => openEdit(u)} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                ),
              },
            ] as ResponsiveTableColumn<User>[]}
            renderMobileCard={(u) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="mobile-card-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent-dim)', border: '1px solid rgba(13,89,231,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
                      {u.name[0].toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{u.name}</span>
                    {u.role === 'ADMIN' && <ShieldCheck size={13} style={{ color: 'var(--accent)' }} />}
                  </div>
                  <button onClick={() => toggleActive(u)} className={`badge ${u.isActive !== false ? 'badge-green' : 'badge-gray'}`} style={{ cursor: 'pointer', border: 'none', background: undefined }}>
                    {u.isActive !== false ? 'Activo' : 'Inactivo'}
                  </button>
                </div>
                <div className="mobile-card-row">
                  <span style={{ color: 'var(--text2)' }}>{u.email}</span>
                  <span className={`badge ${roleBadge(u.role)}`}>{u.role}</span>
                </div>
                <div className="mobile-card-row">
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{fmtDate(u.createdAt)}</span>
                  <button onClick={() => openEdit(u)} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                </div>
              </div>
            )}
          />
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800, fontSize: 15 }}>{modal === 'create' ? 'Nuevo usuario' : 'Editar usuario'}</span>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre *</label>
                <input value={form.name} onChange={f('name')} placeholder="Nombre completo" autoFocus />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Email *</label>
                <input type="email" value={form.email} onChange={f('email')} placeholder="usuario@empresa.com" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">{modal === 'create' ? 'Contraseña *' : 'Nueva contraseña (dejar vacío para no cambiar)'}</label>
                <input type="password" value={form.password} onChange={f('password')} placeholder="••••••••" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Rol</label>
                <select value={form.role} onChange={f('role')}>
                  <option value="EMPLEADO">Empleado</option>
                  <option value="ADMIN">Administrador</option>
                  <option value="CLIENTE">Cliente</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={save} disabled={saving || !form.name.trim() || !form.email.trim() || (modal === 'create' && !form.password)} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : modal === 'create' ? 'Crear usuario' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
