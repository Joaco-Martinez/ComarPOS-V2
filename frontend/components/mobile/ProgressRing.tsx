'use client';

interface ProgressRingProps {
  /** 0-100 */
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: React.ReactNode;
}

export default function ProgressRing({ value, size = 64, strokeWidth = 7, color = 'var(--accent)', label }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const center = size / 2;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} className="progress-ring">
        <circle className="progress-ring-track" cx={center} cy={center} r={radius} strokeWidth={strokeWidth} />
        <circle
          className="progress-ring-value"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size <= 48 ? 10 : 13, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--mono)',
        }}
      >
        {label ?? `${Math.round(clamped)}%`}
      </div>
    </div>
  );
}
