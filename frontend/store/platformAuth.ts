'use client';
import { create } from 'zustand';
import type { PlatformAdmin } from '@/types';
import api from '@/lib/api';

interface PlatformAuthState {
  admin: PlatformAdmin | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<PlatformAdmin>;
  logout: () => Promise<void>;
  me: () => Promise<void>;
}

export const usePlatformAuthStore = create<PlatformAuthState>((set) => ({
  admin: null,
  loading: true,
  login: async (email, password) => {
    const { data } = await api.post('/platform-admin/auth/login', { email, password });
    const admin = data.content?.admin ?? data.content ?? data;
    set({ admin, loading: false });
    return admin;
  },
  logout: async () => {
    await api.post('/platform-admin/auth/logout').catch(() => {});
    set({ admin: null });
    if (typeof window !== 'undefined') {
      window.location.href = '/platform-admin/login';
    }
  },
  me: async () => {
    try {
      const { data } = await api.get('/platform-admin/auth/me');
      set({ admin: data.content ?? data, loading: false });
    } catch {
      set({ admin: null, loading: false });
    }
  },
}));
