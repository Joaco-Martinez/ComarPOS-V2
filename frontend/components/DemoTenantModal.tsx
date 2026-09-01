'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { X, Gift } from 'lucide-react';

type BusinessPreset = { slug: string; label: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  // Precarga desde un prospecto del CRM (ver crm/page.tsx) - leadId hace que
  // el backend marque ese prospecto como status=CLIENTE y lo vincule al
  // tenant creado (ver platformTenant.service.ts#createDemoTenant).
  initial?: { businessName?: string; adminName?: string; phone?: string; leadId?: string };
};

const emptyForm = { businessName: '', adminName: '', adminEmail: '', adminPassword: '', phone: '', businessType: '' };

// Modal compartido por la lista de tenants y el CRM de prospección (doc
// "cuentas demo de 7 días") - crea un tenant en prueba gratis vía
// POST /platform-admin/tenants/demo, distinto del alta gratis-sin-trial que
// ya tenía /platform-admin (POST /platform-admin/tenants).
export default function DemoTenantModal({ open, onClose, onCreated, initial }: Props) {
  const [presets, setPresets] = useState<BusinessPreset[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      ...emptyForm,
      businessName: initial?.businessName ?? '',
      adminName: initial?.adminName ?? '',
      phone: initial?.phone ?? '',
    });
    api.get('/business-presets').then(({ data }) => setPresets((data.content ?? data) ?? [])).catch(() => {});
  }, [open, initial]);

  if (!open) return null;

  const f = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const valid =
    form.businessName.trim() && form.adminName.trim() && form.adminEmail.trim() &&
    form.phone.trim() && form.adminPassword.trim().length >= 6;

  const create = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await api.post('/platform-admin/tenants/demo', {
        ...form,
        businessType: form.businessType || undefined,
        leadId: initial?.leadId,
      });
      toast.success('Cuenta demo creada (vence en 7 días)');
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo crear la cuenta demo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 800, fontSize: 15 }}>Nueva cuenta demo (7 días)</span>
          <button onClick={onClose} className="btn btn-ghost btn-xs"><X size={14} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Nombre del negocio *</label>
            <input value={form.businessName} onChange={f('businessName')} placeholder="Ej: Almacén Don José" autoFocus />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Rubro (precarga categorías/productos de ejemplo)</label>
            <select value={form.businessType} onChange={f('businessType')}>
              <option value="">Sin precarga</option>
              {presets.map((p) => (
                <option key={p.slug} value={p.slug}>{p.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Nombre del contacto *</label>
            <input value={form.adminName} onChange={f('adminName')} placeholder="Ej: José Pérez" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Email *</label>
            <input type="email" value={form.adminEmail} onChange={f('adminEmail')} placeholder="admin@negocio.com" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Teléfono *</label>
            <input value={form.phone} onChange={f('phone')} placeholder="Ej: 351 123 4567" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Contraseña *</label>
            <input type="password" value={form.adminPassword} onChange={f('adminPassword')} placeholder="Mínimo 6 caracteres" />
          </div>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Gift size={13} style={{ color: 'var(--success)', flexShrink: 0 }} />
            Arranca en prueba gratis, vence en 7 días.
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary btn-sm">Cancelar</button>
          <button onClick={create} disabled={saving || !valid} className="btn btn-primary btn-sm">
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Crear cuenta demo'}
          </button>
        </div>
      </div>
    </div>
  );
}
