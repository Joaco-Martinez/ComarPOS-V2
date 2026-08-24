'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { NAV, ADMIN_NAV, type NavItem } from '@/lib/navConfig';
import { buildEffectiveNav, effectiveNavToConfig } from '@/lib/quickAccess';
import { Grid2x2, LogOut, X, ChevronDown, Pencil } from 'lucide-react';
import QuickAccessEditor from './QuickAccessEditor';

export default function BottomNav() {
  const pathname = usePathname();
  const params = useParams<{ tenant?: string }>();
  const { user, logout, updateQuickAccessConfig } = useAuthStore();
  const tenantSlug = params?.tenant || user?.tenantSlug || '';
  const [moreOpen, setMoreOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);

  const allItems = [...NAV, ...(user?.role === 'ADMIN' ? ADMIN_NAV : [])];
  const effective = buildEffectiveNav(allItems, user?.quickAccessConfig);
  const tabs = effective.tabs;
  const restItems = effective.loose;

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
        <div className="more-sheet-overlay" onClick={() => { setMoreOpen(false); setEditing(false); }}>
          <div className="more-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="more-sheet-handle" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 4px' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
                {editing ? 'Editar accesos rápidos' : 'Todas las secciones'}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                {!editing && (
                  <button type="button" onClick={() => setEditing(true)} className="btn btn-ghost btn-sm" style={{ padding: 6 }} aria-label="Editar">
                    <Pencil size={16} />
                  </button>
                )}
                <button type="button" onClick={() => { setMoreOpen(false); setEditing(false); }} className="btn btn-ghost btn-sm" style={{ padding: 6 }}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {editing ? (
              <QuickAccessEditor
                allItems={allItems}
                initial={user?.quickAccessConfig ?? effectiveNavToConfig(effective)}
                onCancel={() => setEditing(false)}
                onSave={(config) => {
                  updateQuickAccessConfig(config);
                  setEditing(false);
                }}
              />
            ) : (
              <>
                {effective.folders.map((folder) => {
                  const isOpen = openFolderId === folder.id;
                  return (
                    <div key={folder.id} className="more-sheet-folder">
                      <button
                        type="button"
                        className="more-sheet-folder-header"
                        onClick={() => setOpenFolderId(isOpen ? null : folder.id)}
                        style={{ color: folder.color }}
                      >
                        <span>{folder.name}</span>
                        <ChevronDown size={15} style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
                      </button>
                      {isOpen && (
                        <div className="more-sheet-grid" style={{ marginTop: 6 }}>
                          {folder.items.map(({ href, icon: Icon, label, color }) => (
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
                      )}
                    </div>
                  );
                })}

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
                <button
                  type="button"
                  onClick={() => logout()}
                  className="btn btn-ghost btn-sm"
                  style={{ width: '100%', justifyContent: 'flex-start', gap: 7, color: 'var(--danger)', marginTop: 14 }}
                >
                  <LogOut size={14} />
                  Cerrar sesión
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
