'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { fmtDate } from '@/lib/helpers';
import { CheckCircle2, CreditCard, LogOut, MessageCircle, RefreshCcw } from 'lucide-react';

// Mismo numero que components/landing/LandingPage.tsx.
// TODO: reemplazar por el numero real (con codigo de pais, sin +, ej: 5493511234567)
const WHATSAPP_NUMBER = '5490000000000';
const waLink = (extra: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(extra)}`;

type BillingStatus = {
  subscriptionStatus: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED';
  isActive: boolean;
  trialEndsAt?: string | null;
  paidUntil?: string | null;
  suspendedAt?: string | null;
  mpPreapprovalId?: string | null;
  mpSubscriptionAmount?: number | null;
  plan: { name: string; priceArs: number; currency: string; tagline: string };
};

export default function SuscripcionPage() {
  const { logout } = useAuthStore();
  // No usamos useSearchParams (requeriria envolver la pagina en <Suspense>
  // solo por esto) - alcanza con leer el query string una vez al montar.
  const [isReturningFromMp, setIsReturningFromMp] = useState(false);

  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/billing/status');
      setStatus(data.content ?? data);
    } catch {
      setError('No pudimos cargar el estado de tu suscripción.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsReturningFromMp(new URLSearchParams(window.location.search).get('estado') === 'procesando');
    }
    load();
  }, [load]);

  const subscribe = async () => {
    setRedirecting(true);
    setError('');
    try {
      const { data } = await api.post('/billing/checkout');
      const initPoint = (data.content ?? data)?.initPoint;
      if (!initPoint) throw new Error('sin link de pago');
      window.location.href = initPoint;
    } catch {
      setError('No pudimos generar el link de pago. Probá de nuevo en un momento.');
      setRedirecting(false);
    }
  };

  const reasonText = () => {
    if (!status) return '';
    if (status.subscriptionStatus === 'TRIAL') {
      return status.trialEndsAt
        ? `Tu prueba gratis venció el ${fmtDate(status.trialEndsAt)}.`
        : 'Tu prueba gratis venció.';
    }
    if (status.subscriptionStatus === 'SUSPENDED') {
      return status.suspendedAt
        ? `Tu cuenta está suspendida desde el ${fmtDate(status.suspendedAt)}.`
        : 'Tu cuenta está suspendida.';
    }
    return 'Para seguir usando ComarPOS, activá tu suscripción.';
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 24 }}>
          <img src="/brand/isologo.png" alt="ComarPOS" width={36} height={36} style={{ objectFit: 'contain', flexShrink: 0 }} />
          <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.5, color: 'var(--text)' }}>
            omar<span style={{ color: 'var(--accent)' }}>POS</span>
          </span>
        </div>

        <div className="card" style={{ padding: 28 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
              <div className="spinner" />
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
                {isReturningFromMp ? 'Estamos confirmando tu pago' : 'Activá tu suscripción'}
              </h1>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.5 }}>
                {isReturningFromMp
                  ? 'Mercado Pago nos avisa apenas se acredite, puede tardar un par de minutos. Actualizá esta página en un rato.'
                  : reasonText()}
              </p>

              {status?.subscriptionStatus === 'ACTIVE' ? (
                <div style={{ background: 'var(--success-dim, rgba(24,193,94,0.1))', border: '1px solid rgba(24,193,94,0.25)', borderRadius: 8, padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18 }}>
                  <CheckCircle2 size={18} style={{ color: 'var(--success)', flexShrink: 0 }} />
                  <div style={{ fontSize: 13, color: 'var(--text)' }}>
                    Tu suscripción está al día{status.paidUntil ? ` hasta el ${fmtDate(status.paidUntil)}` : ''}. Ya podés volver a usar el sistema.
                  </div>
                </div>
              ) : (
                <div style={{ border: '1px solid var(--border2)', borderRadius: 10, padding: 18, marginBottom: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: 0.5, marginBottom: 6, fontFamily: 'var(--mono)' }}>
                    {status?.plan.name.toUpperCase() ?? 'PLAN COMARPOS'}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>
                    ${(status?.plan.priceArs ?? 35000).toLocaleString('es-AR')}
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)' }}> /mes</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
                    {status?.plan.tagline ?? 'Precio de lanzamiento por tiempo limitado.'}
                  </p>
                </div>
              )}

              {error && (
                <div style={{ background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '9px 12px', marginBottom: 16, fontSize: 13, color: 'var(--danger)' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {status?.subscriptionStatus !== 'ACTIVE' && (
                  <button onClick={subscribe} disabled={redirecting} className="btn btn-primary" style={{ width: '100%', gap: 8 }}>
                    {redirecting ? (
                      <span className="spinner" style={{ width: 15, height: 15 }} />
                    ) : (
                      <>
                        <CreditCard size={15} /> Suscribirme con Mercado Pago
                      </>
                    )}
                  </button>
                )}

                <button onClick={load} className="btn btn-secondary" style={{ width: '100%', gap: 8 }}>
                  <RefreshCcw size={14} /> Actualizar estado
                </button>

                <a
                  href={waLink('¡Hola! Necesito ayuda con la suscripción de ComarPOS.')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost"
                  style={{ width: '100%', gap: 8 }}
                >
                  <MessageCircle size={14} /> ¿Ya pagaste o tenés dudas? Escribinos
                </a>

                <button onClick={() => logout()} className="btn btn-ghost" style={{ width: '100%', gap: 8, color: 'var(--text3)' }}>
                  <LogOut size={14} /> Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
