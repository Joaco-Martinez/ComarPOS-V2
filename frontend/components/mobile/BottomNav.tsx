'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { usePlanFeaturesStore, isModuleAllowed } from '@/store/planFeatures';
import { NAV, ADMIN_NAV, type NavItem } from '@/lib/navConfig';
import { buildEffectiveNav, effectiveNavToConfig } from '@/lib/quickAccess';
import { Grid2x2, LogOut, X, ChevronDown, Pencil, Lock } from 'lucide-react';
import QuickAccessEditor from './QuickAccessEditor';

const OPEN_SECTIONS_KEY = 'comarpos-more-sheet-open-sections';

// Que secciones (carpetas propias o grupos automaticos) quedaron abiertas
// es una preferencia de USO, no de cuenta -- se guarda en el dispositivo
// (localStorage), no en el perfil del usuario, asi que sobrevive a cerrar
// la app pero no viaja entre dispositivos. Antes esto era un solo
// `useState` en memoria: se reseteaba cada vez que se cerraba el sheet y
// solo permitia una seccion abierta a la vez.
function readOpenSections(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(OPEN_SECTIONS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export default function BottomNav() {
  const pathname = usePathname();
  const params = useParams<{ tenant?: string }>();
  const { user, logout, updateQuickAccessConfig } = useAuthStore();
  const { features } = usePlanFeaturesStore();
  const tenantSlug = params?.tenant || user?.tenantSlug || '';
  const [moreOpen, setMoreOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(readOpenSections);

  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify([...next]));
      } catch {
        /* localStorage puede fallar (modo privado, cuota) - es solo una preferencia visual */
      }
      return next;
    });
  };

  const allItems = [...NAV, ...(user?.role === 'ADMIN' ? ADMIN_NAV : [])];
  const effective = buildEffectiveNav(allItems, user?.quickAccessConfig);
  const tabs = effective.tabs;
  const restItems = effective.loose;

  // Antes esto se listaba plano: ~25 secciones sueltas, sin ningun orden
  // visible mas que "como quedaron" -- costaba encontrar algo puntual.
  // Se agrupa por tema (ver el campo "group" en navConfig.ts) en el orden
  // pedido explicitamente, no alfabetico ni el de aparicion en navConfig.
  const GROUP_ORDER = ['Ventas', 'Productos y stock', 'Facturación', 'Clientes', 'Administración', 'Compras', 'Finanzas', 'Ayuda'];
  const restGroups = restItems
    .reduce<[string, NavItem[]][]>((groups, item) => {
      const existing = groups.find(([name]) => name === item.group);
      if (existing) existing[1].push(item);
      else groups.push([item.group, [item]]);
      return groups;
    }, [])
    .sort(([a], [b]) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b));

  const isActive = (href: string) => {
    const full = `/${tenantSlug}${href}`;
    return pathname === full || (href !== '/dashboard' && pathname.startsWith(full));
  };

  const midIndex = Math.ceil(tabs.length / 2);
  const left = tabs.slice(0, midIndex);
  const right = tabs.slice(midIndex);

  const renderTab = ({ href, icon: Icon, label, moduleKey }: NavItem) => {
    const active = isActive(href);
    const locked = !isModuleAllowed(features, moduleKey);
    const shortLabel = label.split(' — ')[0].split(' / ')[0];
    return (
      <Link
        key={href}
        href={`/${tenantSlug}${href}`}
        className={`bottom-nav-item${active ? ' active' : ''}`}
        style={locked ? { opacity: 0.55, position: 'relative' } : undefined}
      >
        <Icon size={19} />
        {locked && <Lock size={9} style={{ position: 'absolute', top: 2, right: '30%', color: 'var(--text3)' }} />}
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

      {/* Siempre montado (no `{moreOpen && ...}`) para poder animar el
          cierre -- con montaje condicional el sheet desaparecia de un
          corte seco al tocar afuera o elegir una seccion, sin transicion
          de salida (ver .more-sheet-overlay/.more-sheet en globals.css). */}
      <div
        className={`more-sheet-overlay${moreOpen ? ' open' : ''}`}
        onClick={() => { setMoreOpen(false); setEditing(false); }}
        aria-hidden={!moreOpen}
      >
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
                  const isOpen = openSections.has(folder.id);
                  return (
                    <div key={folder.id} className="more-sheet-folder">
                      <button
                        type="button"
                        className="more-sheet-folder-header"
                        onClick={() => toggleSection(folder.id)}
                        style={{ color: folder.color }}
                      >
                        <span>{folder.name}</span>
                        <ChevronDown size={15} style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
                      </button>
                      {isOpen && (
                        <div className="more-sheet-grid" style={{ marginTop: 6 }}>
                          {folder.items.map(({ href, icon: Icon, label, color, moduleKey }) => {
                            const locked = !isModuleAllowed(features, moduleKey);
                            return (
                              <Link
                                key={href}
                                href={`/${tenantSlug}${href}`}
                                className="more-sheet-item"
                                onClick={() => setMoreOpen(false)}
                                style={locked ? { opacity: 0.55 } : undefined}
                              >
                                <span className="more-sheet-icon" style={{ background: `${color}1F`, color, position: 'relative' }}>
                                  <Icon size={18} />
                                  {locked && <Lock size={10} style={{ position: 'absolute', bottom: -2, right: -2, color: 'var(--text3)', background: 'var(--surface)', borderRadius: '50%', padding: 1 }} />}
                                </span>
                                {label}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {restGroups.map(([groupName, groupItems]) => {
                  // Mismo set persistido (openSections) que las carpetas de
                  // arriba, con prefijo para no chocar con un id de carpeta
                  // real: asi el usuario puede achicar/expandir estos grupos
                  // automaticos tocando el titulo, y la app se acuerda cuales
                  // dejo abiertos la proxima vez que entra (ver
                  // OPEN_SECTIONS_KEY mas arriba).
                  const groupKey = `group:${groupName}`;
                  const isOpen = openSections.has(groupKey);
                  return (
                    <div key={groupKey} className="more-sheet-folder">
                      <button
                        type="button"
                        className="more-sheet-folder-header"
                        onClick={() => toggleSection(groupKey)}
                      >
                        <span>{groupName}</span>
                        <ChevronDown size={15} style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
                      </button>
                      {isOpen && (
                        <div className="more-sheet-grid" style={{ marginTop: 6 }}>
                          {groupItems.map(({ href, icon: Icon, label, color, moduleKey }) => {
                            const locked = !isModuleAllowed(features, moduleKey);
                            return (
                              <Link
                                key={href}
                                href={`/${tenantSlug}${href}`}
                                className="more-sheet-item"
                                onClick={() => setMoreOpen(false)}
                                style={locked ? { opacity: 0.55 } : undefined}
                              >
                                <span className="more-sheet-icon" style={{ background: `${color}1F`, color, position: 'relative' }}>
                                  <Icon size={18} />
                                  {locked && <Lock size={10} style={{ position: 'absolute', bottom: -2, right: -2, color: 'var(--text3)', background: 'var(--surface)', borderRadius: '50%', padding: 1 }} />}
                                </span>
                                {label}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
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
      </>
  );
}
