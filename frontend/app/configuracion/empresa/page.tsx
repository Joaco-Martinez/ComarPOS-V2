/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useRef, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Building2, UploadCloud, Trash2, ImageOff } from 'lucide-react';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/svg+xml'];
const MAX_SIZE = 5 * 1024 * 1024;

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => { load(); }, [tenantId]);

  const validateFile = (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      showToast('Formato inválido. Usá JPG, PNG, WEBP o SVG.');
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

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  };

  return (
    <AppLayout title="Datos de la Empresa" subtitle="Logo y marca para documentos">
      {toast && (
        <div style={{ position: 'fixed', top: 70, right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)', animation: 'fadeIn 0.2s ease' }}>{toast}</div>
      )}

      <div className="card" style={{ padding: 22, maxWidth: 560 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Logo de la empresa</h2>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 18 }}>
          Se muestra en el panel y se incluye en cotizaciones y facturas. JPG, PNG, WEBP o SVG, máx. 5MB.
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
                background: dragOver ? 'rgba(37,99,235,0.06)' : 'var(--surface2)',
                transition: 'all 0.12s',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/jpg,image/svg+xml"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }}
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
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>JPG, PNG, WEBP o SVG · máx. 5MB</span>
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
    </AppLayout>
  );
}
