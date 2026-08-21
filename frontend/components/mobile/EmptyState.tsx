'use client';

import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title?: string;
  message: React.ReactNode;
  action?: React.ReactNode;
}

export default function EmptyState({ icon: Icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <Icon size={40} />
      {title && <p style={{ fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>{title}</p>}
      <p>{message}</p>
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}
