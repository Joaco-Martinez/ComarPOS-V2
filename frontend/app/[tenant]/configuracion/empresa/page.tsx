/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useRef, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import ImageCropModal from '@/components/ImageCropModal';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Building2, UploadCloud, Trash2, ImageOff, Save } from 'lucide-react';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
const MAX_SIZE = 5 * 1024 * 1024;
const LOGO_IMAGE_SIZE = 512;

type TenantInfo = {
  name: string;
  ticketBusinessName: string | null;
  ticketCuit: string | null;
  ticketAddress: string | null;
  ticketPhone: string | null;
  ticketEmail: string | null;
  deliveryPricePerKm: number | null;
};

const emptyInfo: TenantInfo = {
  name: '',
  ticketBusinessName: '',
  ticketCuit: '',
  ticketAddress: '',
  ticketPhone: '',
  ticketEmail: '',
  deliveryPricePerKm: null,
};

export default function EmpresaPage() {
  const { user } = useAuthStore();
  const tenantId = user?.tenantId;

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState('');
  const [cropSourceFile, setCropSourceFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [info, setInfo] = useState<TenantInfo>(emptyInfo);
  const [infoLoading, setInfoLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = async () => {
    if (!tenantId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get(`/uploads/logo/${tenantId}`);
      setLogoUrl(data.logoUrl ?? null);
    } catch {
      setLogoUrl(null);
    } finally {
      setLoading(false);
    }
  };

  const loadInfo = async () => {
    setInfoLoading(true);
    try {
      const { data } = await api.get('/tenant/me');
      setInfo({
        name: data.tenant?.name ?? '',
        ticketBusinessName: data.tenant?.ticketBusinessName ?? '',
        ticketCuit: data.tenant?.ticketCuit ?? '',
        ticketAddress: data.tenant?.ticketAddress ?? '',
        ticketPhone: data.tenant?.ticketPhone ?? '',
        ticketEmail: data.tenant?.ticketEmail ?? '',
        deliveryPricePerKm: data.tenant?.deliveryPricePerKm ?? null,
      });
    } catch {
      setInfo(emptyInfo);
    } finally {
      setInfoLoading(false);
    }
  };

  useEffect(() => { load(); }, [tenantId]);
  useEffect(() => { loadInfo(); }, []);

  const saveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/tenant/me', info);
      showToast('Datos guardados correctamente');
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al guardar los datos');
    } finally {
      setSaving(false);
    }
  };

  const validateFile = (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      showToast('Formato inválido. Usá JPG, PNG o WEBP.');
      return false;
    }
    if (file.size > MAX_SIZE) {
      showToast('La imagen no puede superar los 5MB.');
      return false;
    }
    return true;
  };

  const upload = async (file: File) => {
    if (!validateFile(file)) return;
    setUploading(true);
    setProgress(0);
    try {
      const body = new FormData();
      body.append('logo', file);
      const { data } = await api.post('/uploads/logo', body, {
        onUploadProgress: (evt) => {
          const percent = Math.round((evt.loaded * 100) / (evt.total || file.size));
          setProgress(percent);
        },
      });
      setLogoUrl(data.logoUrl ?? null);
      showToast('Logo actualizado correctamente');
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al subir el logo');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const remove = async () => {
    if (!tenantId) return;
    setDeleting(true);
    try {
      await api.delete(`/uploads/logo/${tenantId}`);
      setLogoUrl(null);
      showToast('Logo eliminado');
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al eliminar el logo');
    } finally {
      setDeleting(false);
    }
  };

  const pickFile = (file: File) => {
    if (!validateFile(file)) return;
    setCropSourceFile(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) pickFile(file);
  };

  const handleCropped = (file: File) => {
    setCropSourceFile(null);
    upload(file);
  };

  return (
    <AppLayout title="Datos de la Empresa" subtitle="Razón social, CUIT, logo y marca para documentos">
      {toast && (
        <div style={{ position: 'fixed', top: 'calc(var(--app-header-height, 56px) + 14px)', right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)', animation: 'fadeIn 0.2s ease' }}>{toast}</div>
      )}

      <div className="card" style={{ padding: 22, maxWidth: 560, marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Datos del negocio</h2>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 18 }}>
          Se imprimen en tickets, cotizaciones y remitos.
        </p>

        {infoLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 }}><div className="spinner" /></div>
        ) : (
          <form onSubmit={saveInfo}>
            <div className="form-group">
              <label className="form-label">Razón social</label>
              <input
                value={info.name}
                onChange={(e) => setInfo((i) => ({ ...i, name: e.target.value }))}
                placeholder="Ej: Almacén Don José S.R.L."
                disabled={saving}
                required
              />
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                Nombre legal del negocio. Es el que se usa por defecto para ARCA/AFIP.
              </p>
            </div>
            <div className="form-group">
              <label className="form-label">Nombre de fantasía</label>
              <input
                value={info.ticketBusinessName ?? ''}
                onChange={(e) => setInfo((i) => ({ ...i, ticketBusinessName: e.target.value }))}
                placeholder="Ej: Almacén Don José"
                disabled={saving}
              />
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                Es el que aparece como nombre del negocio en tickets y comprobantes. Si lo dejás vacío, se usa la razón social.
              </p>
            </div>
            <div className="form-group">
              <label className="form-label">CUIT</label>
              <input
                value={info.ticketCuit ?? ''}
                onChange={(e) => setInfo((i) => ({ ...i, ticketCuit: e.target.value }))}
                placeholder="30-12345678-9"
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Dirección</label>
              <input
                value={info.ticketAddress ?? ''}
                onChange={(e) => setInfo((i) => ({ ...i, ticketAddress: e.target.value }))}
                placeholder="Calle 123, Ciudad"
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Teléfono</label>
              <input
                value={info.ticketPhone ?? ''}
                onChange={(e) => setInfo((i) => ({ ...i, ticketPhone: e.target.value }))}
                placeholder="011 1234-5678"
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                value={info.ticketEmail ?? ''}
                onChange={(e) => setInfo((i) => ({ ...i, ticketEmail: e.target.value }))}
                placeholder="contacto@minegocio.com"
                disabled={saving}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Precio de envío por km</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={info.deliveryPricePerKm ?? ''}
                onChange={(e) => setInfo((i) => ({
                  ...i,
                  deliveryPricePerKm: e.target.value === '' ? null : Number(e.target.value),
                }))}
                placeholder="Dejar vacío usa el precio por defecto de ComarPOS"
                disabled={saving}
              />
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                Se usa para calcular el costo de los envíos a domicilio en el POS. Dejalo vacío para usar el valor por defecto.
              </p>
            </div>

            <button type="submit" className="btn btn-primary btn-sm" style={{ marginTop: 16, gap: 6 }} disabled={saving || !info.name.trim()}>
              {saving ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Save size={13} />}
              Guardar
            </button>
          </form>
        )}
      </div>

      <div className="card" style={{ padding: 22, maxWidth: 560 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Logo de la empresa</h2>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 18 }}>
          Se muestra en el panel y se incluye en cotizaciones y facturas. JPG, PNG o WEBP, máx. 5MB.
        </p>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160 }}><div className="spinner" /></div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
              <div style={{
                width: 96, height: 96, borderRadius: 10, background: 'var(--surface2)',
                border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
              }}>
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo de la empresa" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <Building2 size={32} style={{ color: 'var(--text3)' }} />
                )}
              </div>

              {logoUrl && (
                <button onClick={remove} disabled={deleting} className="btn btn-secondary btn-sm" style={{ gap: 6, color: 'var(--danger)' }}>
                  {deleting ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Trash2 size={13} />}
                  Quitar logo
                </button>
              )}
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 8, padding: '28px 16px', borderRadius: 8, cursor: uploading ? 'default' : 'pointer',
                border: `1px dashed ${dragOver ? 'var(--accent)' : 'var(--border2)'}`,
                background: dragOver ? 'rgba(13,89,231,0.06)' : 'var(--surface2)',
                transition: 'all 0.12s',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/jpg"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ''; }}
              />

              {uploading ? (
                <>
                  <span className="spinner" />
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>Subiendo... {progress}%</span>
                </>
              ) : (
                <>
                  <UploadCloud size={22} style={{ color: 'var(--text3)' }} />
                  <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>Arrastrá una imagen o hacé clic para seleccionar</span>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>JPG, PNG o WEBP · máx. 5MB</span>
                </>
              )}
            </div>

            {!logoUrl && !uploading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 11, color: 'var(--text3)' }}>
                <ImageOff size={12} /> Sin logo configurado: los documentos muestran el nombre de la empresa como texto.
              </div>
            )}
          </>
        )}
      </div>

      <ImageCropModal
        open={cropSourceFile !== null}
        file={cropSourceFile}
        onClose={() => setCropSourceFile(null)}
        onCropped={handleCropped}
        outputSize={LOGO_IMAGE_SIZE}
        title="Ajustar logo de la empresa"
        description={`El logo se guarda cuadrado (${LOGO_IMAGE_SIZE}×${LOGO_IMAGE_SIZE}px). Arrastrá para encuadrar y usá el zoom para acercar.`}
        fileNameFallback="logo"
      />
    </AppLayout>
  );
}
