'use client';

import { useMemo, useState } from 'react';
import { MessageCircle, Mail, Printer, Search } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { HELP_CATEGORIES, normalizeForSearch } from '@/lib/helpContent';
import { EntryRow } from '@/components/help/HelpEntry';
import { waLink, CONTACT_EMAIL } from '@/components/landing/siteConfig';

export default function AyudaPage() {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(HELP_CATEGORIES[0].id);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleEntry = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const normQuery = normalizeForSearch(query.trim());
  const searching = normQuery.length > 0;

  const searchResults = useMemo(() => {
    if (!searching) return [];
    return HELP_CATEGORIES.flatMap((cat) =>
      cat.entries
        .filter((e) => normalizeForSearch(`${e.q} ${e.a} ${e.keywords ?? ''}`).includes(normQuery))
        .map((e) => ({ entry: e, categoryId: cat.id, categoryLabel: cat.label }))
    );
  }, [normQuery, searching]);

  const activeCategoryData = HELP_CATEGORIES.find((c) => c.id === activeCategory) ?? HELP_CATEGORIES[0];

  return (
    <AppLayout title="Ayuda y contacto" subtitle="Preguntas frecuentes y cómo comunicarte con nosotros">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 22 }}>
        <a
          href={waLink('¡Hola! Necesito ayuda con ComarPOS.')}
          target="_blank" rel="noopener noreferrer"
          className="card"
          style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(24,193,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MessageCircle size={19} style={{ color: 'var(--success)' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>WhatsApp</div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>Respuesta más rápida</div>
          </div>
        </a>

        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="card"
          style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Mail size={19} style={{ color: 'var(--accent)' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>{CONTACT_EMAIL}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>Para consultas menos urgentes</div>
          </div>
        </a>

        <a
          href={waLink('¡Hola! Quiero pedir una PrintBox para imprimir tickets.')}
          target="_blank" rel="noopener noreferrer"
          className="card"
          style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(100,116,187,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Printer size={19} style={{ color: '#6474BB' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>Pedir una PrintBox</div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>Para imprimir tickets sin cables</div>
          </div>
        </a>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 12 }}>Preguntas frecuentes</div>

        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar una pregunta (ej: factura, stock, sucursal, printbox...)"
            style={{ paddingLeft: 34 }}
          />
        </div>

        {!searching && (
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12 }}>
            {HELP_CATEGORIES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveCategory(id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                  borderRadius: 999, padding: '7px 13px', fontSize: 12, fontWeight: 700,
                  border: `1px solid ${id === activeCategory ? 'var(--accent)' : 'var(--border)'}`,
                  background: id === activeCategory ? 'var(--accent-dim)' : 'var(--surface)',
                  color: id === activeCategory ? 'var(--accent)' : 'var(--text2)',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {searching ? (
            searchResults.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 12px', fontSize: 13, color: 'var(--text3)' }}>
                No encontramos nada para "{query}". Probá con otra palabra, o escribinos directamente.
              </div>
            ) : (
              searchResults.map(({ entry, categoryId, categoryLabel }) => {
                const key = `${categoryId}::${entry.q}`;
                return (
                  <EntryRow
                    key={key}
                    entry={entry}
                    categoryLabel={categoryLabel}
                    open={expanded.has(key)}
                    onToggle={() => toggleEntry(key)}
                  />
                );
              })
            )
          ) : (
            activeCategoryData.entries.map((entry) => {
              const key = `${activeCategoryData.id}::${entry.q}`;
              return (
                <EntryRow
                  key={key}
                  entry={entry}
                  open={expanded.has(key)}
                  onToggle={() => toggleEntry(key)}
                />
              );
            })
          )}
        </div>
      </div>
    </AppLayout>
  );
}
