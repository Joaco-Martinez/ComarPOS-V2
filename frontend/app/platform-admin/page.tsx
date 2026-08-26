/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import PlatformAdminLayout from '@/components/PlatformAdminLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { Tenant, TenantSubscriptionStatus, BillingPlan, PlanFeatureKey } from '@/types';
import { fmtDate, normalizeArray, daysRemaining } from '@/lib/helpers';
import { Building2, Plus, X, Search, Eye, CreditCard, Gift, LogIn, ShoppingCart, ToggleLeft, ToggleRight, SlidersHorizontal, DollarSign, Save } from 'lucide-react';

type MpPlanRow = { planId: string; mpPlanId: string; status: string };

// Debe cubrir TODOS los PlanFeatureKey (ver types/index.ts / config/billing.ts
// en el backend) -- agrupados igual que el menu para que la grilla de
// "Modulos por plan" sea legible con ~30 filas.
const FEATURE_LABELS: Record<PlanFeatureKey, string> = {
  dashboard: 'Dashboard', pos: 'POS — Ventas', ventas: 'Historial de Ventas', productos: 'Productos',
  categorias: 'Categorías', clientes: 'Clientes', stock: 'Stock', alertas: 'Alertas', caja: 'Caja',
  servicios: 'Servicios / Reparaciones',
  remitos: 'Remitos', facturacion: 'AFIP / Facturas', devoluciones: 'Devoluciones', compras: 'Compras',
  ordenesCompra: 'Órdenes de Compra', proveedores: 'Proveedores', conteoStock: 'Conteo de Stock',
  finanzas: 'Finanzas', gastosRecurrentes: 'Gastos Recurrentes', tipoCambio: 'Tipo de Cambio',
  cuentasCorrientes: 'Cuentas Corrientes', reportes: 'Reportes', objetivosVentas: 'Objetivos de Ventas',
  promociones: 'Promociones', fidelidad: 'Fidelidad', usuarios: 'Usuarios', auditoria: 'Auditoría',
  sucursales: 'Sucursales', arca: 'ARCA / AFIP (config.)', empresa: 'Empresa', printbox: 'PrintBox',
};

const FEATURE_GROUPS: { label: string; keys: PlanFeatureKey[] }[] = [
  { label: 'Ventas y caja', keys: ['pos', 'ventas', 'caja', 'servicios', 'facturacion', 'devoluciones', 'remitos'] },
  { label: 'Catálogo y stock', keys: ['productos', 'categorias', 'stock', 'conteoStock', 'alertas'] },
  { label: 'Clientes', keys: ['clientes', 'cuentasCorrientes', 'fidelidad', 'promociones'] },
  { label: 'Compras', keys: ['compras', 'ordenesCompra', 'proveedores'] },
  { label: 'Finanzas', keys: ['finanzas', 'gastosRecurrentes', 'tipoCambio'] },
  { label: 'Analítica', keys: ['dashboard', 'reportes', 'objetivosVentas'] },
  { label: 'Administración', keys: ['usuarios', 'auditoria', 'sucursales', 'arca', 'empresa', 'printbox'] },
];

const statusBadge = (s: TenantSubscriptionStatus) =>
  s === 'TRIAL' ? 'badge-blue' : s === 'ACTIVE' ? 'badge-green' : s === 'PAST_DUE' ? 'badge-amber' : 'badge-red';

const statusLabel = (s: TenantSubscriptionStatus) =>
  s === 'TRIAL' ? 'Prueba gratis' : s === 'ACTIVE' ? 'Al día' : s === 'PAST_DUE' ? 'Vencido' : 'Suspendido';

const trialLabel = (t: Tenant) => {
  if (t.subscriptionStatus !== 'TRIAL' || !t.trialEndsAt) return null;
  const d = daysRemaining(t.trialEndsAt);
  if (d === null) return null;
  return d > 0 ? `${d}d restantes` : 'Vencida';
};

const emptyForm = { name: '', slug: '', adminEmail: '', adminPassword: '', planId: '' };

