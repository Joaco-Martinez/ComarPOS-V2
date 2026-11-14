/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { NotificationPreference } from '@/types';
import {
  disableWebPush, enableWebPush, getWebPushStatus, isIos, type WebPushStatus,
} from '@/lib/webPush';
import { isNativeApp } from '@/lib/push';
import { Bell, BellOff, BellRing, Send, Smartphone, Share, PlusSquare } from 'lucide-react';

// Configuracion > Notificaciones: cada usuario activa el push en SU
// dispositivo (Web Push en la PWA) y elige, tipo por tipo, si lo quiere ver
// en la campanita y/o como notificacion del celu. Las preferencias se
// guardan por usuario en el backend (notificationPrefs.service.ts), la
// suscripcion push es por dispositivo.

function Switch({ checked, onChange, disabled, label }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 24, borderRadius: 12, border: 'none', padding: 2, flexShrink: 0,
        background: checked ? 'var(--accent)' : 'var(--border)',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        transition: 'background 0.15s ease', display: 'flex', alignItems: 'center',
      }}
    >
      <span style={{
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        transform: checked ? 'translateX(16px)' : 'translateX(0)', transition: 'transform 0.15s ease',
      }} />
    </button>
  );
}

function DeviceCard({ status, busy, onEnable, onDisable, onTest }: {
  status: WebPushStatus | null; busy: boolean;
  onEnable: () => void; onDisable: () => void; onTest: () => void;
}) {
  const native = isNativeApp();
  let icon = <Bell size={20} />;
  let title = 'Notificaciones en este dispositivo';
  let text: React.ReactNode = 'Recibí los avisos como notificación del celu, aunque no tengas ComarPOS abierto.';
  let action: React.ReactNode = null;

  if (native) {
    icon = <BellRing size={20} />;
    title = 'Notificaciones de la app';
    text = 'Las notificaciones de la app se manejan desde los ajustes del celular. Abajo elegís qué avisos querés recibir.';
  } else if (status === null) {
    text = 'Revisando…';
  } else if (status === 'on') {
    icon = <BellRing size={20} />;
    title = 'Notificaciones activadas en este dispositivo';
    text = 'Te van a llegar los avisos que tengas prendidos en la columna “Celular”.';
    action = (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={onTest} disabled={busy} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
          <Send size={13} /> Enviar prueba
        </button>
        <button onClick={onDisable} disabled={busy} className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
          <BellOff size={13} /> Desactivar
        </button>
      </div>
    );
  } else if (status === 'off') {
    action = (
      <button onClick={onEnable} disabled={busy} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
        <Bell size={13} /> {busy ? 'Activando…' : 'Activar notificaciones'}
      </button>
    );
  } else if (status === 'ios-needs-install') {
    icon = <Smartphone size={20} />;
    title = 'Primero instalá ComarPOS en tu iPhone';
    text = (
      <>
        En iPhone las notificaciones solo funcionan con la app agregada a la pantalla de inicio:
        <ol style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Abrí ComarPOS en <b>Safari</b>.</li>
          <li>Tocá <Share size={12} style={{ verticalAlign: -1 }} /> <b>Compartir</b> y después <PlusSquare size={12} style={{ verticalAlign: -1 }} /> <b>Agregar a inicio</b>.</li>
          <li>Abrí la app desde el ícono nuevo y volvé a esta pantalla para activarlas.</li>
        </ol>
      </>
    );
    action = <Link href="/instalar" className="btn btn-secondary btn-sm">Ver cómo instalar</Link>;
  } else if (status === 'denied') {
    icon = <BellOff size={20} />;
    title = 'Las notificaciones están bloqueadas';
    text = isIos()
      ? 'Habilitalas en Ajustes del iPhone › Notificaciones › ComarPOS, y volvé a esta pantalla.'
      : 'Habilitalas desde los permisos del sitio en el navegador (el candado al lado de la dirección) o en los ajustes de notificaciones del celular.';
  } else if (status === 'server-disabled') {
    icon = <BellOff size={20} />;
    title = 'Notificaciones push no disponibles todavía';
    text = 'El servidor todavía no tiene configuradas las notificaciones push. Mientras tanto, los avisos te siguen apareciendo en la campanita.';
  } else {
    icon = <BellOff size={20} />;
    title = 'Este navegador no soporta notificaciones push';
    text = 'Probá desde Chrome en Android o en la compu, o instalando la app en tu iPhone. Los avisos te siguen apareciendo en la campanita.';
  }

  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: status === 'on' || native ? 'rgba(24,193,94,0.12)' : 'rgba(13,89,231,0.10)',
        color: status === 'on' || native ? '#18C15E' : 'var(--accent)',
      }}>
        {icon}
      </div>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4, lineHeight: 1.5 }}>{text}</div>
        {action && <div style={{ marginTop: 12 }}>{action}</div>}
      </div>
    </div>
  );
}

