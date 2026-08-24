import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import LandingPage from '@/components/landing/LandingPage';
import { getVerticalBySlug } from '@/components/landing/verticals';

// Mismo criterio que app/page.tsx: estas páginas por rubro solo tienen
// sentido en el dominio de marketing, no en un subdominio de tenant.
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

type Props = { params: Promise<{ rubro: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!(await isMarketingHost())) return { robots: { index: false, follow: false } };
  const { rubro } = await params;
  const vertical = getVerticalBySlug(rubro);
  if (!vertical) return {};
  const title = `ComarPOS para ${vertical.label} — Sistema de gestión`;
  const description = vertical.heroDescription;
  return {
    title,
    description,
    alternates: { canonical: `/para/${vertical.slug}` },
    openGraph: { title, description, url: `https://comarpos.com.ar/para/${vertical.slug}` },
    twitter: { title, description },
  };
}

export default async function VerticalLandingPage({ params }: Props) {
  if (!(await isMarketingHost())) redirect('/login');

  const { rubro } = await params;
  const vertical = getVerticalBySlug(rubro);
  if (!vertical) notFound();

  return <LandingPage vertical={vertical} />;
}
