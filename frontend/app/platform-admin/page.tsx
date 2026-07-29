/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PlatformAdminLayout from '@/components/PlatformAdminLayout';
import api from '@/lib/api';
import type { Tenant, TenantSubscriptionStatus } from '@/types';
import { fmtDate, normalizeArray } from '@/lib/helpers';
import { Building2, Plus, X, Search, Eye } from 'lucide-react';

const statusBadge = (s: TenantSubscriptionStatus) =>
  s === 'ACTIVE' ? 'badge-green' : s === 'PAST_DUE' ? 'badge-amber' : 'badge-red';

const statusLabel = (s: TenantSubscriptionStatus) =>
  s === 'ACTIVE' ? 'Al día' : s === 'PAST_DUE' ? 'Vencido' : 'Suspendido';

const emptyForm = { name: '', slug: '', adminEmail: '', adminPassword: '' };

export default function PlatformAdminTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/platform-admin/tenants');
      setTenants(normalizeArray<Tenant>(data));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const f = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const toggleSuspend = async (tenant: Tenant) => {
    const nextStatus = tenant.subscriptionStatus === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    try {
      await api.patch(`/platform-admin/tenants/${tenant.id}/subscription`, { status: nextStatus });
      showToast(nextStatus === 'SUSPENDED' ? 'Tenant suspendido' : 'Tenant reactivado');
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al actualizar estado');
    }
  };

  const createTenant = async () => {
    if (!form.name.trim() || !form.slug.trim() || !form.adminEmail.trim() || !form.adminPassword.trim()) return;
    setSaving(true);
    try {
      await api.post('/platform-admin/tenants', form);
      showToast('Tenant creado');
      setCreateOpen(false);
      setForm(emptyForm);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al crear tenant');
    } finally {
      setSaving(false);
    }
  };

  const filtered = search.trim()
    ? tenants.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.toLowerCase().includes(search.toLowerCase()))
    : tenants;

  return (
    <PlatformAdminLayout
      title="Tenants"
      subtitle={`${tenants.length} negocios registrados`}
      actions={
        <button onClick={() => setCreateOpen(true)} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
          <Plus size={13} /> Nuevo tenant
        </button>
      }
    >
      {toast && (
        <div style={{ position: 'fixed', top: 70, right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)' }}>{toast}</div>
      )}

      <div style={{ marginBottom: 14 }}>
        <div style={{ position: 'relative', maxWidth: 280 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar tenant..." style={{ paddingLeft: 30, fontSize: 13 }} />
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><Building2 size={32} /><p>Sin tenants</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Negocio</th><th>Slug</th><th>Vence</th><th>Creado</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{t.name}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text2)' }}>{t.slug}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{t.paidUntil ? fmtDate(t.paidUntil) : '—'}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{fmtDate(t.createdAt)}</td>
                    <td>
                      <button onClick={() => toggleSuspend(t)} className={`badge ${statusBadge(t.subscriptionStatus)}`} style={{ cursor: 'pointer', border: 'none' }}>
                        {statusLabel(t.subscriptionStatus)}
                      </button>
                    </td>
                    <td>
                      <Link href={`/platform-admin/tenants/${t.id}`} className="btn btn-ghost btn-xs"><Eye size={12} /></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {createOpen && (
        <div className="modal-overlay" onClick={() => setCreateOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800, fontSize: 15 }}>Nuevo tenant</span>
              <button onClick={() => setCreateOpen(false)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre del negocio *</label>
                <input value={form.name} onChange={f('name')} placeholder="Ej: Almacén Don José" autoFocus />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Slug (subdominio) *</label>
                <input value={form.slug} onChange={f('slug')} placeholder="ej: don-jose" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Email del admin *</label>
                <input type="email" value={form.adminEmail} onChange={f('adminEmail')} placeholder="admin@negocio.com" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Contraseña del admin *</label>
                <input type="password" value={form.adminPassword} onChange={f('adminPassword')} placeholder="••••••••" />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setCreateOpen(false)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button
                onClick={createTenant}
                disabled={saving || !form.name.trim() || !form.slug.trim() || !form.adminEmail.trim() || !form.adminPassword.trim()}
                className="btn btn-primary btn-sm"
              >
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Crear tenant'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PlatformAdminLayout>
  );
}
