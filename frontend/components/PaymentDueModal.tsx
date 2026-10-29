'use client';

import { useEffect, useState } from 'react';
import { X, CalendarClock, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { usePlanFeaturesStore, type SubscriptionSnapshot } from '@/store/planFeatures';
import { fmtDate } from '@/lib/helpers';
import BillingPayActions from './BillingPayActions';

// Cartel de pago del servicio, en dos etapas antes del corte:
//   - "Ya podés pagar" (payWindowDays antes del vencimiento): aviso
//     tranquilo, una vez por dia.
//   - "Se está por pausar" (urgentDays antes, o pago vencido): aviso en
//     rojo, vuelve a salir en cada sesion nueva del navegador.
// Pasado el vencimiento ya no es un cartel: el backend bloquea
// (middleware/tenant.ts#getTenantBlock) y AppLayout muestra
// BillingBlockedScreen en todas las pantallas.
// Los dias se configuran en /platform-admin/cobros (vienen en
// subscription.reminders).
const STORAGE_KEY = 'comarpos-payment-due-dismissed';

type DueInfo = { urgent: boolean; title: string; message: string; dueDate: string | null };

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function inDays(days: number): string {
  if (days <= 0) return 'hoy';
  if (days === 1) return 'mañana';
  return `en ${days} días`;
}

function getDueInfo(sub: SubscriptionSnapshot): DueInfo | null {
  // Ya informo una transferencia: no le seguimos pidiendo que pague
  // mientras la confirmamos.
  if (sub.lastTransferStatus === 'PENDING') return null;

  if (sub.subscriptionStatus === 'PAST_DUE') {
    return {
      urgent: true,
      title: 'Tu cuenta se está por pausar',
      message: 'No registramos el pago de este mes. Si no se abona, el sistema se bloquea hasta que se regularice.',
      dueDate: sub.paidUntil,
    };
  }

  let dueDate: string | null = null;
  if (sub.subscriptionStatus === 'TRIAL') dueDate = sub.trialEndsAt;
  // Con Mercado Pago automatico el cobro sale solo, no hace falta avisar.
  else if (sub.subscriptionStatus === 'ACTIVE' && !sub.hasMpSubscription) dueDate = sub.paidUntil;
  if (!dueDate) return null;

  const days = daysUntil(dueDate);
  const { payWindowDays, urgentDays } = sub.reminders;
  if (days < 0 || days > payWindowDays) return null;

  const isTrial = sub.subscriptionStatus === 'TRIAL';
  if (days <= urgentDays) {
    return {
      urgent: true,
      title: isTrial ? `Tu prueba gratis termina ${inDays(days)}` : `Tu cuenta se pausa ${inDays(days)} por falta de pago`,
      message: isTrial
        ? 'Activá tu suscripción para no perder el acceso. Si no, el sistema se bloquea hasta que pagues.'
        : 'Todavía no registramos el pago del próximo mes. Si no se abona antes del vencimiento, el sistema se bloquea hasta que se regularice.',
      dueDate,
    };
  }

  return {
    urgent: false,
    title: isTrial ? 'Ya podés activar tu suscripción' : 'Ya podés pagar tu próximo mes',
    message: isTrial
      ? `Tu prueba gratis termina ${inDays(days)}. Si pagás ahora, seguís sin cortes.`
      : `Tu servicio vence ${inDays(days)}. Pagá cuando quieras antes de esa fecha y no perdés ningún día.`,
    dueDate,
  };
}

function readDismissed(urgent: boolean): string | null {
  try {
    return (urgent ? sessionStorage : localStorage).getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export default function PaymentDueModal() {
  const user = useAuthStore((s) => s.user);
  const subscription = usePlanFeaturesStore((s) => s.subscription);
  const [open, setOpen] = useState(false);

  // Solo el ADMIN gestiona la suscripción (ver billing.routes.ts) -- a un
  // empleado o contador el cartel no le sirve de nada.
  const info = user?.role === 'ADMIN' && subscription ? getDueInfo(subscription) : null;
  const urgent = !!info?.urgent;
  const hasInfo = !!info;
  const dismissKey = `${user?.tenantId ?? ''}:${urgent ? 'urgent' : 'window'}:${new Date().toISOString().slice(0, 10)}`;

  useEffect(() => {
    if (!hasInfo) return;
    if (readDismissed(urgent) !== dismissKey) setOpen(true);
  }, [hasInfo, urgent, dismissKey]);

  const dismiss = () => {
    setOpen(false);
    try { (urgent ? sessionStorage : localStorage).setItem(STORAGE_KEY, dismissKey); } catch { /* sin storage: vuelve a aparecer en la proxima pantalla */ }
  };

  if (!open || !info || !subscription) return null;

  const color = info.urgent ? 'var(--danger)' : '#f59e0b';
  const Icon = info.urgent ? AlertTriangle : CalendarClock;

  return (
    <div className="modal-overlay" onClick={dismiss}>
      <div className="modal" style={{ maxWidth: 420, padding: 24 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: info.urgent ? 'var(--danger-dim)' : 'rgba(245,158,11,0.15)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon size={17} style={{ color }} />
            </div>
            <div style={{ fontWeight: 800, fontSize: 15, color: info.urgent ? 'var(--danger)' : 'var(--text)' }}>{info.title}</div>
          </div>
          <button onClick={dismiss} className="btn btn-ghost btn-xs" aria-label="Cerrar"><X size={14} /></button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.55, marginBottom: 14 }}>{info.message}</p>

        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 18, display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
          <div>
            <div style={{ color: 'var(--text3)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {subscription.planName ? `Plan ${subscription.planName}` : 'Importe'}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 15 }}>
              {subscription.amount != null ? `$${subscription.amount.toLocaleString('es-AR')}/mes` : '—'}
            </div>
          </div>
          {info.dueDate && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'var(--text3)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Vence</div>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 15, color: info.urgent ? 'var(--danger)' : 'var(--text)' }}>{fmtDate(info.dueDate)}</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <BillingPayActions subscription={subscription} />
          <button onClick={dismiss} className="btn btn-ghost" style={{ width: '100%', color: 'var(--text3)' }}>
            Más tarde
          </button>
        </div>
      </div>
    </div>
  );
}
