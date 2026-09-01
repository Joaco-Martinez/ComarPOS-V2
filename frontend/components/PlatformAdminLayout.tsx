'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePlatformAuthStore } from '@/store/platformAuth';
import { Building2, LogOut, ShieldCheck, Store } from 'lucide-react';

interface PlatformAdminLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function PlatformAdminLayout({ children, title, subtitle, actions }: PlatformAdminLayoutProps) {
  const { admin, loading, me, logout } = usePlatformAuthStore();
  const router = useRouter();
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(56);

  useEffect(() => {
    if (loading) me();
  }, [loading, me]);

  // .app-header es position:fixed (ver globals.css) -- el padding-top de
  // <main> compensa esa altura, medida con ResizeObserver por si el header
  // llega a envolver en pantallas chicas (mismo motivo que en AppLayout.tsx).
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height;
      if (height) setHeaderHeight(Math.ceil(height));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!loading && !admin) router.replace('/platform-admin/login');
  }, [admin, loading, router]);

  if (loading || !admin) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', ['--app-header-height' as string]: `${headerHeight}px` }}>
      <header ref={headerRef} className="app-header">
        <Link href="/platform-admin" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'var(--text)', minWidth: 0, overflow: 'hidden' }}>
          <ShieldCheck size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>ComarPOS · Plataforma</span>
        </Link>

        <div className="app-header-actions">
          <Link href="/platform-admin" className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
            <Building2 size={13} /> Tenants
          </Link>
          <Link href="/platform-admin/crm" className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
            <Store size={13} /> CRM
          </Link>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>{admin.name}</span>
          <button onClick={() => logout()} className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
            <LogOut size={13} /> Salir
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1200, width: '100%', margin: '0 auto', padding: `${headerHeight + 22}px 20px 22px` }}>
        {(title || subtitle || actions) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
            <div>
              {title && <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{title}</h1>}
              {subtitle && <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{subtitle}</p>}
            </div>
            {actions}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
