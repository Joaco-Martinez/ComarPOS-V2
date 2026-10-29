'use client';

import SubscriptionPanel from '@/components/SubscriptionPanel';

// Pagina suelta (sin menu): adonde vuelve Mercado Pago despues de pagar y
// adonde se manda a quien llega sin pasar por el sistema. Dentro del
// sistema el mismo contenido vive en /[tenant]/mi-suscripcion.
export default function SuscripcionPage() {
  return <SubscriptionPanel />;
}
