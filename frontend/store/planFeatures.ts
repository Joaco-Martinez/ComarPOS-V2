'use client';
import { create } from 'zustand';
import api from '@/lib/api';
import type { PlanFeatureKey } from '@/types';

interface PlanFeaturesState {
  // null = todavia no cargo o fallo la carga -- se trata como "todo
  // permitido" (fail-open) para no dejar a un tenant entero sin poder
  // navegar si /billing/status esta caido; una vez que carga bien, cada
  // modulo ausente/false en el objeto se interpreta como bloqueado.
  features: Partial<Record<PlanFeatureKey, boolean>> | null;
  planName: string | null;
  loaded: boolean;
  load: () => Promise<void>;
  reset: () => void;
}

export const usePlanFeaturesStore = create<PlanFeaturesState>((set) => ({
  features: null,
  planName: null,
  loaded: false,
  load: async () => {
    try {
      const { data } = await api.get('/billing/status');
      const status = data.content ?? data;
      set({ features: status?.plan?.features ?? null, planName: status?.plan?.name ?? null, loaded: true });
    } catch {
      set({ features: null, loaded: true });
    }
  },
  reset: () => set({ features: null, planName: null, loaded: false }),
}));

/** true si no hay info cargada (fail-open) o el modulo no esta explicitamente apagado. */
export function isModuleAllowed(features: Partial<Record<PlanFeatureKey, boolean>> | null, key?: PlanFeatureKey): boolean {
  if (!key) return true;
  if (!features) return true;
  return features[key] !== false;
}
