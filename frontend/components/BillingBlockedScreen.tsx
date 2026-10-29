'use client';

import { Lock, Clock, MessageCircle } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { usePlanFeaturesStore, type BillingBlock } from '@/store/planFeatures';
import { waLink } from '@/components/landing/siteConfig';
import BillingPayActions from './BillingPayActions';

// Lo que ve un negocio bloqueado (prueba vencida, falta de pago o
// suspendido -- ver backend middleware/tenant.ts#getTenantBlock): entra al
// sistema y ve el menu, pero cada pantalla queda reemplazada por esto hasta
// que pague. El backend igual rechaza todos los requests de negocio, esto
// es solo la cara visible del bloqueo.
const TITLES: Record<string, string> = {
  TRIAL_EXPIRED: 'Tu prueba gratis terminó',
  SUBSCRIPTION_EXPIRED: 'Tu cuenta está pausada por falta de pago',
  TENANT_SUSPENDED: 'Tu cuenta está suspendida',
};

export default function BillingBlockedScreen({ block }: { block: BillingBlock }) {
  const user = useAuthStore((s) => s.user);
  const subscription = usePlanFeaturesStore((s) => s.subscription);
  const isAdmin = user?.role === 'ADMIN';
  const pendingTransfer = subscription?.lastTransferStatus === 'PENDING';

  return (
    <div className="card" style={{ padding: 32, maxWidth: 460, margin: '40px auto', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12 }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.3)', display: 'grid', placeItems: 'center' }}>
        <Lock size={22} style={{ color: 'var(--danger)' }} />
      </div>
      <div style={{ fontWeight: 800, fontSize: 17 }}>{TITLES[block.code] ?? 'Tu cuenta está bloqueada'}</div>
      <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
        {isAdmin
          ? 'Todas las secciones quedan bloqueadas hasta que se registre el pago. Tus datos están a salvo: apenas pagues, todo vuelve a funcionar como antes.'
          : 'Todas las secciones quedan bloqueadas hasta que el administrador del negocio regularice el pago. Avisale para que pueda abonar.'}
      </p>

      {subscription?.amount != null && (
        <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 20 }}>
          ${subscription.amount.toLocaleString('es-AR')}
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}> /mes{subscription.planName ? ` · Plan ${subscription.planName}` : ''}</span>
        </div>
      )}

      {pendingTransfer && (
        <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 8, padding: '10px 12px', display: 'flex', gap: 8, fontSize: 12.5, textAlign: 'left', width: '100%' }}>
          <Clock size={15} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
          <span>Recibimos el aviso de tu transferencia y la estamos confirmando. Apenas se acredite se desbloquea solo.</span>
        </div>
      )}

      {isAdmin && block.code !== 'TENANT_SUSPENDED' && !pendingTransfer && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginTop: 4 }}>
          <BillingPayActions subscription={subscription} />
        </div>
      )}

      <a
        href={waLink('¡Hola! Mi cuenta de ComarPOS está bloqueada y necesito ayuda con el pago.')}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-ghost btn-sm"
        style={{ gap: 6 }}
      >
        <MessageCircle size={13} /> ¿Necesitás ayuda? Escribinos
      </a>
    </div>
  );
}
