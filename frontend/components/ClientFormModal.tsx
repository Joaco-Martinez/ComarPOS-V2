/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import type { Client, ClientCategory } from '@/types';
import { X } from 'lucide-react';

const CATEGORIES: ClientCategory[] = ['Cliente', 'Mayorista', 'Price'];

const emptyForm = {
  nombre: '', apellido: '', dni: '', telefono: '', gmail: '',
  category: 'Cliente' as ClientCategory,
  addressStreet: '', addressNumber: '', addressCity: '', addressProvince: '',
  creditLimit: '', isAccountEnabled: 'false',
};

type Form = typeof emptyForm;

// Heuristica para separar "Juan Mayer" (lo que se tipeo en el buscador que
// no encontro resultados) en nombre/apellido -- el usuario lo puede corregir
// a mano igual, esto es solo para no arrancar con el formulario vacio.
function splitQuery(query: string): { nombre: string; apellido: string } {
  const parts = query.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { nombre: '', apellido: '' };
  if (parts.length === 1) return { nombre: parts[0], apellido: '' };
  return { nombre: parts[0], apellido: parts.slice(1).join(' ') };
}

export interface ClientFormModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (client: Client) => void;
  /** Texto que se buscó y no dio resultados -- prellena nombre/apellido. */
  initialQuery?: string;
  /** Ej: true en Cuentas Corrientes, para que el cliente nuevo arranque con cta. cte. habilitada. */
  defaultAccountEnabled?: boolean;
}

/**
 * Modal de alta rápida de cliente, reusado desde cualquier pantalla que
 * necesite elegir un cliente (POS, Servicios, Cuentas Corrientes...) y no
 * lo encuentre en la búsqueda -- mismo formulario que /clientes, para no
 * tener el alta completa en dos lugares con campos distintos.
 */
export default function ClientFormModal({ open, onClose, onCreated, initialQuery, defaultAccountEnabled }: ClientFormModalProps) {
  const [form, setForm] = useState<Form>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const { nombre, apellido } = splitQuery(initialQuery ?? '');
    setForm({ ...emptyForm, nombre, apellido, isAccountEnabled: defaultAccountEnabled ? 'true' : 'false' });
    setError('');
  }, [open, initialQuery, defaultAccountEnabled]);

  if (!open) return null;

  const f = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    if (!form.nombre.trim()) return;
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/clients', {
        ...form,
        creditLimit: form.creditLimit ? Number(form.creditLimit) : undefined,
        isAccountEnabled: form.isAccountEnabled === 'true',
      });
      onCreated(data);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Error al crear el cliente');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 300 }}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 800, fontSize: 15 }}>Nuevo cliente</span>
          <button onClick={onClose} className="btn btn-ghost btn-xs"><X size={14} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && (
            <div style={{ fontSize: 12, color: 'var(--danger)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, padding: '8px 10px' }}>
              {error}
            </div>
          )}
          <div className="form-row">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Nombre *</label>
              <input value={form.nombre} onChange={f('nombre')} placeholder="Nombre" autoFocus />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Apellido</label>
              <input value={form.apellido} onChange={f('apellido')} placeholder="Apellido" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">DNI</label>
              <input value={form.dni} onChange={f('dni')} placeholder="DNI" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Categoría</label>
              <select value={form.category} onChange={f('category')}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Teléfono</label>
              <input value={form.telefono} onChange={f('telefono')} placeholder="+54 9 11 1234-5678" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Email</label>
              <input type="email" value={form.gmail} onChange={f('gmail')} placeholder="cliente@email.com" />
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Dirección</div>
          <div className="form-row">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Calle</label>
              <input value={form.addressStreet} onChange={f('addressStreet')} placeholder="Av. Siempre Viva" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Número</label>
              <input value={form.addressNumber} onChange={f('addressNumber')} placeholder="742" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Ciudad</label>
              <input value={form.addressCity} onChange={f('addressCity')} placeholder="Córdoba" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Provincia</label>
              <input value={form.addressProvince} onChange={f('addressProvince')} placeholder="Córdoba" />
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Cuenta corriente</div>
          <div className="form-row">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Límite de crédito</label>
              <input type="number" min="0" value={form.creditLimit} onChange={f('creditLimit')} placeholder="0" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Habilitar cuenta corriente</label>
              <select value={form.isAccountEnabled} onChange={f('isAccountEnabled')}>
                <option value="false">No</option>
                <option value="true">Sí</option>
              </select>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary btn-sm">Cancelar</button>
          <button onClick={save} disabled={saving || !form.nombre.trim()} className="btn btn-primary btn-sm">
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Crear cliente'}
          </button>
        </div>
      </div>
    </div>
  );
}
