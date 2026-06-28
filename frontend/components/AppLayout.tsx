'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import Sidebar from './Sidebar';
import Toasts from './Toasts';
import NotificationsBell from './NotificationsBell';
import { useToast } from '@/hooks/useToast';
import { Menu, Sun, Moon } from 'lucide-react';
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
          <svg width="44" height="44" viewBox="0 0 40 40" fill="none" style={{ margin: '0 auto 16px', display: 'block' }}>
            <circle cx="18" cy="20" r="14" stroke="#2563EB" strokeWidth="3.5" strokeLinecap="round"
              strokeDasharray="60 88" strokeDashoffset="-10" />
            <rect x="25" y="27" width="9" height="9" rx="2" fill="#22C55E" />
          </svg>
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

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
        <header style={{
          position: 'sticky', top: 0, zIndex: 30,
          background: 'var(--bg)', backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border)',
          padding: '0 20px', height: 56,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <button
              className="md:hidden btn btn-ghost btn-sm"
              style={{ padding: 8 }}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={17} />
            </button>

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

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {actions}
            <button
              className="btn btn-ghost btn-sm"
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
          className="animate-fade"
          style={{ flex: 1, padding: '22px 20px', maxWidth: 1440, width: '100%', margin: '0 auto' }}
        >
          {children}
        </main>
      </div>

      <Toasts toasts={toasts} />
    </div>
  );
}
