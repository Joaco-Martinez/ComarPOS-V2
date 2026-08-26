/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { BusinessLocation, BusinessLocationType } from '@/types';
import { normalizeArray } from '@/lib/helpers';
import { Building2, Plus, X, Edit2, Trash2, MapPin } from 'lucide-react';

const typeLabel: Record<BusinessLocationType, string> = { BRANCH: 'Sucursal', WAREHOUSE: 'Depósito', STORE: 'Local' };
const typeColor: Record<BusinessLocationType, string> = { BRANCH: 'badge-blue', WAREHOUSE: 'badge-cyan', STORE: 'badge-green' };
const accentColor: Record<BusinessLocationType, string> = { BRANCH: 'rgba(13,89,231,0.12)', WAREHOUSE: 'rgba(0,180,219,0.12)', STORE: 'rgba(24,193,94,0.12)' };
const accentIcon: Record<BusinessLocationType, string> = { BRANCH: 'var(--accent)', WAREHOUSE: 'var(--accent2)', STORE: 'var(--success)' };

const empty = { name: '', type: 'BRANCH' as BusinessLocationType, addressStreet: '', addressNumber: '', addressCity: '', addressProvince: '', isDefault: false, isActive: true };

export default function BusinessLocationsPage() {
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<BusinessLocation | null>(null);
  const [form, setForm] = useState<typeof empty>(empty);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/business-locations');
      setLocations(normalizeArray<BusinessLocation>(data));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);


  const openCreate = () => { setEditing(null); setForm(empty); setModal(true); };
  const openEdit = (l: BusinessLocation) => {
    setEditing(l);
    setForm({
      name: l.name,
      type: l.type,
      addressStreet: l.addressStreet ?? '',
      addressNumber: l.addressNumber ?? '',
      addressCity: l.addressCity ?? '',
      addressProvince: l.addressProvince ?? '',
      isDefault: l.isDefault,
      isActive: l.isActive,
    });
    setModal(true);
  };

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name, type: form.type,
        addressStreet: form.addressStreet || undefined,
        addressNumber: form.addressNumber || undefined,
        addressCity: form.addressCity || undefined,
        addressProvince: form.addressProvince || undefined,
        isDefault: form.isDefault, isActive: form.isActive,
      };
      if (editing) await api.put(`/business-locations/${editing.id}`, payload);
      else await api.post('/business-locations', payload);
      toast.success(editing ? 'Ubicación actualizada' : 'Ubicación creada');
      setModal(false);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error');
    } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    setDeleting(id);
    try {
      const { data } = await api.delete(`/business-locations/${id}`);
      // Si tenía ventas o stock cargado, el backend la desactiva en vez de
      // borrarla en limpio (no puede dejar movimientos/stock huérfanos).
      toast.success(data?.isActive === false ? 'Ubicación desactivada (tenía ventas o stock cargado)' : 'Ubicación eliminada');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se puede eliminar');
    } finally { setDeleting(null); }
  };

  const f = (k: keyof typeof empty, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const formatAddress = (l: BusinessLocation) => {
    const parts = [l.addressStreet, l.addressNumber, l.addressCity, l.addressProvince].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  };

  return (
    <AppLayout
      title="Sucursales y Depósitos"
      subtitle={`${locations.length} ubicaciones registradas`}
      actions={
        <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
          <Plus size={13} /> Nueva ubicación
        </button>
      }
    >
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><div className="spinner" /></div>
      ) : locations.length === 0 ? (
        <div className="card empty-state" style={{ padding: 60 }}><Building2 size={40} /><p>Sin ubicaciones registradas</p></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {locations.map((l) => (
            <div key={l.id} className="card" style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 8, background: accentColor[l.type], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Building2 size={18} color={accentIcon[l.type]} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>{l.name}</div>
                    <span className={`badge badge-xs ${typeColor[l.type]}`}>{typeLabel[l.type]}</span>
                    {l.isDefault && <span className="badge badge-xs badge-amber" style={{ marginLeft: 4 }}>Principal</span>}
                  </div>
                </div>
                <span className={`badge badge-xs ${l.isActive ? 'badge-green' : 'badge-gray'}`}>{l.isActive ? 'Activa' : 'Inactiva'}</span>
              </div>
              {formatAddress(l) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
                  <MapPin size={11} /> {formatAddress(l)}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <button onClick={() => openEdit(l)} className="btn btn-secondary btn-xs" style={{ flex: 1, gap: 4 }}><Edit2 size={11} /> Editar</button>
                <button onClick={() => del(l.id)} disabled={deleting === l.id} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}>
                  {deleting === l.id ? <span className="spinner" style={{ width: 11, height: 11 }} /> : <Trash2 size={13} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800 }}>{editing ? 'Editar ubicación' : 'Nueva ubicación'}</span>
              <button onClick={() => setModal(false)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0, flex: 2 }}>
                  <label className="form-label">Nombre *</label>
                  <input value={form.name} onChange={(e) => f('name', e.target.value)} placeholder="Ej. Sucursal Centro" autoFocus />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tipo</label>
                  <select value={form.type} onChange={(e) => f('type', e.target.value as BusinessLocationType)}>
                    {Object.entries(typeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0, flex: 2 }}>
                  <label className="form-label">Calle</label>
                  <input value={form.addressStreet} onChange={(e) => f('addressStreet', e.target.value)} placeholder="Av. San Martín" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Número</label>
                  <input value={form.addressNumber} onChange={(e) => f('addressNumber', e.target.value)} placeholder="123" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Ciudad</label>
                  <input value={form.addressCity} onChange={(e) => f('addressCity', e.target.value)} placeholder="Córdoba" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Provincia</label>
                  <input value={form.addressProvince} onChange={(e) => f('addressProvince', e.target.value)} placeholder="Córdoba" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={form.isDefault} onChange={(e) => f('isDefault', e.target.checked)} style={{ width: 14, height: 14 }} />
                  Principal
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={form.isActive} onChange={(e) => f('isActive', e.target.checked)} style={{ width: 14, height: 14 }} />
                  Activa
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(false)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={save} disabled={saving || !form.name} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : editing ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
