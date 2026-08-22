'use client';

import { Search } from 'lucide-react';

interface FilterBarProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Extra controls (selects, date pickers) rendered after the search input; wraps on mobile */
  children?: React.ReactNode;
}

export default function FilterBar({ search, onSearchChange, searchPlaceholder = 'Buscar...', children }: FilterBarProps) {
  return (
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
      {children}
    </div>
  );
}
