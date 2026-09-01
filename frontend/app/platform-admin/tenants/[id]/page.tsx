/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PlatformAdminLayout from '@/components/PlatformAdminLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { Tenant, TenantSubscriptionStatus, BillingPlan, PlanFeatureKey } from '@/types';
import { fmtDate, daysRemaining, normalizeArray, fmtMoney } from '@/lib/helpers';
import { FEATURE_LABELS, FEATURE_GROUPS } from '@/lib/planFeatureGroups';
import { ArrowLeft, History, Save, Users, LogIn, Activity, SlidersHorizontal, ToggleLeft, ToggleRight, Trash2, X, AlertTriangle } from 'lucide-react';

const statusBadge = (s: TenantSubscriptionStatus) =>
  s === 'TRIAL' ? 'badge-blue' : s === 'ACTIVE' ? 'badge-green' : s === 'PAST_DUE' ? 'badge-amber' : 'badge-red';

const statusLabel = (s: TenantSubscriptionStatus) =>
  s === 'TRIAL' ? 'Prueba gratis' : s === 'ACTIVE' ? 'Al día' : s === 'PAST_DUE' ? 'Vencido' : 'Suspendido';

export default function PlatformAdminTenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<TenantSubscriptionStatus>('ACTIVE');
  const [note, setNote] = useState('');
  const [paidUntil, setPaidUntil] = useState('');
  const [trialEndsAt, setTrialEndsAt] = useState('');
  const [planId, setPlanId] = useState('');
  const [saving, setSaving] = useState(false);
  const [billingPlans, setBillingPlans] = useState<BillingPlan[]>([]);
  const [impersonating, setImpersonating] = useState(false);
  const [togglingFeature, setTogglingFeature] = useState<PlanFeatureKey | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/platform-admin/tenants/${id}`);
      const t: Tenant = data.content ?? data;
      setTenant(t);
      setStatus(t.subscriptionStatus);
      setNote(t.notes ?? '');
      setPaidUntil(t.paidUntil ? t.paidUntil.slice(0, 10) : '');
      setTrialEndsAt(t.trialEndsAt ? t.trialEndsAt.slice(0, 10) : '');
      setPlanId(t.planId);
    } finally {
      setLoading(false);
    }
  };

  const loadBillingPlans = async () => {
    try {
      const { data } = await api.get('/billing/plans');
      setBillingPlans(normalizeArray<BillingPlan>(data));
    } catch { /* silencioso */ }
  };

  useEffect(() => { if (id) load(); loadBillingPlans(); }, [id]);


  const impersonate = async () => {
    setImpersonating(true);
    try {
      const { data } = await api.post(`/platform-admin/tenants/${id}/impersonate`);
      const user = data.content ?? data;
      if (!user?.tenantSlug) throw new Error('sin tenantSlug');
      window.location.href = `/${user.tenantSlug}/pos`;
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo entrar como este tenant');
      setImpersonating(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/platform-admin/tenants/${id}/subscription`, {
        status,
        note,
        planId,
        ...(paidUntil ? { paidUntil } : {}),
        ...(trialEndsAt ? { trialEndsAt } : {}),
      });
      toast.success('Estado actualizado');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const deleteTenant = async () => {
    if (!tenant || deleteConfirmText.trim() !== tenant.name) return;
    setDeleting(true);
    try {
      await api.delete(`/platform-admin/tenants/${id}`);
      toast.success('Tenant eliminado');
      router.push('/platform-admin');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo eliminar el tenant');
      setDeleting(false);
    }
  };

  const toggleTenantFeature = async (feature: PlanFeatureKey, enabled: boolean) => {
    setTogglingFeature(feature);
    try {
      await api.patch(`/platform-admin/tenants/${id}/feature-overrides`, { feature, enabled });
      toast.success(`${FEATURE_LABELS[feature]} ${enabled ? 'activado' : 'desactivado'} para este tenant`);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al guardar');
    } finally {
      setTogglingFeature(null);
    }
  };

  if (loading || !tenant) {
    return (
      <PlatformAdminLayout title="Tenant">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
      </PlatformAdminLayout>
    );
  }

  return (
    <PlatformAdminLayout
      title={tenant.name}
      subtitle={tenant.slug}
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={impersonate} disabled={impersonating} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
            {impersonating ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <LogIn size={13} />}
            Entrar como este tenant
          </button>
          <button onClick={() => router.push('/platform-admin')} className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
            <ArrowLeft size={13} /> Volver
          </button>
          <button
            onClick={() => { setDeleteConfirmText(''); setDeleteOpen(true); }}
            className="btn btn-ghost btn-sm"
            style={{ gap: 6, color: 'var(--danger)' }}
          >
            <Trash2 size={13} /> Eliminar tenant
          </button>
        </div>
      }
    >
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Activity size={15} style={{ color: 'var(--text3)' }} />
          <span style={{ fontWeight: 700, fontSize: 13 }}>Uso real</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10 }}>
          {[
            { label: 'Último acceso', value: tenant.lastLoginAt ? fmtDate(tenant.lastLoginAt) : 'Nunca' },
            { label: 'Ventas totales', value: String(tenant.salesCount ?? 0) },
            { label: 'Última venta', value: tenant.lastSaleAt ? fmtDate(tenant.lastSaleAt) : '—' },
            { label: 'Facturado (no cancel.)', value: fmtMoney(tenant.totalRevenue ?? 0) },
            { label: 'Productos cargados', value: String(tenant.productsCount ?? 0) },
          ].map((s) => (
            <div key={s.label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginTop: 4, fontFamily: 'var(--mono)' }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span className={`badge ${statusBadge(tenant.subscriptionStatus)}`}>{statusLabel(tenant.subscriptionStatus)}</span>
          {tenant.subscriptionStatus === 'TRIAL' && tenant.trialEndsAt && (
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              {(() => {
                const d = daysRemaining(tenant.trialEndsAt);
                return d !== null && d > 0 ? `Vence en ${d} día${d === 1 ? '' : 's'} (${fmtDate(tenant.trialEndsAt)})` : `Venció el ${fmtDate(tenant.trialEndsAt)}`;
              })()}
            </span>
          )}
          {tenant.suspendedAt && <span style={{ fontSize: 11, color: 'var(--text3)' }}>Suspendido el {fmtDate(tenant.suspendedAt)}</span>}
          {tenant.contactPhone && (
            <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Tel: {tenant.contactPhone}</span>
          )}
          {tenant.mpPreapprovalId && (
            <span className="badge badge-cyan" title={tenant.mpPreapprovalId}>
              Mercado Pago{tenant.mpSubscriptionAmount ? ` · $${tenant.mpSubscriptionAmount.toLocaleString('es-AR')}/mes` : ''}
            </span>
          )}
        </div>

        <div className="grid-responsive" style={{ gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Estado de suscripción</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as TenantSubscriptionStatus)}>
              <option value="TRIAL">Prueba gratis</option>
              <option value="ACTIVE">Al día</option>
              <option value="PAST_DUE">Vencido</option>
              <option value="SUSPENDED">Suspendido</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Plan</label>
            <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
              {billingPlans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Pago cubierto hasta</label>
            <input type="date" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Prueba gratis vence</label>
            <input type="date" value={trialEndsAt} onChange={(e) => setTrialEndsAt(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label className="form-label">Notas</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Ej: paga siempre por transferencia el día 5" />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={save} disabled={saving} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <><Save size={13} /> Guardar</>}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <SlidersHorizontal size={15} style={{ color: 'var(--text3)' }} />
          <span style={{ fontWeight: 700, fontSize: 13 }}>Módulos para este tenant</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 14 }}>
          Por defecto usa lo que incluye su plan ({billingPlans.find((p) => p.id === tenant.planId)?.name ?? tenant.planId}). Activar/desactivar acá pisa el plan solo para este tenant — útil para módulos verticales como Hotelería, que no dependen del plan.
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Módulo</th><th>Plan</th><th>Este tenant</th></tr></thead>
            <tbody>
              {FEATURE_GROUPS.flatMap((g) => g.keys).map((feature) => {
                const planEnabled = !!billingPlans.find((p) => p.id === tenant.planId)?.features[feature];
                const override = tenant.featureOverrides?.[feature];
                const effective = override !== undefined ? override : planEnabled;
                return (
                  <tr key={feature}>
                    <td style={{ fontSize: 12, color: 'var(--text)' }}>{FEATURE_LABELS[feature]}</td>
                    <td style={{ fontSize: 11, color: 'var(--text3)' }}>{planEnabled ? 'Incluido' : 'No incluido'}</td>
                    <td>
                      <button
                        onClick={() => toggleTenantFeature(feature, !effective)}
                        disabled={togglingFeature === feature}
                        className="btn btn-ghost btn-xs"
                        style={{ color: effective ? 'var(--success)' : 'var(--text3)', gap: 6 }}
                      >
                        {togglingFeature === feature ? (
                          <span className="spinner" style={{ width: 13, height: 13 }} />
                        ) : effective ? (
                          <ToggleRight size={18} />
                        ) : (
                          <ToggleLeft size={18} />
                        )}
                        <span style={{ fontSize: 11 }}>
                          {effective ? 'Activo' : 'Inactivo'}{override !== undefined ? ' (forzado)' : ''}
                        </span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Users size={15} style={{ color: 'var(--text3)' }} />
          <span style={{ fontWeight: 700, fontSize: 13 }}>Cuentas ({tenant.users?.length ?? 0})</span>
        </div>

        {!tenant.users || tenant.users.length === 0 ? (
          <div className="empty-state"><p>Sin cuentas creadas todavía</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Alta</th><th>Último ingreso</th></tr>
              </thead>
              <tbody>
                {tenant.users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontSize: 12 }}>
                      {u.name}
                      {u.isActive === false && <span className="badge badge-red" style={{ marginLeft: 6 }}>Deshabilitado</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{u.email}</td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{u.role}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{u.createdAt ? fmtDate(u.createdAt) : '—'}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: u.lastLoginAt ? 'var(--text)' : 'var(--text3)' }}>
                      {u.lastLoginAt ? fmtDate(u.lastLoginAt) : 'Nunca'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <History size={15} style={{ color: 'var(--text3)' }} />
          <span style={{ fontWeight: 700, fontSize: 13 }}>Historial de pagos</span>
        </div>

        {!tenant.paymentLogs || tenant.paymentLogs.length === 0 ? (
          <div className="empty-state"><p>Sin movimientos registrados</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Fecha</th><th>Cambio</th><th>Nota</th><th>Admin</th></tr>
              </thead>
              <tbody>
                {tenant.paymentLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{fmtDate(log.createdAt)}</td>
                    <td style={{ fontSize: 12 }}>
                      <span className={`badge ${statusBadge(log.previousStatus)}`}>{statusLabel(log.previousStatus)}</span>
                      {' → '}
                      <span className={`badge ${statusBadge(log.newStatus)}`}>{statusLabel(log.newStatus)}</span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{log.note ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{log.platformAdmin?.name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteOpen && (
        <div className="modal-overlay" onClick={() => !deleting && setDeleteOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--danger)' }}>Eliminar tenant</span>
              <button onClick={() => setDeleteOpen(false)} className="btn btn-ghost btn-xs" disabled={deleting}><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: 'var(--danger)', display: 'flex', gap: 8 }}>
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>
                  Esto borra <strong>todo</strong> lo de &quot;{tenant.name}&quot; para siempre: ventas, productos, clientes, facturas, usuarios — no se puede deshacer. Usá &quot;Suspendido&quot; en vez de esto si solo querés bloquearlo.
                </span>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Escribí <strong>{tenant.name}</strong> para confirmar</label>
                <input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder={tenant.name} disabled={deleting} autoFocus />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setDeleteOpen(false)} className="btn btn-secondary btn-sm" disabled={deleting}>Cancelar</button>
              <button
                onClick={deleteTenant}
                disabled={deleting || deleteConfirmText.trim() !== tenant.name}
                className="btn btn-sm"
                style={{ background: 'var(--danger)', color: '#fff', gap: 6 }}
              >
                {deleting ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <><Trash2 size={13} /> Eliminar para siempre</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </PlatformAdminLayout>
  );
}
