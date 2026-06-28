/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import type { ProductCategory } from '@/types';
import { normalizeArray } from '@/lib/helpers';
import { FolderTree, Plus, Edit2, Trash2, X, RefreshCcw } from 'lucide-react';

const emptyForm = { name: '', description: '', isActive: 'true' };

export default function CategoriasPage() {
  const [cats, setCats] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<ProductCategory | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<ProductCategory | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/categories');
      setCats(normalizeArray<ProductCategory>(data));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const openCreate = () => { setForm(emptyForm); setEditing(null); setModal('create'); };
  const openEdit = (c: ProductCategory) => {
    setEditing(c);
    setForm({ name: c.name, description: c.description ?? '', isActive: String(c.isActive) });
    setModal('edit');
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body = { name: form.name, description: form.description || undefined, isActive: form.isActive === 'true' };
      if (modal === 'create') {
        await api.post('/categories', body);
        showToast('Categoría creada');
      } else if (editing) {
        await api.put(`/categories/${editing.id}`, body);
        showToast('Categoría actualizada');
      }
      setModal(null);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al guardar');
    } finally { setSaving(false); }
  };

  const del = async (c: ProductCategory) => {
    try {
      await api.delete(`/categories/${c.id}`);
      showToast('Categoría eliminada');
      load();
    } catch { showToast('Error al eliminar'); }
    setConfirmDelete(null);
  };

  return (
    <AppLayout
      title="Categorías"
      subtitle={`${cats.length} categorías`}
      actions={
        <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
          <Plus size={13} /> Nueva categoría
        </button>
      }
    >
      {toast && (
        <div style={{ position: 'fixed', top: 70, right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)', animation: 'fadeIn 0.2s ease' }}>
          {toast}
        </div>
      )}

      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : cats.length === 0 ? (
          <div className="empty-state"><FolderTree size={32} /><p>Sin categorías</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Nombre</th><th>Slug</th><th>Productos</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {cats.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>{c.name}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{c.slug}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{c._count?.products ?? '—'}</td>
                    <td><span className={`badge ${c.isActive ? 'badge-green' : 'badge-gray'}`}>{c.isActive ? 'Activa' : 'Inactiva'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => openEdit(c)} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                        <button onClick={() => setConfirmDelete(c)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
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
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800 }}>{modal === 'create' ? 'Nueva categoría' : 'Editar categoría'}</span>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre *</label>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Nombre" autoFocus />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Descripción</label>
                <input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Opcional" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Estado</label>
                <select value={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.value }))}>
                  <option value="true">Activa</option>
                  <option value="false">Inactiva</option>
                </select>
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
              <span style={{ fontWeight: 700 }}>Eliminar categoría</span>
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