export default function PlatformAdminTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [mpPlans, setMpPlans] = useState<MpPlanRow[]>([]);
  const [syncingMpPlans, setSyncingMpPlans] = useState(false);
  const [billingPlans, setBillingPlans] = useState<BillingPlan[]>([]);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [togglingFeature, setTogglingFeature] = useState<string | null>(null);
  const [priceForm, setPriceForm] = useState<Record<string, { priceArs: string; regularPriceArs: string }>>({});
  const [savingPrice, setSavingPrice] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/platform-admin/tenants');
      setTenants(normalizeArray<Tenant>(data));
    } finally {
      setLoading(false);
    }
  };

  const loadMpPlans = async () => {
    try {
      const { data } = await api.get('/platform-admin/mp-plans');
      setMpPlans(normalizeArray<MpPlanRow>(data));
    } catch { /* silencioso: no bloquear el resto del panel */ }
  };

  // Planes de config/billing.ts (precio/limites/features), valores CRUDOS
  // (sin el ajuste de "precio de lanzamiento" que aplica /billing/plans para
  // mostrar en la landing) -- son los que hay que editar tal cual. Se usan
  // para el selector de "Nuevo tenant", la grilla de modulos y el form de
  // precios.
  const loadBillingPlans = async () => {
    try {
      const { data } = await api.get('/platform-admin/plans');
      const plans = normalizeArray<BillingPlan>(data);
      setBillingPlans(plans);
      setPriceForm(Object.fromEntries(plans.map((p) => [p.id, { priceArs: String(p.priceArs), regularPriceArs: String(p.regularPriceArs) }])));
      const recommended = plans.find((p) => p.highlighted) ?? plans[0];
      if (recommended) setForm((p) => (p.planId ? p : { ...p, planId: recommended.id }));
    } catch { /* silencioso: no bloquear el resto del panel */ }
  };

  useEffect(() => { load(); loadMpPlans(); loadBillingPlans(); }, []);

  const planName = (planId: string) => billingPlans.find((p) => p.id === planId)?.name ?? planId;
  const selectedPlan = billingPlans.find((p) => p.id === form.planId) ?? null;

  // Crea (una sola vez, ver mpPlan.service.ts) los 3 planes de
  // config/billing.ts como planes reales en Mercado Pago -- necesita
  // MP_ACCESS_TOKEN configurado en el backend, si no tira un error claro.
  const syncMpPlans = async () => {
    setSyncingMpPlans(true);
    try {
      const { data } = await api.post('/platform-admin/mp-plans/sync');
      setMpPlans(normalizeArray<MpPlanRow>(data));
      toast.success('Planes sincronizados con Mercado Pago');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? err?.response?.data?.error ?? 'No se pudo sincronizar con Mercado Pago');
    } finally {
      setSyncingMpPlans(false);
    }
  };


  const f = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const toggleSuspend = async (tenant: Tenant) => {
    const nextStatus = tenant.subscriptionStatus === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    try {
      await api.patch(`/platform-admin/tenants/${tenant.id}/subscription`, { status: nextStatus });
      toast.success(nextStatus === 'SUSPENDED' ? 'Tenant suspendido' : 'Tenant reactivado');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al actualizar estado');
    }
  };

  // Genera una sesion real del primer ADMIN activo del tenant (ver
  // platformTenant.service.ts, impersonate) y navega ahi -- hard navigation
  // a proposito, para que el store de auth de negocio arranque de cero con
  // la cookie nueva en vez de arrastrar estado del panel de plataforma.
  const impersonate = async (tenant: Tenant) => {
    setImpersonating(tenant.id);
    try {
      const { data } = await api.post(`/platform-admin/tenants/${tenant.id}/impersonate`);
      const user = data.content ?? data;
      if (!user?.tenantSlug) throw new Error('sin tenantSlug');
      window.location.href = `/${user.tenantSlug}/pos`;
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo entrar como este tenant');
      setImpersonating(null);
    }
  };

  // Prende/apaga un modulo para un plan (ver planFeatureConfig.service.ts) --
  // optimista: se ve al toque en la grilla, se revierte si el PATCH falla.
  // El gating real (requirePlanFeature en el backend) y GET /billing/plans
  // (que consume el resto del sistema) leen el mismo override, asi que el
  // cambio aplica al instante sin volver a tocar esta pantalla.
  const toggleFeature = async (planId: string, feature: PlanFeatureKey, enabled: boolean) => {
    const key = `${planId}:${feature}`;
    setTogglingFeature(key);
    const previous = billingPlans;
    setBillingPlans((plans) =>
      plans.map((p) => (p.id === planId ? { ...p, features: { ...p.features, [feature]: enabled } } : p))
    );
    try {
      await api.patch(`/platform-admin/plan-features/${planId}`, { feature, enabled });
      toast.success(`${FEATURE_LABELS[feature]} ${enabled ? 'activado' : 'desactivado'} para ${planName(planId)}`);
    } catch (err: any) {
      setBillingPlans(previous);
      toast.error(err?.response?.data?.message ?? 'No se pudo actualizar el módulo');
    } finally {
      setTogglingFeature(null);
    }
  };

  const savePrice = async (planId: string) => {
    const form = priceForm[planId];
    if (!form) return;
    setSavingPrice(planId);
    try {
      const { data } = await api.patch(`/platform-admin/plan-price/${planId}`, {
        priceArs: Number(form.priceArs),
        regularPriceArs: Number(form.regularPriceArs),
      });
      const updated = data.content ?? data;
      setBillingPlans((plans) => plans.map((p) => (p.id === planId ? { ...p, ...updated } : p)));
      toast.success(`Precio de ${planName(planId)} actualizado`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo actualizar el precio');
    } finally {
      setSavingPrice(null);
    }
  };

  const createTenant = async () => {
    if (!form.name.trim() || !form.slug.trim() || !form.adminEmail.trim() || !form.adminPassword.trim()) return;
    setSaving(true);
    try {
      await api.post('/platform-admin/tenants', form);
      toast.success('Tenant creado gratis, sin pasar por Mercado Pago');
      setCreateOpen(false);
      setForm((p) => ({ ...emptyForm, planId: p.planId }));
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al crear tenant');
    } finally {
      setSaving(false);
    }
  };

  const filtered = search.trim()
    ? tenants.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.toLowerCase().includes(search.toLowerCase()))
    : tenants;

  const trialCount = tenants.filter((t) => t.subscriptionStatus === 'TRIAL').length;

  return (
    <PlatformAdminLayout
      title="Tenants"
      subtitle={`${tenants.length} negocios registrados${trialCount ? ` · ${trialCount} en prueba gratis` : ''}`}
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={syncMpPlans} disabled={syncingMpPlans} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
            {syncingMpPlans ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <CreditCard size={13} />}
            {mpPlans.length >= 3 ? 'Re-sincronizar planes MP' : 'Crear planes en Mercado Pago'}
          </button>
          <button onClick={() => setCreateOpen(true)} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
            <Plus size={13} /> Nuevo tenant
          </button>
        </div>
      }
    >
      {mpPlans.length > 0 && (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: 0.5, fontFamily: 'var(--mono)' }}>PLANES EN MERCADO PAGO</span>
          {mpPlans.map((p) => (
            <span key={p.planId} style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.status === 'active' ? 'var(--success)' : 'var(--text3)' }} />
              {p.planId} ({p.status})
            </span>
          ))}
        </div>
      )}

      {billingPlans.length > 0 && (
        <div className="card" style={{ padding: '16px 18px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <DollarSign size={14} style={{ color: 'var(--text3)' }} />
            <span style={{ fontWeight: 700, fontSize: 13 }}>Precio por plan</span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>— precio de lanzamiento y precio de lista (tachado), en ARS/mes</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))', gap: 12 }}>
            {billingPlans.map((p) => {
              const form = priceForm[p.id] ?? { priceArs: String(p.priceArs), regularPriceArs: String(p.regularPriceArs) };
              return (
                <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{p.name}</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label className="form-label" style={{ fontSize: 10 }}>Lanzamiento</label>
                      <input
                        type="number" min="0" value={form.priceArs}
                        onChange={(e) => setPriceForm((prev) => ({ ...prev, [p.id]: { ...form, priceArs: e.target.value } }))}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="form-label" style={{ fontSize: 10 }}>Lista</label>
                      <input
                        type="number" min="0" value={form.regularPriceArs}
                        onChange={(e) => setPriceForm((prev) => ({ ...prev, [p.id]: { ...form, regularPriceArs: e.target.value } }))}
                      />
                    </div>
                  </div>
                  <button onClick={() => savePrice(p.id)} disabled={savingPrice === p.id} className="btn btn-secondary btn-sm" style={{ width: '100%', gap: 6 }}>
                    {savingPrice === p.id ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Save size={13} />}
                    Guardar precio
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {billingPlans.length > 0 && (
        <div className="card" style={{ padding: '16px 18px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <SlidersHorizontal size={14} style={{ color: 'var(--text3)' }} />
            <span style={{ fontWeight: 700, fontSize: 13 }}>Módulos por plan</span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>— se aplica al instante a todos los tenants de ese plan</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Módulo</th>
                  {billingPlans.map((p) => <th key={p.id}>{p.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {FEATURE_GROUPS.map((group) => (
                  <Fragment key={group.label}>
                    <tr>
                      <td colSpan={billingPlans.length + 1} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, paddingTop: 14 }}>
                        {group.label}
                      </td>
                    </tr>
                    {group.keys.map((feature) => (
                      <tr key={feature}>
                        <td style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{FEATURE_LABELS[feature]}</td>
                        {billingPlans.map((p) => {
                          const enabled = !!p.features[feature];
                          const key = `${p.id}:${feature}`;
                          return (
                            <td key={p.id}>
                              <button
                                onClick={() => toggleFeature(p.id, feature, !enabled)}
                                disabled={togglingFeature === key}
                                className="btn btn-ghost btn-xs"
                                style={{ color: enabled ? 'var(--success)' : 'var(--text3)', gap: 6 }}
                              >
                                {togglingFeature === key ? (
                                  <span className="spinner" style={{ width: 13, height: 13 }} />
                                ) : enabled ? (
                                  <ToggleRight size={18} />
                                ) : (
                                  <ToggleLeft size={18} />
                                )}
                                <span style={{ fontSize: 11 }}>{enabled ? 'Activo' : 'Inactivo'}</span>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
                <tr><th>Negocio</th><th>Slug</th><th>Plan</th><th>Último acceso</th><th>Ventas</th><th>Vence</th><th>Cuentas</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{t.name}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text2)' }}>{t.slug}</td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{planName(t.planId)}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: t.lastLoginAt ? 'var(--text2)' : 'var(--text3)' }}>
                      {t.lastLoginAt ? fmtDate(t.lastLoginAt) : 'Nunca'}
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }} title={t.lastSaleAt ? `Última venta: ${fmtDate(t.lastSaleAt)}` : 'Sin ventas'}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: (t.salesCount ?? 0) > 0 ? 'var(--text)' : 'var(--text3)' }}>
                        <ShoppingCart size={11} /> {t.salesCount ?? 0}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                      {t.subscriptionStatus === 'TRIAL'
                        ? (t.trialEndsAt ? fmtDate(t.trialEndsAt) : '—')
                        : (t.paidUntil ? fmtDate(t.paidUntil) : '—')}
                    </td>
                    <td
                      style={{ fontSize: 12, color: 'var(--text2)' }}
                      title={t.users?.map((u) => `${u.email}${u.lastLoginAt ? ` (último ingreso ${fmtDate(u.lastLoginAt)})` : ' (nunca ingresó)'}`).join('\n')}
                    >
                      {t.users?.length ?? 0}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={() => toggleSuspend(t)} className={`badge ${statusBadge(t.subscriptionStatus)}`} style={{ cursor: 'pointer', border: 'none' }}>
                          {statusLabel(t.subscriptionStatus)}
                        </button>
                        {trialLabel(t) && (
                          <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{trialLabel(t)}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Link href={`/platform-admin/tenants/${t.id}`} className="btn btn-ghost btn-xs" title="Ver detalle"><Eye size={12} /></Link>
                        <button
                          onClick={() => impersonate(t)}
                          disabled={impersonating === t.id}
                          className="btn btn-ghost btn-xs"
                          title="Entrar como este tenant"
                        >
                          {impersonating === t.id ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <LogIn size={12} />}
                        </button>
                      </div>
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
                <label className="form-label">Slug (identificador) *</label>
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
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Plan</label>
                <select value={form.planId} onChange={f('planId')}>
                  {billingPlans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.highlighted ? ' (recomendado)' : ''}</option>
                  ))}
                </select>
              </div>

              {selectedPlan && (
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, color: 'var(--success)', fontWeight: 700 }}>
                    <Gift size={13} /> Se crea gratis, sin Mercado Pago
                  </div>
                  Sucursales: {selectedPlan.limits.maxBusinessLocations ?? 'ilimitadas'} · Productos: {selectedPlan.limits.maxProducts ?? 'ilimitados'} · Usuarios: {selectedPlan.limits.maxUsers ?? 'ilimitados'}
                  <br />
                  Módulos incluidos: {Object.values(selectedPlan.features).filter(Boolean).length} de {Object.keys(selectedPlan.features).length}
                  {' '}<span style={{ color: 'var(--text3)' }}>(configurable en &quot;Módulos por plan&quot; abajo)</span>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setCreateOpen(false)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button
                onClick={createTenant}
                disabled={saving || !form.name.trim() || !form.slug.trim() || !form.adminEmail.trim() || !form.adminPassword.trim()}
                className="btn btn-primary btn-sm"
              >
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Crear tenant gratis'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PlatformAdminLayout>
  );
}
