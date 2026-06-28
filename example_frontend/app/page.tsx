import type { Metadata } from 'next';
import ShopPublicShell from '@/components/shop/ShopPublicShell';
import ShopPageClient from '@/components/shop/ShopPageClient';

const siteUrl = 'https://www.grupovj.com.ar';

export const metadata: Metadata = {
  title: 'Grupo VJ | Distribuidora de bebidas mayorista y minorista',
  description:
    'Catálogo online de Grupo VJ. Distribuidora de bebidas mayorista y minorista en Córdoba: fernet, cervezas, vinos, gaseosas, energizantes y combos para comercios, eventos y clientes particulares.',
  alternates: {
    canonical: `${siteUrl}/`,
  },
  openGraph: {
    title: 'Grupo VJ | Distribuidora de bebidas mayorista y minorista',
    description:
      'Tienda online y distribuidora de bebidas en Córdoba. Venta mayorista y minorista para comercios, eventos y clientes particulares.',
    url: `${siteUrl}/`,
    siteName: 'Grupo VJ',
    locale: 'es_AR',
    type: 'website',
    images: [
      {
        url: `${siteUrl}/logo-vj-white-transparent.png`,
        width: 512,
        height: 512,
        alt: 'Logo de Grupo VJ',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'Grupo VJ | Distribuidora de bebidas mayorista y minorista',
    description:
      'Venta mayorista y minorista de bebidas en Córdoba para comercios, eventos y clientes particulares.',
    images: [`${siteUrl}/logo-vj-white-transparent.png`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': 180,
      'max-video-preview': -1,
    },
  },
};

export default function Home() {
  return (
    <ShopPublicShell>
      <ShopPageClient />
    </ShopPublicShell>
  );
}
