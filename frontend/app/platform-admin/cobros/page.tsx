/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import PlatformAdminLayout from '@/components/PlatformAdminLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { TransferInfo } from '@/types';
import { Landmark, Save, ToggleLeft, ToggleRight } from 'lucide-react';

// Cuenta bancaria donde los negocios transfieren la suscripción (ver backend
// platformSettings.service.ts). Lo que se guarda acá es lo que ven en
// /suscripcion al elegir "Transferencia" -- sin CBU ni alias, o con el
// switch apagado, la opción no se les ofrece.
const emptyForm = { enabled: false, holder: '', cuit: '', bank: '', cbu: '', alias: '' };

export default function PlatformAdminCobrosPage() {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const applyAccount = (a: TransferInfo) =>
    setForm({
      enabled: a.enabled,
      holder: a.holder ?? '',
      cuit: a.cuit ?? '',
      bank: a.bank ?? '',
      cbu: a.cbu ?? '',
      alias: a.alias ?? '',
    });

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/platform-admin/settings/transfer-account');
        applyAccount(data.content ?? data);
      } catch {
        toast.error('No se pudo cargar la cuenta para transferencias');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put('/platform-admin/settings/transfer-account', form);
      applyAccount(data.content ?? data);
      toast.success('Datos de cobro guardados');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof Omit<typeof emptyForm, 'enabled'>, label: string, placeholder: string, mono = false) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        style={mono ? { fontFamily: 'var(--mono)' } : undefined}
      />
    </div>
  );

  return (
    <PlatformAdminLayout title="Cobros" subtitle="Datos para que los negocios paguen el servicio por transferencia">
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
      ) : (
        <div className="card" style={{ padding: 20, maxWidth: 560 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Landmark size={15} style={{ color: 'var(--text3)' }} />
              <span style={{ fontWeight: 700, fontSize: 13 }}>Pago por transferencia</span>
            </div>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
              className="btn btn-ghost btn-sm"
              style={{ gap: 6, color: form.enabled ? 'var(--success)' : 'var(--text3)' }}
            >
              {form.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
              {form.enabled ? 'Habilitado' : 'Deshabilitado'}
            </button>
          </div>

          <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5, marginBottom: 16 }}>
            Estos datos los ven los negocios en Suscripción y en el aviso de vencimiento. Cuando informan una transferencia,
            la confirmás desde el detalle del negocio.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {field('alias', 'Alias', 'comarpos.cobros')}
            {field('cbu', 'CBU / CVU (22 dígitos)', '0000000000000000000000', true)}
            {field('holder', 'Titular', 'Nombre o razón social')}
            {field('cuit', 'CUIT', '20-12345678-9', true)}
            {field('bank', 'Banco / billetera', 'Banco Nación, Mercado Pago, etc.')}
          </div>

          <button onClick={save} disabled={saving} className="btn btn-primary" style={{ marginTop: 12, gap: 8 }}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <><Save size={14} /> Guardar</>}
          </button>
        </div>
      )}
    </PlatformAdminLayout>
  );
}
