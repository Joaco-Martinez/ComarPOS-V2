'use client';
import { create } from 'zustand';
import type { QuickAccessConfig, User } from '@/types';
import api from '@/lib/api';
import { writeCachedQuickAccessConfig } from '@/lib/quickAccess';

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  me: () => Promise<void>;
  updateQuickAccessConfig: (config: QuickAccessConfig | null) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  setUser: (u) => set({ user: u }),
  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    const user = data.content ?? data;
    set({ user });
    return user;
  },
  logout: async () => {
    await api.post('/auth/logout').catch(() => {});
    set({ user: null });
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },
  me: async () => {
    try {
      const { data } = await api.get('/auth/me');
      const user = data.content ?? data;
      set({ user, loading: false });
      if (user?.id) writeCachedQuickAccessConfig(user.id, user.quickAccessConfig ?? null);
    } catch {
      set({ user: null, loading: false });
    }
  },
  updateQuickAccessConfig: async (config) => {
    const currentUser = get().user;
    if (!currentUser) return;
    // Optimista: se ve al toque, se pisa con lo que confirme el server
    set({ user: { ...currentUser, quickAccessConfig: config } });
    writeCachedQuickAccessConfig(currentUser.id, config);
    const { data } = await api.patch('/auth/me/quick-access', { config });
    const updated = data.content ?? data;
    set({ user: updated });
    writeCachedQuickAccessConfig(updated.id, updated.quickAccessConfig ?? null);
  },
}));
