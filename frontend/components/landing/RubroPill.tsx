'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const EXIT_MS = 240;

export default function RubroPill({
  href, style, children,
}: {
  href: string;
  style: React.CSSProperties;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (leaving) return;
    setLeaving(true);

    const root = document.querySelector('.landing-root') as HTMLElement | null;
    if (root) {
      root.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
      root.style.opacity = '0';
      root.style.transform = 'translateY(-10px)';
    }

    window.setTimeout(() => router.push(href), EXIT_MS);
  };

  return (
    <a href={href} onClick={handleClick} style={{ ...style, cursor: leaving ? 'default' : 'pointer' }}>
      {children}
    </a>
  );
}
