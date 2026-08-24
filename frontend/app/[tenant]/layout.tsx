import type { Metadata } from 'next';

// La app logueada no debe indexarse -- robots.txt ya la excluye (ver
// app/robots.ts), pero eso solo evita el rastreo; una URL igual puede
// terminar indexada si alguien la linkea desde afuera. El meta noindex de
// este layout es la señal que realmente lo garantiza para cualquier ruta
// bajo /[tenant]/* (pos, ventas, stock, etc, un slug arbitrario por tenant).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return children;
}
