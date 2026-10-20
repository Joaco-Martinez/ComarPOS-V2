'use client';

import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { VariantOption } from '@/types';
import { MAX_VARIANT_OPTIONS, MAX_VARIANT_COMBINATIONS, VARIANT_OPTION_SUGGESTIONS, combinationsCount } from '@/lib/variants';

interface Props {
  options: VariantOption[];
  onChange: (options: VariantOption[]) => void;
}

// Editor de opciones de variantes: nombre (Talle, Color...) + valores como
// chips (Enter o coma agrega). Las combinaciones se arman a partir de esto.
export default function VariantOptionsEditor({ options, onChange }: Props) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const update = (index: number, patch: Partial<VariantOption>) =>
    onChange(options.map((o, i) => (i === index ? { ...o, ...patch } : o)));

  const addValues = (index: number, raw: string) => {
    const incoming = raw.split(',').map((v) => v.trim()).filter(Boolean);
    if (incoming.length === 0) return;
    const current = options[index].values;
    const next = [...current];
    for (const v of incoming) {
      if (!next.some((x) => x.toLowerCase() === v.toLowerCase())) next.push(v);
    }
    update(index, { values: next });
    setDrafts((d) => ({ ...d, [index]: '' }));
  };

  const removeOption = (index: number) => {
    onChange(options.filter((_, i) => i !== index));
    setDrafts({});
  };

  const total = combinationsCount(options);
  const usedNames = new Set(options.map((o) => o.name.toLowerCase()));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <datalist id="variant-option-names">
        {VARIANT_OPTION_SUGGESTIONS.filter((s) => !usedNames.has(s.toLowerCase())).map((s) => <option key={s} value={s} />)}
      </datalist>

      {options.map((option, index) => (
        <div key={index} style={{ padding: 10, background: 'var(--surface2)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={option.name}
              list="variant-option-names"
              onChange={(e) => update(index, { name: e.target.value })}
              placeholder="Opción (ej. Talle, Color)"
              style={{ flex: 1, fontWeight: 600 }}
            />
            <button type="button" onClick={() => removeOption(index)} className="btn btn-ghost btn-xs" title="Quitar opción" style={{ color: 'var(--danger)' }}>
              <Trash2 size={13} />
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {option.values.map((value) => (
              <span key={value} className="badge badge-gray" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '3px 6px 3px 8px' }}>
                {value}
                <button
                  type="button"
                  onClick={() => update(index, { values: option.values.filter((v) => v !== value) })}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', display: 'flex' }}
                  title={`Quitar ${value}`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            <input
              value={drafts[index] ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v.includes(',')) addValues(index, v);
                else setDrafts((d) => ({ ...d, [index]: v }));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); addValues(index, drafts[index] ?? ''); }
              }}
              onBlur={() => addValues(index, drafts[index] ?? '')}
              placeholder={option.values.length ? 'Agregar valor…' : 'Valores: S, M, L (Enter o coma)'}
              style={{ flex: 1, minWidth: 140, fontSize: 12 }}
            />
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {options.length < MAX_VARIANT_OPTIONS && (
          <button
            type="button"
            onClick={() => onChange([...options, { name: options.length === 0 ? 'Talle' : options.length === 1 ? 'Color' : '', values: [] }])}
            className="btn btn-secondary btn-xs"
            style={{ gap: 4 }}
          >
            <Plus size={12} /> Agregar opción
          </button>
        )}
        {total > 0 && (
          <span style={{ fontSize: 11, color: total > MAX_VARIANT_COMBINATIONS ? 'var(--danger)' : 'var(--text3)' }}>
            {total} combinacion{total === 1 ? '' : 'es'}
            {total > MAX_VARIANT_COMBINATIONS ? ` (máximo ${MAX_VARIANT_COMBINATIONS})` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
