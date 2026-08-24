'use client';

import { useEffect, useState } from 'react';

// Fade+slide de entrada al montar. Usa `transition` (no `animation`) a
// propósito: así RubroPill puede pisar opacity/transform por JS al salir
// sin pelearse con un fill-mode de keyframes.
export default function LandingFade({
  children, className, style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={className}
      style={{
        ...style,
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(14px)',
        transition: 'opacity 0.45s ease, transform 0.45s ease',
      }}
    >
      {children}
    </div>
  );
}
