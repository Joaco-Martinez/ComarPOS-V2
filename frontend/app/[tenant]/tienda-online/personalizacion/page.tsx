/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useRef, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { BusinessLocation } from '@/types';
import { normalizeArray } from '@/lib/helpers';
import { UploadCloud, Trash2, ImageOff, Save, Copy, ExternalLink, Clock } from 'lucide-react';
import { DAY_NAMES, normalizeBusinessHours, type BusinessHoursDay } from '@/app/tienda/[tenantSlug]/businessHours';
import ImageCropModal from '@/components/ImageCropModal';

const BANNER_WIDTH = 1600;
const BANNER_HEIGHT = 500;

type StorefrontConfig = {
  isEnabled: boolean;
  storeName: string | null;
  description: string | null;
  bannerUrl: string | null;
  bannerId: string | null;
  accentColor: string | null;
  businessHours: unknown;
  pickupEnabled: boolean;
  businessLocationId: string | null;
  transferInstructions: string | null;
};

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
const MAX_SIZE = 8 * 1024 * 1024;

export default function TiendaOnlinePersonalizacionPage() {
  const [config, setConfig] = useState<StorefrontConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [businessLocations, setBusinessLocations] = useState<BusinessLocation[]>([]);
  const [tenantSlug, setTenantSlug] = useState('');
  const [hours, setHours] = useState<BusinessHoursDay[]>([]);
  const [bannerCropFile, setBannerCropFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [cr, blr, tr] = await Promise.all([
        api.get('/tienda-online/config').catch(() => null),
        api.get('/business-locations').catch(() => null),
        api.get('/tenant/me').catch(() => null),
      ]);
      if (cr) {
        setConfig(cr.data.content);
        setHours(normalizeBusinessHours(cr.data.content?.businessHours));
      }
      if (blr) setBusinessLocations(normalizeArray<BusinessLocation>(blr.data).filter((l) => l.isActive));
      if (tr) setTenantSlug(tr.data.tenant?.slug ?? '');
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
    if (!config) return;
    setSaving(true);
    try {
      const { data } = await api.put('/tienda-online/config', { ...config, businessHours: hours });
      setConfig(data.content);
      setHours(normalizeBusinessHours(data.content?.businessHours));
      toast.success('Cambios guardados');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const pickBannerFile = (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Formato inválido. Usá JPG, PNG o WEBP.');
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error('La imagen no puede superar los 8MB.');
      return;
    }
    setBannerCropFile(file);
  };

  const uploadBanner = async (file: File) => {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('banner', file);
      const { data } = await api.post('/tienda-online/banner', body);
      setConfig((c) => (c ? { ...c, bannerUrl: data.bannerUrl } : c));
      toast.success('Banner actualizado');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al subir el banner');
    } finally {
      setUploading(false);
    }
  };

  const removeBanner = async () => {
    try {
      await api.delete('/tienda-online/banner');
      setConfig((c) => (c ? { ...c, bannerUrl: null, bannerId: null } : c));
      toast.success('Banner eliminado');
    } catch {
      toast.error('No se pudo eliminar el banner');
    }
  };

  const storeUrl = typeof window !== 'undefined' && tenantSlug
    ? `${window.location.origin}/tienda/${tenantSlug}`
    : '';

  const copyLink = () => {
    if (!storeUrl) return;
    navigator.clipboard.writeText(storeUrl);
    toast.success('Link copiado');
  };

  if (loading) {
    return (
      <AppLayout title="Tienda Online" subtitle="Personalización">
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      </AppLayout>
    );
  }

  if (!config) {
    return (
      <AppLayout title="Tienda Online" subtitle="Personalización">
        <div className="card" style={{ padding: 22, textAlign: 'center', color: 'var(--text3)' }}>
          No se pudo cargar la configuración. Puede que este módulo no esté incluido en tu plan.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Tienda Online" subtitle="Personalización de tu tienda pública">
      <div className="card" style={{ padding: 22, maxWidth: 640, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Tu tienda está {config.isEnabled ? 'activa' : 'desactivada'}</h2>
            {storeUrl && <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{storeUrl}</p>}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={config.isEnabled}
              onChange={(e) => setConfig({ ...config, isEnabled: e.target.checked })}
              style={{ width: 16, height: 16 }}
            />
            Activada
          </label>
        </div>
        {storeUrl && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copyLink} className="btn btn-secondary btn-xs" style={{ gap: 4 }}><Copy size={12} /> Copiar link</button>
            <a href={storeUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-xs" style={{ gap: 4 }}>
              <ExternalLink size={12} /> Ver tienda
            </a>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 22, maxWidth: 640, marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Marca</h2>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 18 }}>
          Nombre, descripción y color que ven tus clientes en la tienda.
        </p>

        <div className="form-group">
          <label className="form-label">Nombre de la tienda</label>
          <input
            value={config.storeName ?? ''}
            onChange={(e) => setConfig({ ...config, storeName: e.target.value })}
            placeholder="Si lo dejás vacío, se usa el nombre de tu negocio"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Descripción / Sobre nosotros</label>
          <textarea
            value={config.description ?? ''}
            onChange={(e) => setConfig({ ...config, description: e.target.value })}
            placeholder="Contales de qué se trata tu negocio"
            rows={3}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Color de acento</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="color"
              value={config.accentColor ?? '#0d59e7'}
              onChange={(e) => setConfig({ ...config, accentColor: e.target.value })}
              style={{ width: 44, height: 34, padding: 2 }}
            />
            <input
              value={config.accentColor ?? ''}
              onChange={(e) => setConfig({ ...config, accentColor: e.target.value })}
              placeholder="#0D59E7"
              style={{ width: 120 }}
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 22, maxWidth: 640, marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={14} /> Horarios de atención
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
          Se muestran en tu tienda pública. Los días desmarcados aparecen como cerrados.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {hours.map((row, idx) => (
            <div key={row.day} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, width: 110, flexShrink: 0, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) => setHours((h) => h.map((r, i) => i === idx ? { ...r, enabled: e.target.checked } : r))}
                  style={{ width: 15, height: 15 }}
                />
                {DAY_NAMES[row.day]}
              </label>
              <input
                type="time"
                value={row.open}
                disabled={!row.enabled}
                onChange={(e) => setHours((h) => h.map((r, i) => i === idx ? { ...r, open: e.target.value } : r))}
                style={{ width: 110, opacity: row.enabled ? 1 : 0.4 }}
              />
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>a</span>
              <input
                type="time"
                value={row.close}
                disabled={!row.enabled}
                onChange={(e) => setHours((h) => h.map((r, i) => i === idx ? { ...r, close: e.target.value } : r))}
                style={{ width: 110, opacity: row.enabled ? 1 : 0.4 }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 22, maxWidth: 640, marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Banner de portada</h2>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 18 }}>
          Imagen ancha arriba de todo en tu tienda. JPG, PNG o WEBP, máx. 8MB.
          Tamaño recomendado: <strong>{BANNER_WIDTH}×{BANNER_HEIGHT}px</strong> (relación 3.2:1) — después de elegirla vas a poder recortarla para que quede bien encuadrada.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{
            width: 220, height: 74, borderRadius: 8, background: 'var(--surface2)',
            border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
          }}>
            {config.bannerUrl ? (
              <img src={config.bannerUrl} alt="Banner de la tienda" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <ImageOff size={20} style={{ color: 'var(--text3)' }} />
            )}
          </div>
          {config.bannerUrl && (
            <button onClick={removeBanner} className="btn btn-secondary btn-sm" style={{ gap: 6, color: 'var(--danger)' }}>
              <Trash2 size={13} /> Quitar banner
            </button>
          )}
        </div>

        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 8, padding: '24px 16px', borderRadius: 8, cursor: uploading ? 'default' : 'pointer',
            border: '1px dashed var(--border2)', background: 'var(--surface2)',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/jpg"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pickBannerFile(f); e.target.value = ''; }}
          />
          {uploading ? (
            <>
              <span className="spinner" />
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>Subiendo...</span>
            </>
          ) : (
            <>
              <UploadCloud size={20} style={{ color: 'var(--text3)' }} />
              <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>Hacé clic para seleccionar una imagen</span>
            </>
          )}
        </div>
      </div>

      <ImageCropModal
        open={!!bannerCropFile}
        file={bannerCropFile}
        onClose={() => setBannerCropFile(null)}
        onCropped={(cropped) => { setBannerCropFile(null); uploadBanner(cropped); }}
        outputWidth={BANNER_WIDTH}
        outputHeight={BANNER_HEIGHT}
        aspect={BANNER_WIDTH / BANNER_HEIGHT}
        title="Ajustar banner de portada"
        description={`El banner se guarda a ${BANNER_WIDTH}×${BANNER_HEIGHT}px para que se vea bien en toda la tienda. Arrastrá para encuadrar y usá el zoom para acercar.`}
        fileNameFallback="banner"
      />

      <div className="card" style={{ padding: 22, maxWidth: 640, marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Entrega</h2>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 18 }}>
          La tienda online es solo retiro en el local (sin envío a domicilio).
        </p>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Sucursal de la tienda (retiro)</label>
          <select
            value={config.businessLocationId ?? ''}
            onChange={(e) => setConfig({ ...config, businessLocationId: e.target.value || null })}
          >
            <option value="">Sin definir</option>
            {businessLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: 22, maxWidth: 640, marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Transferencia bancaria</h2>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 18 }}>
          Datos que ve el cliente si elige pagar por transferencia (CBU, alias, banco).
        </p>
        <textarea
          value={config.transferInstructions ?? ''}
          onChange={(e) => setConfig({ ...config, transferInstructions: e.target.value })}
          placeholder="CBU: 0000000000000000000000&#10;Alias: mi.negocio.mp&#10;Titular: ..."
          rows={4}
        />
      </div>

      <button onClick={save} disabled={saving} className="btn btn-primary" style={{ gap: 6 }}>
        {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Save size={14} />}
        Guardar cambios
      </button>
    </AppLayout>
  );
}
