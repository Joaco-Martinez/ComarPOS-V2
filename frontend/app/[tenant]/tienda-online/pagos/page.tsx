/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Save, Trash2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';

type MpConfig = {
  hasAccessToken: boolean;
  publicKey: string | null;
  status: 'INACTIVE' | 'ACTIVE' | 'ERROR';
  isActive: boolean;
  lastError: string | null;
  lastCheckAt: string | null;
};

export default function TiendaOnlinePagosPage() {
  const [config, setConfig] = useState<MpConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [publicKey, setPublicKey] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/tienda-online/mp-config');
      setConfig(data.content);
      setPublicKey(data.content?.publicKey ?? '');
    } catch (err: any) {
      if (err?.response?.status === 403 && err?.response?.data?.code === 'PLAN_FEATURE_LOCKED') {
        toast.error(err.response.data.message ?? 'La tienda online no está incluida en tu plan actual.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!accessToken.trim()) {
      toast.error('Pegá el Access Token');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.put('/tienda-online/mp-config', {
        accessToken: accessToken.trim(),
        publicKey: publicKey.trim() || null,
      });
      setConfig(data.content);
      setAccessToken('');
      toast.success('Credenciales guardadas y verificadas');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo verificar el Access Token');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      await api.delete('/tienda-online/mp-config');
      setConfig({ hasAccessToken: false, publicKey: null, status: 'INACTIVE', isActive: false, lastError: null, lastCheckAt: null });
      setAccessToken('');
      setPublicKey('');
      toast.success('Credenciales eliminadas');
    } catch {
      toast.error('No se pudieron eliminar las credenciales');
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout title="Tienda Online" subtitle="Pagos con Mercado Pago">
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      </AppLayout>
    );
  }

  if (!config) {
    return (
      <AppLayout title="Tienda Online" subtitle="Pagos con Mercado Pago">
        <div className="card" style={{ padding: 22, textAlign: 'center', color: 'var(--text3)' }}>
          No se pudo cargar la configuración. Puede que este módulo no esté incluido en tu plan.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Tienda Online" subtitle="Cobrá con tu propia cuenta de Mercado Pago">
      <div className="card" style={{ padding: 22, maxWidth: 640, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          {config.isActive ? (
            <><CheckCircle2 size={16} style={{ color: 'var(--success)' }} /><h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Mercado Pago conectado</h2></>
          ) : (
            <><XCircle size={16} style={{ color: 'var(--text3)' }} /><h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Mercado Pago no conectado</h2></>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
          {config.isActive
            ? 'Tus clientes ya pueden pagar con Mercado Pago en el checkout de tu tienda.'
            : 'Cargá tu Access Token para habilitar el pago con Mercado Pago en tu tienda.'}
        </p>
        {config.status === 'ERROR' && config.lastError && (
          <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{config.lastError}</p>
        )}
      </div>

      <div className="card" style={{ padding: 22, maxWidth: 640, marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Credenciales</h2>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 18 }}>
          Sacalas de tu cuenta de Mercado Pago en{' '}
          <a href="https://www.mercadopago.com.ar/developers/panel/app" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            developers.mercadopago.com <ExternalLink size={11} />
          </a>{' '}
          (Credenciales de producción). Solo se guardan encriptadas: nunca se vuelven a mostrar en claro.
        </p>

        <div className="form-group">
          <label className="form-label">Access Token {config.hasAccessToken && <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(ya hay uno cargado, pegá uno nuevo para reemplazarlo)</span>}</label>
          <input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder={config.hasAccessToken ? '••••••••••••••••' : 'APP_USR-...'}
            autoComplete="off"
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Public Key <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(opcional)</span></label>
          <input
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            placeholder="APP_USR-..."
            autoComplete="off"
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={save} disabled={saving} className="btn btn-primary" style={{ gap: 6 }}>
          {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Save size={14} />}
          Guardar y verificar
        </button>
        {config.hasAccessToken && (
          <button onClick={remove} disabled={removing} className="btn btn-secondary" style={{ gap: 6, color: 'var(--danger)' }}>
            <Trash2 size={14} /> Quitar credenciales
          </button>
        )}
      </div>
    </AppLayout>
  );
}
