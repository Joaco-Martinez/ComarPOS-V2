import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import LandingPage from '@/components/landing/LandingPage';
import { PLANS } from '@/components/landing/plans';

// Dominio(s) donde se sirve la landing de ventas en vez del sistema. Cualquier
// otro host (subdominios de tenant, ej. grupovj.comarpos.com.ar) sigue
// entrando directo a la app.
const MARKETING_HOSTS = new Set([
  'comarpos.com.ar',
  'www.comarpos.com.ar',
  'comarpos.com',
  'www.comarpos.com',
  'localhost:3000',
  'localhost',
]);

async function isMarketingHost() {
  const host = (await headers()).get('host') ?? '';
  return MARKETING_HOSTS.has(host) || MARKETING_HOSTS.has(host.split(':')[0]);
}

export async function generateMetadata(): Promise<Metadata> {
  if (!(await isMarketingHost())) return { robots: { index: false, follow: false } };
  const title = 'ComarPOS — Sistema de gestión para comercios';
  const description = 'Punto de venta, facturación electrónica AFIP, stock, caja y reportes en un solo sistema. Para cualquier rubro: kioscos, veterinarias, ferreterías y más.';
  return {
    title,
    description,
    alternates: { canonical: '/' },
    openGraph: { title, description, url: 'https://comarpos.com.ar' },
    twitter: { title, description },
  };
}

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
    url: 'https://comarpos.com.ar/prueba-gratis',
  })),
};

export default async function RootPage() {
  if (await isMarketingHost()) {
    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_APP_JSON_LD) }} />
        <LandingPage />
      </>
    );
  }
  // El login se encarga de mandar al usuario ya autenticado a
  // /[tenantSlug]/pos - acá no sabemos el tenant sin decodificar el JWT.
  redirect('/login');
}
