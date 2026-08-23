'use client';

import { useState } from 'react';
import { Search, SlidersHorizontal, ChevronDown } from 'lucide-react';

interface FilterBarProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Extra controls (selects, date pickers) rendered after the search input; wraps on mobile */
  children?: React.ReactNode;
  /**
   * Si true, `children` arranca oculto detras de un boton "Filtros" en vez
   * de mostrarse siempre -- pensado para paginas con muchos campos de
   * filtro (rango de fechas, estado, tipo, etc, ej. Ventas) que ocupan
   * mucho espacio vertical de entrada. Opt-in (default false) para no
   * esconder de golpe acciones que viven en `children` en otras paginas
   * (ej. el boton "Escanear" en Productos) donde no fue pedido.
   */
  collapsible?: boolean;
}

export default function FilterBar({ search, onSearchChange, searchPlaceholder = 'Buscar...', children, collapsible = false }: FilterBarProps) {
  const [expanded, setExpanded] = useState(!collapsible);

  return (
    <div className="filter-bar-wrap">
      <div className="filter-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {onSearchChange && (
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input
              value={search ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              style={{ paddingLeft: 34 }}
            />
          </div>
        )}
        {collapsible && children && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            style={{ gap: 6 }}
          >
            <SlidersHorizontal size={13} />
            Filtros
            <ChevronDown size={13} style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s ease' }} />
          </button>
        )}
        {!collapsible && children}
      </div>
      {collapsible && expanded && children && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}
