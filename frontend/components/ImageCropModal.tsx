'use client';

import { useCallback, useEffect, useState } from 'react';
import Cropper from 'react-easy-crop';
import { X, ZoomIn, Check } from 'lucide-react';

// Tamaño fijo para TODAS las fotos de producto: cuadradas, 800x800px. Se usa
// tal cual en POS (grilla de productos) y en el listado de Productos (miniaturas
// chicas) — object-fit: cover ahí ya asume una fuente cuadrada bien encuadrada,
// por eso el recorte se fuerza acá antes de subir, no se confía en el usuario
// para subir la proporción correcta.
export const PRODUCT_IMAGE_SIZE = 800;

type Area = { x: number; y: number; width: number; height: number };

interface ImageCropModalProps {
  open: boolean;
  file: File | null;
  onClose: () => void;
  onCropped: (file: File) => void;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = url;
  });
}

async function cropToFile(imageUrl: string, area: Area, originalName: string): Promise<File> {
  const image = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = PRODUCT_IMAGE_SIZE;
  canvas.height = PRODUCT_IMAGE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen');

  ctx.drawImage(
    image,
    area.x, area.y, area.width, area.height,
    0, 0, PRODUCT_IMAGE_SIZE, PRODUCT_IMAGE_SIZE
  );

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.9);
  });

  const baseName = originalName.replace(/\.[^./\\]+$/, '') || 'producto';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}

export default function ImageCropModal({ open, file, onClose, onCropped }: ImageCropModalProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setError('');
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onCropComplete = useCallback((_croppedArea: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const confirm = async () => {
    if (!file || !imageUrl || !croppedAreaPixels) return;
    setSaving(true);
    setError('');
    try {
      const cropped = await cropToFile(imageUrl, croppedAreaPixels, file.name);
      onCropped(cropped);
    } catch {
      setError('No se pudo procesar la imagen. Probá con otra foto.');
    } finally {
      setSaving(false);
    }
  };

  if (!open || !imageUrl) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 700 }}>Ajustar imagen del producto</span>
          <button onClick={onClose} className="btn btn-ghost btn-xs"><X size={14} /></button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--text3)' }}>
            Todas las fotos de producto se guardan cuadradas ({PRODUCT_IMAGE_SIZE}×{PRODUCT_IMAGE_SIZE}px), para que se vean parejas en el POS y en el listado. Arrastrá para encuadrar y usá el zoom para acercar.
          </p>

          <div style={{ position: 'relative', width: '100%', height: 320, borderRadius: 8, overflow: 'hidden', background: '#000' }}>
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="rect"
              showGrid
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ZoomIn size={14} style={{ color: 'var(--text3)', flexShrink: 0 }} />
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ flex: 1 }}
            />
          </div>

          {error && <p style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</p>}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary btn-sm">Cancelar</button>
          <button onClick={confirm} disabled={saving} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
            {saving ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Check size={13} />}
            Usar esta imagen
          </button>
        </div>
      </div>
    </div>
  );
}
