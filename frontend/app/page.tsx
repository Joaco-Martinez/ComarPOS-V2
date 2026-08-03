import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import LandingPage from '@/components/landing/LandingPage';

// Dominio(s) donde se sirve la landing de ventas en vez del sistema. Cualquier
// otro host (subdominios de tenant, ej. grupovj.comarpos.com.ar) sigue
// entrando directo a la app.
const MARKETING_HOSTS = new Set([
  'comarpos.com.ar',
  'www.comarpos.com.ar',
  'localhost:3000',
  'localhost',
]);

async function isMarketingHost() {
  const host = (await headers()).get('host') ?? '';
  return MARKETING_HOSTS.has(host) || MARKETING_HOSTS.has(host.split(':')[0]);
}

export async function generateMetadata(): Promise<Metadata> {
  if (!(await isMarketingHost())) return {};
  return {
    title: 'ComarPOS — Sistema de gestión para comercios',
    description: 'Punto de venta, facturación electrónica AFIP, stock, caja y reportes en un solo sistema. Para cualquier rubro: kioscos, veterinarias, talleres y más.',
  };
}

export default async function RootPage() {
  if (await isMarketingHost()) {
    return <LandingPage />;
  }
  redirect('/pos');
}
