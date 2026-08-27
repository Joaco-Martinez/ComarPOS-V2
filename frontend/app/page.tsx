import type { Metadata } from 'next';
import LandingPage from '@/components/landing/LandingPage';
import { PLANS } from '@/components/landing/plans';

// El middleware (middleware.ts) ya filtró por host antes de llegar acá: solo
// los dominios de marketing (comarpos.com, www.comarpos.com, etc.) resuelven
// esta ruta -- cualquier otro host fue redirigido a /login sin pasar por
// esta page. Eso permite que sea estática (sin headers()/dynamic APIs).
const title = 'ComarPOS — Sistema de gestión para comercios';
const description = 'Punto de venta, facturación electrónica AFIP, stock, caja y reportes en un solo sistema. Para cualquier rubro: kioscos, veterinarias, ferreterías y más.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/' },
  openGraph: { title, description, url: 'https://www.comarpos.com' },
  twitter: { title, description },
};

const SOFTWARE_APP_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'ComarPOS',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web, Android, iOS',
  description: 'Punto de venta, facturación electrónica AFIP, stock, caja y reportes en un solo sistema.',
  offers: PLANS.map((plan) => ({
    '@type': 'Offer',
    name: `Plan ${plan.name}`,
    price: plan.priceArs,
    priceCurrency: 'ARS',
    url: 'https://www.comarpos.com/prueba-gratis',
  })),
};

export default function RootPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_APP_JSON_LD) }} />
      <LandingPage />
    </>
  );
}
