'use client';

import { ChevronDown } from 'lucide-react';
import type { HelpEntry as HelpEntryType } from '@/lib/helpContent';

// Compartido entre HelpCenter.tsx (modal de FAQ rápida) y app/[tenant]/ayuda
// (página completa con contacto) -- antes vivía solo dentro de HelpCenter.
export function AnswerBlocks({ text }: { text: string }) {
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

export function EntryRow({ entry, categoryLabel, open, onToggle }: {
  entry: HelpEntryType; categoryLabel?: string; open: boolean; onToggle: () => void;
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
