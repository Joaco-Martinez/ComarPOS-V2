'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { usePlanFeaturesStore, isModuleAllowed } from '@/store/planFeatures';
import { NAV, ADMIN_NAV, groupNavItems, type NavItem } from '@/lib/navConfig';
import {
  PanelLeftClose, PanelLeftOpen, LogOut, ChevronRight, Lock,
} from 'lucide-react';

const STORAGE_KEY = 'comarpos-sidebar-collapsed';

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

const SCROLL_KEY = 'comarpos-sidebar-scroll';

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const params = useParams<{ tenant?: string }>();
  const { user, logout } = useAuthStore();
  const { features } = usePlanFeaturesStore();
  const navRef = useRef<HTMLElement>(null);
  const tenantSlug = params?.tenant || user?.tenantSlug || '';

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });

  useEffect(() => {
    if (navRef.current) {
      const saved = sessionStorage.getItem(SCROLL_KEY);
      if (saved) navRef.current.scrollTop = Number(saved);
    }
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(next));
      window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { collapsed: next } }));
    }
  };

  const w = collapsed ? 72 : 236;

  const renderItem = ({ href, icon: Icon, label, color, moduleKey }: NavItem) => {
    const fullHref = `/${tenantSlug}${href}`;
    const active = pathname === fullHref || (href !== '/dashboard' && pathname.startsWith(fullHref));
    // Bloqueado != oculto: sigue en el menu (y sigue siendo un link normal a
    // la pantalla real, que ya se encarga de mostrar "no incluido en tu
    // plan" -- ver AppLayout) para que el negocio vea que existe y lo
    // tiente a mejorar el plan, en vez de desaparecer sin explicacion.
    const locked = !isModuleAllowed(features, moduleKey);
    return (
      <Link
        key={href}
        href={fullHref}
        onClick={onClose}
        title={collapsed ? (locked ? `${label} (no incluido en tu plan)` : label) : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: collapsed ? '9px 10px' : '8px 10px',
          borderRadius: 6,
          textDecoration: 'none',
          fontSize: 13,
          fontWeight: 600,
          color: locked ? 'var(--text3)' : active ? 'var(--text)' : 'var(--text2)',
          opacity: locked ? 0.6 : 1,
          background: active ? 'rgba(13,89,231,0.14)' : 'transparent',
          border: `1px solid ${active ? 'rgba(13,89,231,0.25)' : 'transparent'}`,
          transition: 'all 0.12s',
          marginBottom: 1,
          justifyContent: collapsed ? 'center' : 'flex-start',
          position: 'relative',
        }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(13,89,231,0.07)'; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
      >
        {active && !collapsed && (
          <span style={{
            position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
            width: 3, height: 18, background: color, borderRadius: '0 2px 2px 0',
          }} />
        )}

        <Icon size={collapsed ? 17 : 15} style={{ color: locked ? 'var(--text3)' : active ? color : 'var(--text3)', flexShrink: 0 }} />

        {!collapsed && (
          <>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label}
            </span>
            {locked ? (
              <Lock size={11} style={{ color: 'var(--text3)', marginLeft: 'auto', flexShrink: 0 }} />
            ) : (
              active && <ChevronRight size={11} style={{ color: 'var(--text3)', marginLeft: 'auto' }} />
            )}
          </>
        )}
      </Link>
    );
  };

  const content = (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg)',
      borderRight: '1px solid var(--border)',
      width: '100%',
    }}>
      {/* Logo */}
      <div style={{
        padding: collapsed ? '18px 12px' : '20px 18px 16px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start' }}>
          {collapsed ? (
            // Colapsado: solo el isotipo "C", no entra el wordmark horizontal.
            <img src="/brand/isologo.png" alt="ComarPOS" width={40} height={40} style={{ objectFit: 'contain', flexShrink: 0 }} />
          ) : (
            <>
              <img src="/brand/logo-horizontal-negativo.png" alt="ComarPOS" className="brand-logo-dark" style={{ height: 32, width: 'auto', objectFit: 'contain' }} />
              <img src="/brand/logo-horizontal-positivo.png" alt="ComarPOS" className="brand-logo-light" style={{ height: 32, width: 'auto', objectFit: 'contain' }} />
            </>
          )}
        </div>

        {!collapsed && (user?.tenantName || tenantSlug) && (
          <div
            title={user?.tenantName ?? tenantSlug}
            style={{
              marginTop: 10,
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text2)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '5px 8px',
            }}
          >
            {user?.tenantName ?? tenantSlug}
          </div>
        )}
      </div>

      {/* Collapse toggle (desktop) */}
      <div className="hidden md:block" style={{ padding: collapsed ? '8px 10px 4px' : '8px 10px 4px' }}>
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? 'Expandir' : 'Colapsar'}
          className="btn btn-ghost btn-sm"
          style={{ width: '100%', justifyContent: collapsed ? 'center' : 'flex-start', gap: 7, color: 'var(--text3)', fontSize: 11 }}
        >
          {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          {!collapsed && 'Colapsar menú'}
        </button>
      </div>

      {/* Nav */}
      <nav
        ref={navRef}
        onScroll={() => navRef.current && sessionStorage.setItem(SCROLL_KEY, String(navRef.current.scrollTop))}
        style={{ flex: 1, overflowY: 'auto', padding: collapsed ? '4px 8px' : '6px 8px' }}
      >
        {/* Antes esto era una lista plana de ~40 items bajo dos titulos
            ("Principal"/"Administración") - costaba encontrar algo puntual.
            Se agrupa por tema (ver GROUP_ORDER en navConfig.ts) con un
            subtitulo por grupo, mismo criterio que el "more sheet" mobile
            (BottomNav.tsx). NAV+ADMIN_NAV se agrupan juntos (no en dos
            pasadas separadas) para que un grupo que tiene items en ambos
            arrays (ej. "Catálogo y stock": Stock es de todos, Conteo de
            Stock es solo ADMIN) no aparezca partido en dos secciones
            iguales no contiguas. */}
        {groupNavItems(user?.role === 'ADMIN' ? [...NAV, ...ADMIN_NAV] : NAV).map(([groupName, items], idx) => (
          <div key={groupName}>
            {!collapsed && (
              <div style={{ fontSize: 9, color: 'var(--text3)', letterSpacing: 2, textTransform: 'uppercase', fontFamily: 'var(--mono)', padding: idx === 0 ? '8px 10px 4px' : '14px 10px 4px' }}>
                {groupName}
              </div>
            )}
            {collapsed && idx > 0 && <div style={{ height: 8 }} />}
            {items.map(renderItem)}
          </div>
        ))}
      </nav>

      {/* Footer user */}
      <div style={{ padding: collapsed ? '10px 8px' : '12px 10px', borderTop: '1px solid var(--border)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6,
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
          <div
            title={collapsed ? `${user?.name ?? 'Usuario'} — ${user?.role}` : undefined}
            style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'var(--accent-dim)',
              border: '1px solid rgba(13,89,231,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
            }}
          >
            {user?.name?.[0]?.toUpperCase() ?? 'U'}
          </div>

          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name}
              </div>
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: user?.role === 'ADMIN' ? 'var(--accent)' : 'var(--text3)' }}>
                {user?.role}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => logout()}
          className="btn btn-ghost btn-sm"
          title={collapsed ? 'Cerrar sesión' : undefined}
          style={{ width: '100%', justifyContent: collapsed ? 'center' : 'flex-start', gap: 7, color: 'var(--text3)', fontSize: 11 }}
        >
          <LogOut size={13} />
          {!collapsed && 'Cerrar sesión'}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div
        className="hidden md:flex"
        style={{
          width: w, position: 'fixed', top: 0, left: 0, bottom: 0,
          zIndex: 40, flexDirection: 'column',
          transition: 'width 0.2s ease',
        }}
      >
        {content}
      </div>

      {/* Mobile drawer */}
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 260 }}>
            {content}
          </div>
        </div>
      )}
    </>
  );
}
