'use client';

import { CreditCard, Landmark } from 'lucide-react';
import type { SubscriptionSnapshot } from '@/store/planFeatures';
import { useAuthStore } from '@/store/auth';

// Botones "Pagar con..." segun el medio de pago que el super-admin le
// habilito a este negocio (Tenant.billingPaymentMethod). Compartido entre el
// cartel de vencimiento (PaymentDueModal) y la pantalla de bloqueo
// (BillingBlockedScreen) para que ofrezcan exactamente lo mismo.
export default function BillingPayActions({ subscription }: { subscription: SubscriptionSnapshot | null }) {
  const tenantSlug = useAuthStore((s) => s.user?.tenantSlug);
  // Dentro del sistema se paga desde "Mi suscripción" (sin salir del menu);
  // /suscripcion suelta queda como respaldo si no hay slug.
  const base = tenantSlug ? `/${tenantSlug}/mi-suscripcion` : '/suscripcion';
  const method = subscription?.billingPaymentMethod ?? 'ANY';
  const mpAllowed = method !== 'TRANSFER';
  const transferAllowed = method !== 'MERCADOPAGO' && !!subscription?.transferEnabled;

  return (
    <>
      {mpAllowed && (
        <a href={base} className="btn btn-primary" style={{ width: '100%', gap: 8, justifyContent: 'center' }}>
          <CreditCard size={15} /> Pagar con Mercado Pago
        </a>
      )}
      {transferAllowed && (
        <a
          href={`${base}?metodo=transferencia`}
          className={`btn ${mpAllowed ? 'btn-secondary' : 'btn-primary'}`}
          style={{ width: '100%', gap: 8, justifyContent: 'center' }}
        >
          <Landmark size={15} /> Pagar por transferencia
        </a>
      )}
      {!mpAllowed && !transferAllowed && (
        // Solo transferencia pero todavia sin cuenta cargada en
        // /platform-admin/cobros: igual tiene que poder llegar a /suscripcion.
        <a href={base} className="btn btn-primary" style={{ width: '100%', gap: 8, justifyContent: 'center' }}>
          <Landmark size={15} /> Ver cómo pagar
        </a>
      )}
    </>
  );
}
