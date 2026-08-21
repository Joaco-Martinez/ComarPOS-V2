'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import EmptyState from './EmptyState';

export interface ResponsiveTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** e.g. { textAlign: 'right' } applied to both <th> and <td> */
  style?: React.CSSProperties;
}

interface ResponsiveTableProps<T> {
  columns: ResponsiveTableColumn<T>[];
  data: T[];
  keyFor: (row: T) => string | number;
  /** Full custom markup for one mobile card (conventionally: .mobile-card-head + .mobile-card-row's) */
  renderMobileCard: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  emptyIcon?: LucideIcon;
  emptyMessage?: string;
}

export default function ResponsiveTable<T>({
  columns, data, keyFor, renderMobileCard, onRowClick, emptyIcon, emptyMessage = 'No hay datos para mostrar.',
}: ResponsiveTableProps<T>) {
  if (data.length === 0) {
    return emptyIcon ? <EmptyState icon={emptyIcon} message={emptyMessage} /> : <div className="empty-state"><p>{emptyMessage}</p></div>;
  }

  return (
    <>
      <div className="table-wrap desktop-only-table">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={c.style}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={keyFor(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} style={c.style}>{c.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-card-list">
        {data.map((row) => (
          <div
            key={keyFor(row)}
            className="mobile-card"
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            style={onRowClick ? { cursor: 'pointer' } : undefined}
          >
            {renderMobileCard(row)}
          </div>
        ))}
      </div>
    </>
  );
}
