'use client';

import { useState, useRef, useEffect } from 'react';
import type { ElementType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import {
  ShoppingCart, Receipt, Package, FolderTree, Users, BarChart2, AlertTriangle,
  Wallet, FileText, RotateCcw, LayoutDashboard, ShoppingBag, Truck, TrendingUp,
  CreditCard, PieChart, Tag, Star, UserCog, MapPin, ShieldCheck, Building2,
  PanelLeftClose, PanelLeftOpen, LogOut, ChevronRight,
  ClipboardList, ClipboardCheck, Target, RefreshCw, DollarSign, List, Shield, FileCheck2,
} from 'lucide-react';

const NAV = [
  { href: '/pos',          icon: ShoppingCart,   label: 'POS — Ventas',       color: '#2563EB' },
  { href: '/ventas',       icon: Receipt,         label: 'Historial Ventas',   color: '#2563EB' },
  { href: '/productos',    icon: Package,         label: 'Productos',          color: '#22C55E' },
  { href: '/categorias',   icon: FolderTree,      label: 'Categorías',         color: '#F39C12' },
  { href: '/clientes',     icon: Users,           label: 'Clientes',           color: '#00B4DB' },
  { href: '/stock',        icon: BarChart2,       label: 'Stock',              color: '#6474BB' },
  { href: '/alertas',      icon: AlertTriangle,   label: 'Alertas',            color: '#EF4444' },
  { href: '/caja',         icon: Wallet,          label: 'Caja',               color: '#22C55E' },
  { href: '/remitos',      icon: FileCheck2,      label: 'Remitos',            color: '#00B4DB' },
  { href: '/facturacion',  icon: FileText,        label: 'AFIP / Facturas',    color: '#00B4DB' },
  { href: '/devoluciones', icon: RotateCcw,       label: 'Devoluciones',       color: '#F39C12' },
];

const ADMIN_NAV = [
  { href: '/dashboard',                        icon: LayoutDashboard, label: 'Dashboard',           color: '#22C55E' },
  { href: '/compras',                          icon: ShoppingBag,     label: 'Compras',             color: '#22C55E' },
  { href: '/ordenes-compra',                   icon: ClipboardList,   label: 'Órdenes de Compra',   color: '#6474BB' },
  { href: '/proveedores',                      icon: Truck,           label: 'Proveedores',         color: '#00B4DB' },
  { href: '/conteo-stock',                     icon: ClipboardCheck,  label: 'Conteo de Stock',     color: '#6474BB' },
  { href: '/listas-precios',                   icon: List,            label: 'Listas de Precios',   color: '#22C55E' },
  { href: '/finanzas',                         icon: TrendingUp,      label: 'Finanzas',            color: '#22C55E' },
  { href: '/gastos-recurrentes',               icon: RefreshCw,       label: 'Gastos Recurrentes',  color: '#F39C12' },
  { href: '/tipo-cambio',                      icon: DollarSign,      label: 'Tipo de Cambio',      color: '#22C55E' },
  { href: '/cuentas-corrientes',               icon: CreditCard,      label: 'Cuentas Corrientes',  color: '#F39C12' },
  { href: '/reportes',                         icon: PieChart,        label: 'Reportes',            color: '#6474BB' },
  { href: '/objetivos-ventas',                 icon: Target,          label: 'Objetivos de Ventas', color: '#22C55E' },
  { href: '/promociones',                      icon: Tag,             label: 'Promociones',         color: '#00B4DB' },
  { href: '/fidelidad',                        icon: Star,            label: 'Fidelidad',           color: '#F39C12' },
  { href: '/usuarios',                         icon: UserCog,         label: 'Usuarios',            color: '#EF4444' },
  { href: '/auditoria',                        icon: Shield,          label: 'Auditoría',           color: '#EF4444' },
  { href: '/configuracion/business-locations', icon: MapPin,          label: 'Sucursales',          color: '#00B4DB' },
  { href: '/configuracion/arca',               icon: ShieldCheck,     label: 'ARCA / AFIP',         color: '#22C55E' },
  { href: '/configuracion/empresa',            icon: Building2,       label: 'Empresa',             color: '#F39C12' },
];

const STORAGE_KEY = 'comarpos-sidebar-collapsed';

type NavItem = { href: string; icon: ElementType; label: string; color: string };

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

const SCROLL_KEY = 'comarpos-sidebar-scroll';

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const navRef = useRef<HTMLElement>(null);

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

  const renderItem = ({ href, icon: Icon, label, color }: NavItem) => {
    const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
    return (
      <Link
        key={href}
        href={href}
        onClick={onClose}
        title={collapsed ? label : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: collapsed ? '9px 10px' : '8px 10px',
          borderRadius: 6,
          textDecoration: 'none',
          fontSize: 13,
          fontWeight: 600,
          color: active ? 'var(--text)' : 'var(--text2)',
          background: active ? 'rgba(37,99,235,0.14)' : 'transparent',
          border: `1px solid ${active ? 'rgba(37,99,235,0.25)' : 'transparent'}`,
          transition: 'all 0.12s',
          marginBottom: 1,
          justifyContent: collapsed ? 'center' : 'flex-start',
          position: 'relative',
        }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(37,99,235,0.07)'; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
      >
        {active && !collapsed && (
          <span style={{
            position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
            width: 3, height: 18, background: color, borderRadius: '0 2px 2px 0',
          }} />
        )}

        <Icon size={collapsed ? 17 : 15} style={{ color: active ? color : 'var(--text3)', flexShrink: 0 }} />

        {!collapsed && (
          <>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label}
            </span>
            {active && <ChevronRight size={11} style={{ color: 'var(--text3)', marginLeft: 'auto' }} />}
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10 }}>
          {/* ComarPOS Logo SVG */}
          <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
            <circle cx="18" cy="20" r="14" stroke="#2563EB" strokeWidth="3.5" strokeLinecap="round"
              strokeDasharray="60 88" strokeDashoffset="-10" />
            <rect x="25" y="27" width="9" height="9" rx="2" fill="#22C55E" />
          </svg>

          {!collapsed && (
            <div>
              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--accent2)', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 3 }}>
                SISTEMA ERP
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', lineHeight: 1, letterSpacing: -0.5 }}>
                Comar<span style={{ color: 'var(--accent)' }}>POS</span>
              </div>
            </div>
          )}
        </div>
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
        {!collapsed && (
          <div style={{ fontSize: 9, color: 'var(--text3)', letterSpacing: 2, textTransform: 'uppercase', fontFamily: 'var(--mono)', padding: '8px 10px 4px' }}>
            Principal
          </div>
        )}
        {NAV.map(renderItem)}

        {user?.role === 'ADMIN' && (
          <>
            {!collapsed && (
              <div style={{ fontSize: 9, color: 'var(--text3)', letterSpacing: 2, textTransform: 'uppercase', fontFamily: 'var(--mono)', padding: '14px 10px 4px', marginTop: 4 }}>
                Administración
              </div>
            )}
            {collapsed && <div style={{ height: 10 }} />}
            {ADMIN_NAV.map(renderItem)}
          </>
        )}
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
              border: '1px solid rgba(37,99,235,0.4)',
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
