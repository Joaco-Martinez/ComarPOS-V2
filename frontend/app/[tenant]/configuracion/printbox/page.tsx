/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { PrintboxDevice } from '@/types';
import { normalizeArray } from '@/lib/helpers';
import { formatDateTimeAR } from '@/lib/dateAR';
import { Printer, Plus, X, Edit2, Trash2, RefreshCcw, Clock, Wifi, Monitor, Download, Copy, Check } from 'lucide-react';

const AGENT_DOWNLOAD_URL = '/downloads/ComarPOS-Agent-Setup.exe';

const statusLabel: Record<string, string> = {
  PENDING_PAIRING: 'Pendiente de emparejar',
  ACTIVE: 'Activo',
  REVOKED: 'Revocado',
};
const statusBadge: Record<string, string> = {
  PENDING_PAIRING: 'badge-amber',
  ACTIVE: 'badge-green',
  REVOKED: 'badge-gray',
};

function msToClock(ms: number) {
  if (ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function PrintboxPage() {
  const [devices, setDevices] = useState<PrintboxDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const [createModal, setCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<'ESP32' | 'DESKTOP_AGENT'>('DESKTOP_AGENT');
  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [editing, setEditing] = useState<PrintboxDevice | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrinterIp, setEditPrinterIp] = useState('');
  const [saving, setSaving] = useState(false);

  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<PrintboxDevice | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);


  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/printbox/devices');
      setDevices(normalizeArray<PrintboxDevice>(data.devices ?? data));
    } catch {
      if (!silent) toast.error('No se pudieron cargar los PrintBox');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Tick cada segundo mientras haya algun device pendiente de emparejar, para
  // mostrar la cuenta regresiva del codigo (15 min) - es informacion critica
  // en el momento: si se pasa, hay que regenerar antes de seguir.
  useEffect(() => {
    const hasPending = devices.some((d) => d.status === 'PENDING_PAIRING');
    if (!hasPending) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [devices]);

  // Mientras haya un device pendiente, el pairing fisico puede completarse
  // en cualquier momento sin que esta pestaña se entere -- repreguntamos al
  // backend cada pocos segundos (silencioso, sin spinner) para que el
  // estado pase a "Activo" solo, sin que haya que recargar la pagina a mano.
  useEffect(() => {
    const hasPending = devices.some((d) => d.status === 'PENDING_PAIRING');
    if (!hasPending) return;
    const id = setInterval(() => load(true), 4000);
    return () => clearInterval(id);
  }, [devices]);

  const openCreate = () => { setNewName(''); setNewKind('DESKTOP_AGENT'); setCreateModal(true); };

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.post('/printbox/devices', { name: newName.trim(), kind: newKind });
      setCreateModal(false);
      toast.success('Creado — copiá el código antes de que expire');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al crear el PrintBox');
    } finally {
      setCreating(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1500);
  };

  const openEdit = (d: PrintboxDevice) => {
    setEditing(d);
    setEditName(d.name);
    setEditPrinterIp(d.printerIp ?? '');
  };

  const save = async () => {
    if (!editing || !editName.trim()) return;
    setSaving(true);
    try {
      await api.patch(`/printbox/devices/${editing.id}`, {
        name: editName.trim(),
        printerIp: editPrinterIp.trim() || null,
      });
      toast.success('PrintBox actualizado');
      setEditing(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async (d: PrintboxDevice) => {
    setRegenerating(d.id);
    try {
      await api.post(`/printbox/devices/${d.id}/regenerate-code`);
      toast.success('Código nuevo generado');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al regenerar el código');
    } finally {
      setRegenerating(null);
    }
  };

  const revoke = async () => {
    if (!confirmRevoke) return;
    setRevoking(confirmRevoke.id);
    try {
      await api.delete(`/printbox/devices/${confirmRevoke.id}`);
      toast.success('PrintBox revocado');
      setConfirmRevoke(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al revocar');
    } finally {
      setRevoking(null);
    }
  };

  return (
    <AppLayout
      title="Impresión de tickets"
      subtitle="Un PrintBox físico (ESP32) o el agente de escritorio instalado en una PC conectada a la impresora"
      actions={
        <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
          <Plus size={13} /> Nuevo dispositivo
        </button>
      }
    >
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><div className="spinner" /></div>
      ) : devices.length === 0 ? (
        <div className="card empty-state" style={{ padding: 60 }}>
          <Printer size={40} />
          <p>Todavía no configuraste ninguna impresora</p>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
            Creá un dispositivo — agente de escritorio o PrintBox físico — y vas a recibir un código para emparejarlo.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {devices.map((d) => {
            const expiresAt = d.pairingCodeExpiresAt ? new Date(d.pairingCodeExpiresAt).getTime() : 0;
            const msLeft = expiresAt - now;
            const codeExpired = d.status === 'PENDING_PAIRING' && expiresAt > 0 && msLeft <= 0;

            return (
              <div key={d.id} className="card" style={{ padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 8, background: 'rgba(13,89,231,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {d.kind === 'DESKTOP_AGENT' ? (
                        <Monitor size={18} style={{ color: 'var(--accent)' }} />
                      ) : (
                        <Printer size={18} style={{ color: 'var(--accent)' }} />
                      )}
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>{d.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <span className={`badge badge-xs ${codeExpired ? 'badge-red' : statusBadge[d.status]}`}>
                          {codeExpired ? 'Código expirado' : statusLabel[d.status]}
                        </span>
                        <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>
                          {d.kind === 'DESKTOP_AGENT' ? 'Agente de escritorio' : 'PrintBox (ESP32)'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {d.status === 'PENDING_PAIRING' && !codeExpired && d.kind === 'DESKTOP_AGENT' && (
                  <div style={{
                    background: 'var(--surface2)', border: '1px dashed var(--border2)', borderRadius: 8,
                    padding: '14px', marginBottom: 12,
                  }}>
                    <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
                      1. Descargá e instalá el agente en la PC conectada a la impresora.<br />
                      2. Cuando te pida el código, pegá este:
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ flex: 1, textAlign: 'center', fontSize: 24, fontWeight: 800, fontFamily: 'var(--mono)', letterSpacing: 3, color: 'var(--accent)', background: 'var(--surface)', borderRadius: 6, padding: '6px 0' }}>
                        {d.pairingCode}
                      </div>
                      <button onClick={() => copyCode(d.pairingCode!)} className="btn btn-secondary btn-xs" style={{ padding: '8px' }} title="Copiar código">
                        {copiedCode === d.pairingCode ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </div>
                    <a href={AGENT_DOWNLOAD_URL} className="btn btn-primary btn-sm" style={{ width: '100%', gap: 6 }}>
                      <Download size={13} /> Descargar agente para Windows
                    </a>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
                      <Clock size={11} /> Código válido por {msToClock(msLeft)}
                    </div>
                  </div>
                )}

                {d.status === 'PENDING_PAIRING' && !codeExpired && d.kind === 'ESP32' && (
                  <div style={{
                    background: 'var(--surface2)', border: '1px dashed var(--border2)', borderRadius: 8,
                    padding: '12px 14px', marginBottom: 12, textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                      Código de pairing
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--mono)', letterSpacing: 4, color: 'var(--accent)' }}>
                      {d.pairingCode}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                      <Clock size={11} /> Expira en {msToClock(msLeft)}
                    </div>
                  </div>
                )}

                {codeExpired && (
                  <div style={{ marginBottom: 12 }}>
                    <button
                      onClick={() => regenerate(d)}
                      disabled={regenerating === d.id}
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', gap: 6 }}
                    >
                      {regenerating === d.id ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <RefreshCcw size={13} />}
                      Generar código nuevo
                    </button>
                  </div>
                )}

                {d.status === 'ACTIVE' && (
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {d.kind === 'ESP32' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Wifi size={11} /> {d.printerIp || 'Sin IP de impresora'}
                      </div>
                    )}
                    <div>
                      Última conexión: {d.lastSeenAt ? formatDateTimeAR(d.lastSeenAt) : 'nunca'}
                    </div>
                  </div>
                )}

                {d.status !== 'REVOKED' && (
                  <div style={{ display: 'flex', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <button onClick={() => openEdit(d)} className="btn btn-secondary btn-xs" style={{ flex: 1, gap: 4 }}>
                      <Edit2 size={11} /> Editar
                    </button>
                    <button
                      onClick={() => setConfirmRevoke(d)}
                      disabled={revoking === d.id}
                      className="btn btn-ghost btn-xs"
                      style={{ color: 'var(--danger)' }}
                    >
                      {revoking === d.id ? <span className="spinner" style={{ width: 11, height: 11 }} /> : <Trash2 size={13} />}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Crear */}
      {createModal && (
        <div className="modal-overlay" onClick={() => setCreateModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800 }}>Nuevo dispositivo</span>
              <button onClick={() => setCreateModal(false)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tipo *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setNewKind('DESKTOP_AGENT')}
                    className={newKind === 'DESKTOP_AGENT' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                    style={{ flex: 1, flexDirection: 'column', gap: 4, height: 'auto', padding: '10px 8px' }}
                  >
                    <Monitor size={16} />
                    Agente en PC
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewKind('ESP32')}
                    className={newKind === 'ESP32' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                    style={{ flex: 1, flexDirection: 'column', gap: 4, height: 'auto', padding: '10px 8px' }}
                  >
                    <Printer size={16} />
                    PrintBox físico
                  </button>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre *</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ej. Caja 1" autoFocus />
              </div>
              <p style={{ fontSize: 12, color: 'var(--text3)' }}>
                {newKind === 'DESKTOP_AGENT'
                  ? 'Vas a recibir un código de 6 dígitos, válido 15 minutos, para cargar en el agente que instalés en la PC conectada a la impresora.'
                  : 'Vas a recibir un código de 6 dígitos, válido 15 minutos. Entrá desde el celular a la IP que muestre el dispositivo (pantalla o Serial) y cargalo ahí, junto con la IP de la impresora en tu red.'}
              </p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setCreateModal(false)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={create} disabled={creating || !newName.trim()} className="btn btn-primary btn-sm">
                {creating ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editar */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800 }}>Editar PrintBox</span>
              <button onClick={() => setEditing(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nombre *</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">IP de la impresora</label>
                <input value={editPrinterIp} onChange={(e) => setEditPrinterIp(e.target.value)} placeholder="192.168.1.100" />
                <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  Referencia nomás — la IP real que usa el dispositivo es la que se cargó durante el pairing físico.
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setEditing(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={save} disabled={saving || !editName.trim()} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar revocar */}
      {confirmRevoke && (
        <div className="modal-overlay" onClick={() => setConfirmRevoke(null)}>
          <div className="modal" style={{ maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 700 }}>Revocar PrintBox</span>
              <button onClick={() => setConfirmRevoke(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: 'var(--text2)' }}>
                ¿Revocar <strong style={{ color: 'var(--text)' }}>{confirmRevoke.name}</strong>? Deja de recibir tickets. Si lo volvés a necesitar, hay que emparejarlo de nuevo desde cero.
              </p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setConfirmRevoke(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={revoke} disabled={revoking === confirmRevoke.id} className="btn btn-danger btn-sm">
                {revoking === confirmRevoke.id ? <span className="spinner" style={{ width: 13, height: 13 }} /> : 'Revocar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
