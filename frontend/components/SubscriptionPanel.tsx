'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { usePlanFeaturesStore } from '@/store/planFeatures';
import { fmtDate } from '@/lib/helpers';
import type { BillingPaymentMethod, BillingPlan, TransferInfo, TransferReportStatus } from '@/types';
import { CheckCircle2, CreditCard, LogOut, MessageCircle, PartyPopper, RefreshCcw, Repeat, Ban, Landmark, Copy, Clock, AlertTriangle } from 'lucide-react';
import { waLink } from '@/components/landing/siteConfig';

type BillingStatus = {
  subscriptionStatus: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED';
  isActive: boolean;
  trialEndsAt?: string | null;
  paidUntil?: string | null;
  suspendedAt?: string | null;
  mpPreapprovalId?: string | null;
  mpSubscriptionAmount?: number | null;
  billingPaymentMethod?: BillingPaymentMethod;
  // Lo que paga este negocio por mes en su plan actual (precio especial >
  // promo congelada > precio del plan, ver backend billing.service.ts#getMonthlyPrice).
  monthlyPrice?: number;
  planId: string;
  plan: { id: string; name: string; priceArs: number; currency: string; tagline: string };
  transferInfo?: TransferInfo;
  lastTransferReport?: {
    id: string;
    status: TransferReportStatus;
    amount: number;
    planId: string;
    reference: string;
    reviewNote?: string | null;
    createdAt: string;
    reviewedAt?: string | null;
  } | null;
};

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* sin permiso de portapapeles: el dato igual queda a la vista */ }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
        <div style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)', wordBreak: 'break-all' }}>{value}</div>
      </div>
      <button type="button" onClick={copy} className="btn btn-ghost btn-xs" style={{ gap: 4, flexShrink: 0 }}>
        {copied ? <CheckCircle2 size={12} style={{ color: 'var(--success)' }} /> : <Copy size={12} />}
        {copied ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

// Contenido de la suscripcion (estado, plan, pagar con MP o transferencia,
// baja) compartido entre la pagina suelta /suscripcion (logo centrado, sin
// menu -- adonde vuelve Mercado Pago despues de pagar) y "Mi suscripción"
// dentro del sistema (/[tenant]/mi-suscripcion, embedded), que sigue
// accesible aunque la cuenta este pausada para poder pagar desde adentro.
export default function SubscriptionPanel({ embedded = false }: { embedded?: boolean }) {
  const { logout, user } = useAuthStore();
  // No usamos useSearchParams (requeriria envolver la pagina en <Suspense>
  // solo por esto) - alcanza con leer el query string una vez al montar.
  const [isReturningFromMp, setIsReturningFromMp] = useState(false);

  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelMessage, setCancelMessage] = useState('');
  const [payMethod, setPayMethod] = useState<'mp' | 'transfer'>('mp');
  const [transferRef, setTransferRef] = useState('');
  const [transferPayer, setTransferPayer] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [reportingTransfer, setReportingTransfer] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [statusRes, plansRes] = await Promise.all([
        api.get('/billing/status'),
        api.get('/billing/plans'),
      ]);
      const st = statusRes.data.content ?? statusRes.data;
      setStatus(st);
      setSelectedPlanId((prev) => prev ?? st?.planId ?? st?.plan?.id ?? null);
      const plansContent = plansRes.data.content ?? plansRes.data;
      setPlans(plansContent?.plans ?? []);
    } catch {
      if (!silent) setError('No pudimos cargar el estado de tu suscripción.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const qs = new URLSearchParams(window.location.search);
      setIsReturningFromMp(qs.get('estado') === 'procesando');
      // El cartel de "hay que abonar" (PaymentDueModal) linkea con
      // ?metodo=transferencia cuando el usuario elige pagar asi.
      if (qs.get('metodo') === 'transferencia') setPayMethod('transfer');
    }
    load();
  }, [load]);

  // Volviendo de pagar en Mercado Pago: el webhook que confirma el pago
  // puede tardar unos segundos en llegar, asi que en vez de pedirle al
  // usuario que actualice la pagina a mano, reconsultamos solos cada 3s
  // hasta que quede ACTIVE (o hasta 40s, para no reintentar para siempre
  // si el webhook se demora de verdad -- ahi se cae al mensaje normal de
  // "puede tardar", que ya explica que no hace falta hacer nada mas).
  useEffect(() => {
    if (!isReturningFromMp || status?.subscriptionStatus === 'ACTIVE') return;
    let attempts = 0;
    const id = setInterval(() => {
      attempts += 1;
      if (attempts > 13) {
        clearInterval(id);
        return;
      }
      load(true);
    }, 3000);
    return () => clearInterval(id);
  }, [isReturningFromMp, status?.subscriptionStatus, load]);

  const isChangingPlan = !!status && status.subscriptionStatus === 'ACTIVE' && !!selectedPlanId && selectedPlanId !== status.planId;

  // ACTIVE pero sin auto-cobro y con el periodo pagado ya vencido: es como
  // llegar bloqueado (ver isSubscriptionExpired en middleware/tenant.ts),
  // solo que via un redirect de un 403 en otra pantalla en vez de por el
  // subscriptionStatus (que sigue en ACTIVE a proposito, ver
  // cancelSubscription en billing.service.ts).
  const isExpiredActive = !!status && status.subscriptionStatus === 'ACTIVE' && !status.mpPreapprovalId
    && !!status.paidUntil && new Date(status.paidUntil).getTime() < Date.now();

  // Un solo boton para "activar" (primera vez) o "cambiar de plan" (ya
  // activo): createCheckout en el backend hace todo en la misma llamada --
  // si hay una preapproval vieja la cancela en Mercado Pago de verdad antes
  // de armar la nueva, no hace falta que el usuario cancele a mano.
  const subscribe = async () => {
    setRedirecting(true);
    setError('');
    try {
      const { data } = await api.post('/billing/checkout', selectedPlanId ? { planId: selectedPlanId } : {});
      const initPoint = (data.content ?? data)?.initPoint;
      if (!initPoint) throw new Error('sin link de pago');
      window.location.href = initPoint;
    } catch {
      setError('No pudimos generar el link de pago. Probá de nuevo en un momento.');
      setRedirecting(false);
    }
  };

  // Botón de arrepentimiento / baja: cancela el auto-cobro en Mercado Pago
  // de verdad, pero deja usar el sistema hasta paidUntil (el backend corta
  // el acceso solo despues, ver isSubscriptionExpired en middleware/tenant.ts).
  // Doble click a proposito (primero pide confirmar) para no dar de baja
  // por error un click perdido.
  const cancelSubscription = async () => {
    if (!confirmingCancel) {
      setConfirmingCancel(true);
      return;
    }
    setCancelling(true);
    setError('');
    try {
      const { data } = await api.post('/billing/cancel');
      const updated = data.content ?? data;
      setStatus(updated);
      setConfirmingCancel(false);
      const claimLine = updated?.claimCode ? ` Constancia: ${updated.claimCode}.` : '';
      setCancelMessage(
        (updated?.paidUntil
          ? `Diste de baja tu suscripción. Vas a poder seguir usando ComarPOS hasta el ${fmtDate(updated.paidUntil)}, no se te va a cobrar de nuevo.`
          : 'Diste de baja tu suscripción. No se te va a cobrar de nuevo.') + claimLine
      );
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'No pudimos procesar la baja. Probá de nuevo o escribinos.');
      setConfirmingCancel(false);
    } finally {
      setCancelling(false);
    }
  };

  // Pago por transferencia: informa el nro de operacion y queda pendiente
  // hasta que lo confirmamos contra el extracto (ver backend
  // billing.service.ts#reportTransfer) -- no desbloquea al instante.
  const reportTransfer = async () => {
    if (!transferRef.trim()) {
      setError('Ingresá el número de operación o comprobante de la transferencia.');
      return;
    }
    setReportingTransfer(true);
    setError('');
    try {
      const { data } = await api.post('/billing/transfer-report', {
        planId: selectedPlanId ?? undefined,
        reference: transferRef,
        payerName: transferPayer,
        note: transferNote,
      });
      setStatus(data.content ?? data);
      // Que la pantalla de bloqueo y los carteles ya muestren "la estamos
      // confirmando" sin recargar.
      usePlanFeaturesStore.getState().load();
      setTransferRef('');
      setTransferPayer('');
      setTransferNote('');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'No pudimos registrar la transferencia. Probá de nuevo o escribinos.');
    } finally {
      setReportingTransfer(false);
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

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;

  // Su plan actual se muestra con SU precio (especial/promo); los demas
  // planes, con el precio de lista vigente.
  const priceFor = (plan: { id: string; priceArs: number } | null | undefined) =>
    plan && status && plan.id === status.planId && status.monthlyPrice ? status.monthlyPrice : plan?.priceArs ?? 0;

  // Transferencia disponible para quien no tiene auto-cobro de Mercado Pago
  // (los que pagan con MP ya se renuevan solos) o tiene algo pendiente de
  // pago. Con una suscripcion MP activa y al dia no se ofrece, para no
  // terminar pagando el mismo mes dos veces.
  const needsPayment = !!status && (status.subscriptionStatus !== 'ACTIVE' || isExpiredActive);
  const canPayByTransfer = !!status?.transferInfo?.enabled && (needsPayment || !status.mpPreapprovalId);
  const pendingTransfer = status?.lastTransferReport?.status === 'PENDING' ? status.lastTransferReport : null;
  const rejectedTransfer = status?.lastTransferReport?.status === 'REJECTED' ? status.lastTransferReport : null;
  const transferPlan = selectedPlan ?? status?.plan ?? null;
  const transferAmount = priceFor(transferPlan);
  // Medio de pago habilitado por el super-admin para este negocio
  // (Tenant.billingPaymentMethod): si es solo transferencia no se ofrece
  // Mercado Pago, y si es solo MP el backend ya manda transferInfo apagado.
  const mpAllowed = status?.billingPaymentMethod !== 'TRANSFER';
  const showTransfer = canPayByTransfer && (payMethod === 'transfer' || !mpAllowed);

  const card = (
    <div className="card" style={{ padding: 28 }}>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
          <div className="spinner" />
        </div>
      ) : isReturningFromMp && status?.subscriptionStatus === 'ACTIVE' ? (
        // Pantalla distinta a proposito para el regreso de Mercado
        // Pago ya confirmado -- antes esto mostraba la misma tarjeta
        // de siempre (con el selector de plan y el boton de dar de
        // baja), lo cual se sentia raro justo despues de pagar. El
        // poll de arriba (ver useEffect) ya se encargo de esperar a
        // que status pase a ACTIVE antes de mostrar esto.
        <div style={{ textAlign: 'center', padding: '6px 0' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--success-dim, rgba(24,193,94,0.12))', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <PartyPopper size={26} style={{ color: 'var(--success)' }} />
          </div>
          <h1 style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>¡Gracias por suscribirte!</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 22, lineHeight: 1.5 }}>
            Tu plan <strong>{status.plan.name}</strong> ya está activo{status.paidUntil ? `, al día hasta el ${fmtDate(status.paidUntil)}` : ''}. Ya podés arrancar a usar ComarPOS.
          </p>
          {user?.tenantSlug ? (
            <Link href={`/${user.tenantSlug}/pos`} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', gap: 8 }}>
              Ir al sistema
            </Link>
          ) : (
            <button onClick={() => setIsReturningFromMp(false)} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', gap: 8 }}>
              Ver mi suscripción
            </button>
          )}
        </div>
      ) : (
        <>
          <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
            {isReturningFromMp ? 'Estamos confirmando tu pago' : isExpiredActive ? 'Tu período pago terminó' : status?.subscriptionStatus === 'ACTIVE' ? 'Tu suscripción' : 'Activá tu suscripción'}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20, lineHeight: 1.5 }}>
            {isReturningFromMp
              ? 'Mercado Pago nos avisa apenas se acredite, puede tardar unos segundos. Estamos revisando solos, no hace falta que actualices la página.'
              : isExpiredActive
              ? `Tu período pago venció el ${fmtDate(status!.paidUntil!)} y la cuenta quedó pausada. Aboná para volver a usar ComarPOS.`
              : status?.subscriptionStatus === 'ACTIVE'
              ? 'Podés cambiar de plan cuando quieras — cancelamos tu suscripción actual y arrancamos la nueva en el mismo paso.'
              : reasonText()}
          </p>

          {status?.subscriptionStatus === 'ACTIVE' && !isExpiredActive ? (
            <div style={{ background: 'var(--success-dim, rgba(24,193,94,0.1))', border: '1px solid rgba(24,193,94,0.25)', borderRadius: 8, padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18 }}>
              <CheckCircle2 size={18} style={{ color: 'var(--success)', flexShrink: 0 }} />
              <div style={{ fontSize: 13, color: 'var(--text)' }}>
                Plan <strong>{status.plan.name}</strong>, al día{status.paidUntil ? ` hasta el ${fmtDate(status.paidUntil)}` : ''}.
              </div>
            </div>
          ) : (
            <div style={{ border: '1px solid var(--border2)', borderRadius: 10, padding: 18, marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: 0.5, marginBottom: 6, fontFamily: 'var(--mono)' }}>
                {(selectedPlan ?? status?.plan)?.name.toUpperCase() ?? 'PLAN COMARPOS'}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>
                ${priceFor(selectedPlan ?? status?.plan).toLocaleString('es-AR')}
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)' }}> /mes</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
                {(selectedPlan ?? status?.plan)?.tagline ?? 'Precio de lanzamiento por tiempo limitado.'}
              </p>
            </div>
          )}

          {plans.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>
                {status?.subscriptionStatus === 'ACTIVE' ? 'Cambiar de plan' : 'Elegí tu plan'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {plans.map((p) => {
                  const isSelected = p.id === selectedPlanId;
                  const isCurrent = status?.subscriptionStatus === 'ACTIVE' && p.id === status.planId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPlanId(p.id)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                        padding: '10px 14px', borderRadius: 8, textAlign: 'left', cursor: 'pointer',
                        border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border2)'}`,
                        background: isSelected ? 'var(--accent-dim)' : 'transparent',
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                        {p.name}
                        {isCurrent && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--success)', marginLeft: 6 }}>· plan actual</span>}
                      </span>
                      <span style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text2)' }}>
                        ${priceFor(p).toLocaleString('es-AR')}/mes
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {pendingTransfer && (
            <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 8, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
              <Clock size={16} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.5 }}>
                Informaste una transferencia de <strong>${pendingTransfer.amount.toLocaleString('es-AR')}</strong> el {fmtDate(pendingTransfer.createdAt)} (op. {pendingTransfer.reference}). La estamos confirmando — apenas se acredite tu cuenta queda al día, no hace falta que hagas nada más.
              </div>
            </div>
          )}

          {canPayByTransfer && mpAllowed && !pendingTransfer && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14, background: 'var(--surface2)', padding: 4, borderRadius: 8 }}>
              {([
                { key: 'mp', label: 'Mercado Pago', icon: CreditCard },
                { key: 'transfer', label: 'Transferencia', icon: Landmark },
              ] as const).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setPayMethod(key); setError(''); }}
                  className="btn btn-sm"
                  style={{
                    gap: 6, justifyContent: 'center', fontWeight: 700,
                    background: payMethod === key ? 'var(--surface)' : 'transparent',
                    border: payMethod === key ? '1px solid var(--border2)' : '1px solid transparent',
                    color: payMethod === key ? 'var(--text)' : 'var(--text3)',
                  }}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          )}

          {showTransfer && !pendingTransfer && (
            <div style={{ border: '1px solid var(--border2)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              {rejectedTransfer && (
                <div style={{ background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 10px', marginBottom: 12, fontSize: 12, color: 'var(--danger)', display: 'flex', gap: 8 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    No pudimos confirmar tu transferencia (op. {rejectedTransfer.reference}){rejectedTransfer.reviewNote ? `: ${rejectedTransfer.reviewNote}` : '.'} Revisá los datos e informala de nuevo.
                  </span>
                </div>
              )}
              <p style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 10 }}>
                Transferí <strong style={{ color: 'var(--text)' }}>${transferAmount.toLocaleString('es-AR')}</strong> ({transferPlan?.name}, 1 mes) a esta cuenta y después informanos el pago:
              </p>
              <div style={{ marginBottom: 14 }}>
                {status?.transferInfo?.alias && <CopyRow label="Alias" value={status.transferInfo.alias} />}
                {status?.transferInfo?.cbu && <CopyRow label="CBU / CVU" value={status.transferInfo.cbu} />}
                {status?.transferInfo?.holder && <CopyRow label="Titular" value={status.transferInfo.holder} />}
                {status?.transferInfo?.cuit && <CopyRow label="CUIT" value={status.transferInfo.cuit} />}
                {status?.transferInfo?.bank && <CopyRow label="Banco" value={status.transferInfo.bank} />}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input

                  placeholder="Nro. de operación / comprobante *"
                  value={transferRef}
                  maxLength={100}
                  onChange={(e) => setTransferRef(e.target.value)}
                />
                <input

                  placeholder="Titular de la cuenta que transfirió (opcional)"
                  value={transferPayer}
                  maxLength={120}
                  onChange={(e) => setTransferPayer(e.target.value)}
                />
                <input

                  placeholder="Comentario (opcional)"
                  value={transferNote}
                  maxLength={500}
                  onChange={(e) => setTransferNote(e.target.value)}
                />
                <button onClick={reportTransfer} disabled={reportingTransfer} className="btn btn-primary" style={{ width: '100%', gap: 8 }}>
                  {reportingTransfer ? <span className="spinner" style={{ width: 15, height: 15 }} /> : <><Landmark size={15} /> Ya transferí, informar pago</>}
                </button>
                <p style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
                  Confirmamos la acreditación a mano (normalmente en el día hábil). Cuando la confirmemos, tu cuenta queda al día por un mes más.
                </p>
              </div>
            </div>
          )}

          {cancelMessage && (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 6, padding: '9px 12px', marginBottom: 16, fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
              {cancelMessage}
            </div>
          )}

          {error && (
            <div style={{ background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '9px 12px', marginBottom: 16, fontSize: 13, color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {status?.subscriptionStatus !== 'ACTIVE' && mpAllowed && !showTransfer && (
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

            {isChangingPlan && mpAllowed && !showTransfer && (
              <button onClick={subscribe} disabled={redirecting} className="btn btn-primary" style={{ width: '100%', gap: 8 }}>
                {redirecting ? (
                  <span className="spinner" style={{ width: 15, height: 15 }} />
                ) : (
                  <>
                    <Repeat size={15} /> Confirmar cambio a {selectedPlan?.name}
                  </>
                )}
              </button>
            )}

            {/* Diste de baja pero seguís en tu período pagado (ACTIVE
                sin mpPreapprovalId) y no elegiste otro plan: te dejamos
                reactivar la misma suscripción sin tener que esperar a
                que se corte el acceso. */}
            {!isChangingPlan && status?.subscriptionStatus === 'ACTIVE' && !status.mpPreapprovalId && mpAllowed && !showTransfer && (
              <button onClick={subscribe} disabled={redirecting} className="btn btn-primary" style={{ width: '100%', gap: 8 }}>
                {redirecting ? (
                  <span className="spinner" style={{ width: 15, height: 15 }} />
                ) : (
                  <>
                    <CreditCard size={15} /> Reactivar suscripción
                  </>
                )}
              </button>
            )}

            <button onClick={() => load()} className="btn btn-secondary" style={{ width: '100%', gap: 8 }}>
              <RefreshCcw size={14} /> Actualizar estado
            </button>

            {/* Ahora el negocio bloqueado entra igual al sistema (ver
                BillingBlockedScreen), asi que llega aca desde adentro y
                necesita poder volver. */}
            {!embedded && user?.tenantSlug && (
              <Link href={`/${user.tenantSlug}/dashboard`} className="btn btn-ghost" style={{ width: '100%', gap: 8, justifyContent: 'center' }}>
                Volver al sistema
              </Link>
            )}

            {/* mpPreapprovalId cubre PAST_DUE/SUSPENDED con una
                suscripción de MP todavía activa (un pago que falló es
                justo cuando mas se necesita poder cancelar, no menos);
                subscriptionStatus ACTIVE cubre el plan manual sin MP
                (ver cancelSubscription en billing.service.ts). */}
            {(status?.mpPreapprovalId || status?.subscriptionStatus === 'ACTIVE') && !cancelMessage && (
              <button
                onClick={cancelSubscription}
                disabled={cancelling}
                className="btn btn-ghost"
                style={{ width: '100%', gap: 8, color: confirmingCancel ? 'var(--danger)' : 'var(--text3)', border: confirmingCancel ? '1px solid rgba(239,68,68,0.4)' : undefined }}
              >
                {cancelling ? (
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                ) : (
                  <>
                    <Ban size={14} />
                    {confirmingCancel ? 'Confirmar baja (sin vuelta atrás)' : 'Botón de arrepentimiento / dar de baja'}
                  </>
                )}
              </button>
            )}
            {confirmingCancel && (
              <button onClick={() => setConfirmingCancel(false)} className="btn btn-ghost" style={{ width: '100%', color: 'var(--text3)', fontSize: 12 }}>
                No, mantener mi suscripción
              </button>
            )}

            <a
              href={waLink('¡Hola! Necesito ayuda con la suscripción de ComarPOS.')}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost"
              style={{ width: '100%', gap: 8 }}
            >
              <MessageCircle size={14} /> ¿Ya pagaste o tenés dudas? Escribinos
            </a>

            {!embedded && (

              <button onClick={() => logout()} className="btn btn-ghost" style={{ width: '100%', gap: 8, color: 'var(--text3)' }}>

                <LogOut size={14} /> Cerrar sesión

              </button>

            )}
          </div>
        </>
      )}
    </div>
  );

  if (embedded) return <div style={{ maxWidth: 520 }}>{card}</div>;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <img src="/brand/logo-horizontal-negativo.png" alt="ComarPOS" className="brand-logo-dark" style={{ height: 28, width: 'auto', objectFit: 'contain' }} />
          <img src="/brand/logo-horizontal-positivo.png" alt="ComarPOS" className="brand-logo-light" style={{ height: 28, width: 'auto', objectFit: 'contain' }} />
        </div>
        {card}
      </div>
    </div>
  );
}
