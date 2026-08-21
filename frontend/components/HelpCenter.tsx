'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X, Search, ChevronDown } from 'lucide-react';
import { HELP_CATEGORIES, normalizeForSearch, type HelpEntry } from '@/lib/helpContent';

function AnswerBlocks({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: string) => {
    if (!list.length) return;
    blocks.push(
      <ul key={key} style={{ margin: '6px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {list.map((li, i) => (
          <li key={i} style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{li.replace(/^- /, '')}</li>
        ))}
      </ul>
    );
    list = [];
  };

  lines.forEach((line, i) => {
    if (line.startsWith('- ')) {
      list.push(line);
    } else {
      flushList(`ul-${i}`);
      if (line.trim()) {
        blocks.push(
          <p key={`p-${i}`} style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, margin: blocks.length ? '8px 0 0' : 0 }}>
            {line}
          </p>
        );
      }
    }
  });
  flushList('ul-end');

  return <>{blocks}</>;
}

function EntryRow({ entry, categoryLabel, open, onToggle }: {
  entry: HelpEntry; categoryLabel?: string; open: boolean; onToggle: () => void;
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
          padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {categoryLabel && (
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: 0.5, marginBottom: 3, fontFamily: 'var(--mono)' }}>
              {categoryLabel.toUpperCase()}
            </div>
          )}
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{entry.q}</div>
        </div>
        <ChevronDown size={15} style={{ color: 'var(--text3)', flexShrink: 0, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div style={{ padding: '0 14px 14px' }}>
          <AnswerBlocks text={entry.a} />
        </div>
      )}
    </div>
  );
}

export default function HelpCenter() {
  const [open, setOpen] = useState(false);
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

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn btn-ghost btn-sm"
        title="Centro de ayuda"
        style={{ padding: 7 }}
      >
        <HelpCircle size={15} style={{ color: 'var(--text3)' }} />
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div className="modal-overlay" onClick={close}>
          <div className="modal modal-xl" style={{ display: 'flex', flexDirection: 'column', maxHeight: '85vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Centro de ayuda</span>
                <p style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>
                  Respuestas ya armadas sobre cómo funciona ComarPOS — sin chatbot, sin IA.
                </p>
              </div>
              <button onClick={close} className="btn btn-ghost btn-sm" style={{ padding: 6 }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '14px 22px 0' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar una pregunta (ej: factura, stock, sucursal, printbox...)"
                  autoFocus
                  style={{ paddingLeft: 34 }}
                />
              </div>

              {!searching && (
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 0 4px' }}>
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
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 22px 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {searching ? (
                searchResults.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 12px', fontSize: 13, color: 'var(--text3)' }}>
                    No encontramos nada para "{query}". Probá con otra palabra (ej: "factura", "stock", "caja").
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>
                      {searchResults.length} resultado{searchResults.length === 1 ? '' : 's'} en todas las secciones
                    </div>
                    {searchResults.map(({ entry, categoryId, categoryLabel }) => {
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
                    })}
                  </>
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

            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>
                ¿No encontraste lo que buscabas? Consultá con quien administra tu cuenta ComarPOS.
              </span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
