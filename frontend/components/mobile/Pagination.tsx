'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  totalLabel?: string;
}

export default function Pagination({ page, totalPages, onChange, totalLabel }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 2px' }}>
      {totalLabel && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{totalLabel}</span>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          style={{ padding: 8 }}
        >
          <ChevronLeft size={14} />
        </button>
        <span style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          style={{ padding: 8 }}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
