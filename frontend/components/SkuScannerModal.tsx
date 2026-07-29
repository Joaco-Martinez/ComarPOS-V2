/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ScanBarcode, X } from 'lucide-react';

let instanceCounter = 0;

interface SkuScannerModalProps {
  open: boolean;
  onClose: () => void;
  onDetected: (text: string) => void;
  title?: string;
  hint?: string;
}

// Escanea SKU/código de barras con la cámara del dispositivo (html5-qrcode).
// El padre controla `open` y decide qué hacer con cada texto detectado —
// este componente solo detecta y debounce-a lecturas repetidas del mismo
// código mientras sigue en cuadro; no se cierra solo.
export default function SkuScannerModal({ open, onClose, onDetected, title = 'Escanear producto', hint }: SkuScannerModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scannerRef = useRef<any>(null);
  const lastRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });
  const elementId = useRef(`comarpos-sku-scanner-${++instanceCounter}`);

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      const state = scanner.getState?.();
      if (state === 2) await scanner.stop();
    } catch {
      // ya se habia detenido
    }
    try {
      await scanner.clear?.();
    } catch {
      // el contenedor ya pudo haber sido desmontado
    }
    scannerRef.current = null;
  };

  const handleClose = async () => {
    await stopScanner();
    setError('');
    setLoading(false);
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const start = async () => {
      setLoading(true);
      setError('');
      try {
        if (typeof window === 'undefined') return;
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;

        const scanner = new Html5Qrcode(elementId.current);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72);
              return {
                width: Math.max(220, Math.min(size, 340)),
                height: Math.max(120, Math.min(Math.floor(size * 0.55), 220)),
              };
            },
            aspectRatio: 1.777,
          },
          (decodedText: string) => {
            const text = decodedText.trim();
            const now = Date.now();
            if (lastRef.current.text === text && now - lastRef.current.time < 2000) return;
            lastRef.current = { text, time: now };
            onDetected(text);
          },
          () => { /* lectura fallida, seguimos intentando */ },
        );

        if (!cancelled) setLoading(false);
      } catch (e: any) {
        console.error(e);
        if (!cancelled) {
          setLoading(false);
          setError(
            e?.message?.includes('Permission')
              ? 'No se pudo acceder a la cámara. Revisá los permisos del navegador.'
              : 'No se pudo iniciar la cámara. Probá con HTTPS, otro navegador o buscá el código manualmente.'
          );
        }
      }
    };

    const timeoutId = window.setTimeout(start, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      void stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 700 }}>{title}</span>
          <button onClick={handleClose} className="btn btn-ghost btn-xs"><X size={14} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12, color: 'var(--text2)' }}>
            <ScanBarcode size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
            <div>
              <b style={{ display: 'block', color: 'var(--text)' }}>Apuntá al código de barras o QR</b>
              {hint ?? 'Cuando lo detecte, se busca automáticamente.'}
            </div>
          </div>
          <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#000', minHeight: 220 }}>
            <div id={elementId.current} style={{ width: '100%' }} />
            {loading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#fff' }}>
                <span className="spinner" />
                <p style={{ fontSize: 12 }}>Iniciando cámara...</p>
              </div>
            )}
          </div>
          {error ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--danger)' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          ) : (
            <p style={{ fontSize: 11, color: 'var(--text3)' }}>Tip: acercá el código, evitá reflejos y usá buena luz.</p>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={handleClose} className="btn btn-secondary btn-sm">Cancelar</button>
        </div>
      </div>
    </div>
  );
}
