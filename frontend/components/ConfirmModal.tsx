'use client';

import { X } from 'lucide-react';

export type ConfirmState = { title: string; message: string; onConfirm: () => void } | null;

export default function ConfirmModal({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  if (!state) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: 14 }}>{state.title}</span>
          <button onClick={onClose} className="btn btn-ghost btn-xs"><X size={14} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>{state.message}</p>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary btn-sm">Cancelar</button>
          <button
            onClick={() => { state.onConfirm(); onClose(); }}
            className="btn btn-danger btn-sm"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
