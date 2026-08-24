import type { NavItem } from './navConfig';
import { BOTTOM_NAV_HREFS } from './navConfig';
import type { QuickAccessConfig, QuickAccessFolder } from '@/types';

export type EffectiveFolder = {
  id: string;
  name: string;
  color: string;
  items: NavItem[];
};

export type EffectiveNav = {
  tabs: NavItem[];
  folders: EffectiveFolder[];
  loose: NavItem[];
};

/**
 * Arma el layout mobile a partir de los items disponibles (ya filtrados
 * por rol) y la config personal del usuario. Sin config (null/undefined)
 * reproduce exacto el comportamiento default de antes de esta feature:
 * BOTTOM_NAV_HREFS como tabs, el resto suelto en el orden de navConfig.ts.
 * hrefs guardados que ya no existen en allItems (feature removida) se
 * descartan silenciosamente; items nuevos de allItems que el usuario nunca
 * vio (no estan en pinned/folders/loose) se agregan al final de "loose".
 */
export function buildEffectiveNav(
  allItems: NavItem[],
  config: QuickAccessConfig | null | undefined
): EffectiveNav {
  const byHref = new Map(allItems.map((item) => [item.href, item]));

  if (!config) {
    const tabs = BOTTOM_NAV_HREFS.map((href) => byHref.get(href)).filter(Boolean) as NavItem[];
    const loose = allItems.filter((item) => !(BOTTOM_NAV_HREFS as readonly string[]).includes(item.href));
    return { tabs, folders: [], loose };
  }

  const tabs = (config.pinned || []).map((href) => byHref.get(href)).filter(Boolean) as NavItem[];

  const folders: EffectiveFolder[] = (config.folders || []).map((folder: QuickAccessFolder) => ({
    id: folder.id,
    name: folder.name,
    color: folder.color,
    items: (folder.items || []).map((href) => byHref.get(href)).filter(Boolean) as NavItem[],
  }));

  const placed = new Set<string>([
    ...tabs.map((item) => item.href),
    ...folders.flatMap((folder) => folder.items.map((item) => item.href)),
  ]);

  const savedLoose = (config.loose || []).map((href) => byHref.get(href)).filter(Boolean) as NavItem[];
  const savedLooseHrefs = new Set(savedLoose.map((item) => item.href));

  const notYetSeen = allItems.filter((item) => !placed.has(item.href) && !savedLooseHrefs.has(item.href));

  const loose = [...savedLoose.filter((item) => !placed.has(item.href)), ...notYetSeen];

  return { tabs, folders, loose };
}

/** Config explicita equivalente al layout default, para arrancar el modo
 * edicion desde el estado visual actual cuando el usuario todavia no
 * guardo ninguna personalizacion. */
export function effectiveNavToConfig(effective: EffectiveNav): QuickAccessConfig {
  return {
    pinned: effective.tabs.map((item) => item.href),
    folders: effective.folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      color: folder.color,
      items: folder.items.map((item) => item.href),
    })),
    loose: effective.loose.map((item) => item.href),
  };
}

function storageKey(userId: string) {
  return `comarpos-quick-access-${userId}`;
}

export function readCachedQuickAccessConfig(userId: string): QuickAccessConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as QuickAccessConfig) : null;
  } catch {
    return null;
  }
}

export function writeCachedQuickAccessConfig(userId: string, config: QuickAccessConfig | null) {
  if (typeof window === 'undefined') return;
  try {
    if (config) {
      localStorage.setItem(storageKey(userId), JSON.stringify(config));
    } else {
      localStorage.removeItem(storageKey(userId));
    }
  } catch {
    // localStorage puede fallar (modo privado, cuota) - es solo cache, no critico
  }
}
