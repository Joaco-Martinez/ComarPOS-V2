'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { CHANGELOG, formatChangelogDate } from '@/lib/changelog';

// Historial de versiones (lib/changelog.ts). La versión más nueva arranca
// abierta; el resto se despliega con un click.
export default function VersionHistory({ initialOpen = 1 }: { initialOpen?: number }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(CHANGELOG.slice(0, initialOpen).map((e) => e.version)));

  const toggle = (version: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(version) ? next.delete(version) : next.add(version);
      return next;
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {CHANGELOG.map((entry, idx) => {
        const isOpen = open.has(entry.version);
        return (
          <div key={entry.version} style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)' }}>
            <button
              onClick={() => toggle(entry.version)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
              }}
            >
              {isOpen ? <ChevronDown size={15} style={{ color: 'var(--text3)', flexShrink: 0 }} /> : <ChevronRight size={15} style={{ color: 'var(--text3)', flexShrink: 0 }} />}
              <span className={`badge ${idx === 0 ? 'badge-blue' : 'badge-gray'}`} style={{ flexShrink: 0 }}>v{entry.version}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{entry.title}</span>
              <span style={{ fontSize: 11.5, color: 'var(--text3)', fontFamily: 'var(--mono)', flexShrink: 0 }}>{formatChangelogDate(entry.date)}</span>
            </button>
            {isOpen && (
              <div style={{ padding: '0 16px 14px 40px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {entry.sections.map((section) => (
                  <div key={section.title}>
                    <div style={{ fontSize: 10.5, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>{section.title}</div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text2)', lineHeight: 1.65 }}>
                      {section.items.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
