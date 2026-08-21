'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import Sidebar from './Sidebar';
import Toasts from './Toasts';
import NotificationsBell from './NotificationsBell';
import BottomNav from './mobile/BottomNav';
import { useToast } from '@/hooks/useToast';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

const STORAGE_KEY = 'comarpos-sidebar-collapsed';

export default function AppLayout({ children, title, subtitle, actions }: AppLayoutProps) {
  const { user, loading, me } = useAuthStore();
  const router = useRouter();
  const params = useParams<{ tenant?: string }>();
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });
  const { toasts } = useToast();
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    if (loading) me();
  }, [loading, me]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  // La URL siempre lleva el slug del negocio (ej. /grupo-vj/pos), como en Mi
  // Taller Ya, para que quede claro en qué empresa estás parado. Si el slug
  // de la URL no coincide con el tenant real del usuario logueado (URL vieja
  // en favoritos, usuario cambiado, etc.), se corrige la URL sola.
  useEffect(() => {
    if (loading || !user || !user.tenantSlug) return;
    if (params?.tenant && params.tenant !== user.tenantSlug) {
      const rest = pathname.split('/').slice(2).join('/');
      router.replace(`/${user.tenantSlug}${rest ? `/${rest}` : ''}`);
    }
  }, [user, loading, params, pathname, router]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ collapsed: boolean }>;
      setSidebarCollapsed(ce.detail.collapsed);
    };
    window.addEventListener('sidebar-toggle', handler);
    return () => window.removeEventListener('sidebar-toggle', handler);
  }, []);

  const sidebarW = sidebarCollapsed ? 72 : 236;

  if (loading || !user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)' }}>
        <div style={{ textAlign: 'center' }}>
          <img src="/brand/isologo.png" alt="ComarPOS" width={88} height={88} style={{ margin: '0 auto 16px', display: 'block', objectFit: 'contain' }} />
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar />

      <div
        id="main-content"
        className="flex-1 flex flex-col"
        style={{ minHeight: '100vh', width: '100%', transition: 'margin-left 0.2s ease, width 0.2s ease' }}
      >
        <style>{`
          @media (min-width: 768px) {
            #main-content { margin-left: ${sidebarW}px; width: calc(100% - ${sidebarW}px); }
          }
          @media (max-width: 767px) {
            #main-content { margin-left: 0; width: 100%; }
          }
        `}</style>

        {/* Topbar */}
        <header className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {(title || subtitle) && (
              <div style={{ minWidth: 0 }}>
                {title && (
                  <h1 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {subtitle}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="app-header-actions">
            {actions}
            <button
              className="hidden md:flex btn btn-ghost btn-sm"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              style={{ padding: 7 }}
            >
              {theme === 'dark' ? <Sun size={15} style={{ color: 'var(--text3)' }} /> : <Moon size={15} style={{ color: 'var(--text3)' }} />}
            </button>
            <NotificationsBell />
          </div>
        </header>

        {/* Page content */}
        <main
          className="animate-fade-opacity"
          style={{ flex: 1, padding: '22px 20px', maxWidth: 1440, width: '100%', margin: '0 auto' }}
        >
          {children}
        </main>
      </div>

      <BottomNav />
      <Toasts toasts={toasts} />
    </div>
  );
}