export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState<string | null>(null);
  const [status, setStatus] = useState<WebPushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/notifications/preferences');
        setPrefs(Array.isArray(data) ? data : []);
      } catch (err: any) {
        toast.error(err?.response?.data?.message ?? 'No se pudieron cargar las preferencias');
      } finally {
        setLoading(false);
      }
    })();
    getWebPushStatus().then(setStatus).catch(() => setStatus('unsupported'));
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, NotificationPreference[]>();
    for (const p of prefs) {
      if (!map.has(p.group)) map.set(p.group, []);
      map.get(p.group)!.push(p);
    }
    return [...map.entries()];
  }, [prefs]);

  // Guardado inmediato por cada switch (optimista, con rollback si falla).
  const update = async (type: NotificationPreference['type'], change: Partial<Pick<NotificationPreference, 'inApp' | 'push'>>) => {
    const previous = prefs;
    setPrefs((p) => p.map((x) => (x.type === type ? { ...x, ...change } : x)));
    setSavingType(type);
    try {
      const { data } = await api.put('/notifications/preferences', { preferences: [{ type, ...change }] });
      if (Array.isArray(data)) setPrefs(data);
    } catch (err: any) {
      setPrefs(previous);
      toast.error(err?.response?.data?.message ?? 'No se pudo guardar');
    } finally {
      setSavingType(null);
    }
  };

  const setAll = async (enabled: boolean) => {
    const previous = prefs;
    setPrefs((p) => p.map((x) => ({ ...x, inApp: enabled, push: enabled })));
    try {
      const { data } = await api.put('/notifications/preferences', {
        preferences: prefs.map((p) => ({ type: p.type, inApp: enabled, push: enabled })),
      });
      if (Array.isArray(data)) setPrefs(data);
      toast.success(enabled ? 'Todas las notificaciones activadas' : 'Todas las notificaciones desactivadas');
    } catch (err: any) {
      setPrefs(previous);
      toast.error(err?.response?.data?.message ?? 'No se pudo guardar');
    }
  };

  const onEnable = async () => {
    setBusy(true);
    try {
      const next = await enableWebPush();
      setStatus(next);
      if (next === 'on') toast.success('¡Listo! Te van a llegar las notificaciones a este dispositivo');
      else if (next === 'denied') toast.error('Bloqueaste las notificaciones para ComarPOS');
    } catch (err: any) {
      toast.error(err?.message ?? 'No se pudieron activar las notificaciones');
    } finally {
      setBusy(false);
    }
  };

  const onDisable = async () => {
    setBusy(true);
    try {
      await disableWebPush();
      setStatus('off');
      toast.success('Notificaciones desactivadas en este dispositivo');
    } finally {
      setBusy(false);
    }
  };

  const onTest = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/notifications/test-push');
      const sent = Number(data?.web ?? 0) + Number(data?.native ?? 0);
      if (sent > 0) toast.success('Notificación de prueba enviada');
      else toast.error('No se pudo enviar: probá desactivar y volver a activar las notificaciones');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo enviar la prueba');
    } finally {
      setBusy(false);
    }
  };

  const pushAvailable = status === 'on' || isNativeApp();
  const allOn = prefs.length > 0 && prefs.every((p) => p.inApp && p.push);

  return (
    <AppLayout title="Notificaciones" subtitle="Qué avisos recibir y dónde">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
        <DeviceCard status={status} busy={busy} onEnable={onEnable} onDisable={onDisable} onTest={onTest} />

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              padding: '14px 20px', borderBottom: '1px solid var(--border)',
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Tipos de aviso</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                  <b>Campanita</b>: dentro del sistema · <b>Celular</b>: notificación push
                </div>
              </div>
              <button onClick={() => setAll(!allOn)} className="btn btn-ghost btn-sm">
                {allOn ? 'Desactivar todas' : 'Activar todas'}
              </button>
            </div>

            {groups.map(([group, items]) => (
              <div key={group}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
                  background: 'var(--surface2, rgba(0,0,0,0.03))', borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text3)' }}>{group}</span>
                  <span style={{ width: 64, textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text3)' }}>Campanita</span>
                  <span style={{ width: 64, textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text3)' }}>Celular</span>
                </div>
                {items.map((p) => (
                  <div key={p.type} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{p.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, lineHeight: 1.4 }}>{p.description}</div>
                    </div>
                    <div style={{ width: 64, display: 'flex', justifyContent: 'center' }}>
                      <Switch
                        label={`${p.label} en la campanita`}
                        checked={p.inApp}
                        disabled={savingType === p.type}
                        onChange={(v) => update(p.type, { inApp: v })}
                      />
                    </div>
                    <div style={{ width: 64, display: 'flex', justifyContent: 'center' }}>
                      <Switch
                        label={`${p.label} en el celular`}
                        checked={p.push}
                        disabled={savingType === p.type}
                        onChange={(v) => update(p.type, { push: v })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {!pushAvailable && (
              <div style={{ padding: '12px 20px', fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
                La columna “Celular” se aplica a los dispositivos donde actives las notificaciones (arriba).
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
