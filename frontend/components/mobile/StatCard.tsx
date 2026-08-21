'use client';

import type { LucideIcon } from 'lucide-react';
import ProgressRing from './ProgressRing';

interface StatCardProps {
  icon?: LucideIcon;
  color?: string;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** delta text, e.g. "+12%" — colored green/red automatically unless deltaColor is passed */
  delta?: string;
  deltaPositive?: boolean;
  /** 0-100, renders a ProgressRing instead of the icon chip */
  progress?: number;
}

export default function StatCard({ icon: Icon, color = 'var(--accent)', label, value, sub, delta, deltaPositive, progress }: StatCardProps) {
  return (
    <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      {typeof progress === 'number' ? (
        <ProgressRing value={progress} color={color} />
      ) : Icon ? (
        <div
          style={{
            width: 42, height: 42, borderRadius: 14, flexShrink: 0,
            background: `${color}1F`, color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon size={20} />
        </div>
      ) : null}

      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="stat-label">{label}</div>
        <div className="stat-value" style={{ fontSize: 20, marginTop: 2 }}>{value}</div>
        {(sub || delta) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            {delta && (
              <span className="stat-delta" style={{ color: deltaPositive ? 'var(--success)' : 'var(--danger)' }}>
                {delta}
              </span>
            )}
            {sub && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{sub}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
