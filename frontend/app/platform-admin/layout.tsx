import type { Metadata } from 'next';

// Panel de super-admin de la plataforma -- nunca debe indexarse. Mismo
// criterio que app/[tenant]/layout.tsx.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
