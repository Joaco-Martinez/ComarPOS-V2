'use client';
import { create } from 'zustand';
import api from '@/lib/api';
import type { BillingPaymentMethod, BillingReminders, PlanFeatureKey, TenantSubscriptionStatus, TransferReportStatus } from '@/types';

// Lo minimo de /billing/status que necesita el cartel de "hay que abonar"
// (components/PaymentDueModal.tsx) -- viene en el mismo request que los
// features, asi que no suma una llamada mas por pantalla.
export interface SubscriptionSnapshot {
  subscriptionStatus: TenantSubscriptionStatus;
  trialEndsAt: string | null;
  paidUntil: string | null;
  hasMpSubscription: boolean;
  planName: string | null;
  amount: number | null;
  transferEnabled: boolean;
  billingPaymentMethod: BillingPaymentMethod;
  lastTransferStatus: TransferReportStatus | null;
  reminders: BillingReminders;
}

// Bloqueo por falta de pago / prueba vencida / suspension (mismo codigo que
// devuelve backend middleware/tenant.ts#getTenantBlock). Con esto seteado el
// usuario sigue dentro del sistema pero AppLayout reemplaza cada pantalla
// por BillingBlockedScreen hasta que pague.
export interface BillingBlock {
  code: string;
  message: string;
}

interface PlanFeaturesState {
  // null = todavia no cargo o fallo la carga -- se trata como "todo
  // permitido" (fail-open) para no dejar a un tenant entero sin poder
  // navegar si /billing/status esta caido; una vez que carga bien, cada
  // modulo ausente/false en el objeto se interpreta como bloqueado.
  features: Partial<Record<PlanFeatureKey, boolean>> | null;
  planName: string | null;
  loaded: boolean;
  // Flujo de cobro alternativo del POS (modal de metodo + monto + vuelto al
  // confirmar) -- flag por tenant puntual, no un modulo de navConfig.ts, así
  // que va aparte de `features`. Ver Tenant.posCheckoutModalEnabled.
  posCheckoutModalEnabled: boolean;
  // Multi-facturacion: hasta 4 ArcaConfig (duenos/CUIT) para este tenant --
  // flag por tenant puntual, prendido a mano desde /platform-admin. Ver
  // Tenant.multiInvoicingEnabled.
  multiInvoicingEnabled: boolean;
  subscription: SubscriptionSnapshot | null;
  block: BillingBlock | null;
  setBlock: (block: BillingBlock | null) => void;
  load: () => Promise<void>;
  reset: () => void;
}

export const usePlanFeaturesStore = create<PlanFeaturesState>((set) => ({
  features: null,
  planName: null,
  loaded: false,
  posCheckoutModalEnabled: false,
  multiInvoicingEnabled: false,
  subscription: null,
  block: null,
  setBlock: (block) => set({ block }),
  load: async () => {
    try {
      const { data } = await api.get('/billing/status');
      const status = data.content ?? data;
      set({
        features: status?.plan?.features ?? null,
        planName: status?.plan?.name ?? null,
        posCheckoutModalEnabled: !!status?.posCheckoutModalEnabled,
        multiInvoicingEnabled: !!status?.multiInvoicingEnabled,
        subscription: status?.subscriptionStatus
          ? {
              subscriptionStatus: status.subscriptionStatus,
              trialEndsAt: status.trialEndsAt ?? null,
              paidUntil: status.paidUntil ?? null,
              hasMpSubscription: !!status.mpPreapprovalId,
              planName: status.plan?.name ?? null,
              amount: status.monthlyPrice ?? status.plan?.priceArs ?? null,
              transferEnabled: !!status.transferInfo?.enabled,
              billingPaymentMethod: status.billingPaymentMethod ?? 'ANY',
              lastTransferStatus: status.lastTransferReport?.status ?? null,
              reminders: status.reminders ?? { payWindowDays: 7, urgentDays: 3 },
            }
          : null,
        block: status?.block ?? null,
        loaded: true,
      });
    } catch {
      set({ features: null, posCheckoutModalEnabled: false, multiInvoicingEnabled: false, subscription: null, block: null, loaded: true });
    }
  },
  reset: () => set({ features: null, planName: null, posCheckoutModalEnabled: false, multiInvoicingEnabled: false, subscription: null, block: null, loaded: false }),
}));

/** true si no hay info cargada (fail-open) o el modulo no esta explicitamente apagado. */
export function isModuleAllowed(features: Partial<Record<PlanFeatureKey, boolean>> | null, key?: PlanFeatureKey): boolean {
  if (!key) return true;
  if (!features) return true;
  return features[key] !== false;
}
