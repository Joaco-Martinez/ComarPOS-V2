'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  /** Texto para "sin selección" -- tambien aparece como primera opción de la lista, para volver a "todas". */
  placeholder: string;
  style?: React.CSSProperties;
}

/**
 * Select con buscador -- pensado para listas de categorías largas donde
 * scrollear un <select> nativo opción por opción es mas lento que escribir
 * las primeras letras. Filtra client-side (la lista de opciones ya viene
 * cargada entera, no hace falta pedirle nada al backend).
 */
export default function SearchableSelect({ value, onChange, options, placeholder, style }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()));

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
        <input
          ref={inputRef}
          value={open ? query : (selected?.label ?? '')}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { setOpen(true); setQuery(''); }}
          placeholder={placeholder}
          style={{ paddingLeft: 30, paddingRight: 28, fontSize: 13, width: '100%' }}
        />
        {value ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); pick(''); }}
            title="Quitar filtro"
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}
          >
            <X size={13} />
          </button>
        ) : (
          <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
        )}
      </div>

      {open && (
        <div
          className="card"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 40,
            maxHeight: 240, overflowY: 'auto', padding: 4,
            boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
          }}
        >
          <button
            type="button"
            onClick={() => pick('')}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', fontSize: 13,
              background: !value ? 'var(--surface2)' : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer',
              color: !value ? 'var(--accent)' : 'var(--text)', fontWeight: !value ? 700 : 400,
            }}
          >
            {placeholder}
          </button>
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 10px', fontSize: 12, color: 'var(--text3)' }}>Sin resultados</div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => pick(o.value)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', fontSize: 13,
                  background: value === o.value ? 'var(--surface2)' : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer',
                  color: value === o.value ? 'var(--accent)' : 'var(--text)', fontWeight: value === o.value ? 700 : 400,
                }}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
