'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { NAV, ADMIN_NAV, BOTTOM_NAV_HREFS, type NavItem } from '@/lib/navConfig';
import { Grid2x2, X } from 'lucide-react';

export default function BottomNav() {
  const pathname = usePathname();
  const params = useParams<{ tenant?: string }>();
  const { user } = useAuthStore();
  const tenantSlug = params?.tenant || user?.tenantSlug || '';
  const [moreOpen, setMoreOpen] = useState(false);

  const allItems = [...NAV, ...(user?.role === 'ADMIN' ? ADMIN_NAV : [])];
  const byHref = Object.fromEntries(allItems.map((i) => [i.href, i]));
  const tabs = BOTTOM_NAV_HREFS.map((href) => byHref[href]).filter(Boolean) as NavItem[];
  const restItems = allItems.filter((i) => !(BOTTOM_NAV_HREFS as readonly string[]).includes(i.href));

  const isActive = (href: string) => {
    const full = `/${tenantSlug}${href}`;
    return pathname === full || (href !== '/dashboard' && pathname.startsWith(full));
  };

  const midIndex = Math.ceil(tabs.length / 2);
  const left = tabs.slice(0, midIndex);
  const right = tabs.slice(midIndex);

  const renderTab = ({ href, icon: Icon, label }: NavItem) => {
    const active = isActive(href);
    const shortLabel = label.split(' — ')[0].split(' / ')[0];
    return (
      <Link key={href} href={`/${tenantSlug}${href}`} className={`bottom-nav-item${active ? ' active' : ''}`}>
        <Icon size={19} />
        <span>{shortLabel}</span>
      </Link>
    );
  };

  return (
    <>
      <nav className="bottom-nav">
        {left.map(renderTab)}

        <button
          type="button"
          className="bottom-nav-fab"
          onClick={() => setMoreOpen(true)}
          aria-label="Más opciones"
        >
          <Grid2x2 size={22} />
        </button>

        {right.map(renderTab)}
      </nav>

      {moreOpen && (
        <div className="more-sheet-overlay" onClick={() => setMoreOpen(false)}>
          <div className="more-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="more-sheet-handle" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 4px' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Todas las secciones</span>
              <button type="button" onClick={() => setMoreOpen(false)} className="btn btn-ghost btn-sm" style={{ padding: 6 }}>
                <X size={16} />
              </button>
            </div>
            <div className="more-sheet-grid">
              {restItems.map(({ href, icon: Icon, label, color }) => (
                <Link
                  key={href}
                  href={`/${tenantSlug}${href}`}
                  className="more-sheet-item"
                  onClick={() => setMoreOpen(false)}
                >
                  <span className="more-sheet-icon" style={{ background: `${color}1F`, color }}>
                    <Icon size={18} />
                  </span>
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
