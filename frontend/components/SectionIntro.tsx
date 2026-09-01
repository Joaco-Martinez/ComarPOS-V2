'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Lightbulb, X } from 'lucide-react';
import { navItemForPath } from '@/lib/navConfig';

function storageKey(tenantSlug: string) {
  return `comarpos-seen-intros-${tenantSlug}`;
}

function readSeen(tenantSlug: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(tenantSlug));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function markSeen(tenantSlug: string, href: string) {
  try {
    const seen = readSeen(tenantSlug);
    seen.add(href);
    localStorage.setItem(storageKey(tenantSlug), JSON.stringify([...seen]));
  } catch {
    // localStorage no disponible (privado/bloqueado) - no rompe la pantalla.
  }
}

/**
 * Banner que explica que es una seccion, se muestra UNA sola vez la primera
 * vez que un usuario entra ahi (por navegador, ver lib/navConfig.ts#NavItem
 * .intro para el texto de cada pantalla) - pensado para que un negocio
 * nuevo entienda que hace cada parte del sistema sin tener que abrir el
 * Centro de ayuda a buscarlo. Se monta desde AppLayout, no pantalla por
 * pantalla, para no tener que tocar las ~40 paginas de negocio.
 */
export default function SectionIntro({ afterTenantPath }: { afterTenantPath: string }) {
  const { tenant } = useParams<{ tenant: string }>();
  const [visible, setVisible] = useState(false);

  const item = navItemForPath(afterTenantPath);

  useEffect(() => {
    setVisible(false);
    if (!item?.intro || !tenant) return;
    if (!readSeen(tenant).has(item.href)) setVisible(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.href, tenant]);

  if (!item?.intro || !visible) return null;

  const dismiss = () => {
    if (tenant) markSeen(tenant, item.href);
    setVisible(false);
  };

  return (
    <div
      className="card"
      style={{
        display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px',
        marginBottom: 16, background: 'var(--accent-dim)', border: '1px solid var(--accent)',
      }}
    >
      <Lightbulb size={17} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 3 }}>
          {item.label}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, margin: 0 }}>
          {item.intro}
        </p>
      </div>
      <button
        onClick={dismiss}
        className="btn btn-ghost btn-xs"
        aria-label="Entendido, no volver a mostrar"
        title="Entendido"
        style={{ flexShrink: 0, padding: 6, gap: 4 }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
