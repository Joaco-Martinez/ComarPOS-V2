import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import PwaRegister from '@/components/PwaRegister';
import KeyboardInsetWatcher from '@/components/KeyboardInsetWatcher';
import GoogleAnalytics from '@/components/GoogleAnalytics';
import CookieBanner from '@/components/CookieBanner';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

const SITE_URL = 'https://www.comarpos.com';
const SITE_DESCRIPTION = 'Punto de venta, facturación electrónica AFIP, stock, caja y reportes en un solo sistema. Para kioscos, veterinarias, ferreterías y cualquier otro rubro.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'ComarPOS — Sistema de gestión para comercios', template: '%s | ComarPOS' },
  description: SITE_DESCRIPTION,
  keywords: [
    'sistema de gestión', 'punto de venta', 'software POS Argentina', 'facturación electrónica AFIP',
    'facturación ARCA', 'control de stock', 'ERP para comercios', 'sistema para kiosco',
    'sistema para veterinaria', 'sistema para ferretería',
  ],
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ComarPOS',
  },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    url: SITE_URL,
    siteName: 'ComarPOS',
    title: 'ComarPOS — Sistema de gestión para comercios',
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ComarPOS — Sistema de gestión para comercios',
    description: SITE_DESCRIPTION,
  },
  // Opt-in: sin estos env vars no se emite el meta tag (no hay nada que
  // verificar todavia). Se cargan desde Google Search Console / Bing
  // Webmaster Tools una vez que el dominio este en produccion.
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : undefined,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0C0F14',
};

const ORG_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'ComarPOS',
  url: SITE_URL,
  logo: `${SITE_URL}/brand/isologo.png`,
  description: SITE_DESCRIPTION,
};

const WEBSITE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'ComarPOS',
  url: SITE_URL,
  inLanguage: 'es-AR',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('comarpos-theme');if(t==='light')document.documentElement.classList.add('light');}catch(e){}})();` }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSON_LD) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }} />
      </head>
      <body>
        {children}
        <PwaRegister />
        <KeyboardInsetWatcher />
        <GoogleAnalytics />
        <Analytics />
        <CookieBanner />
      </body>
    </html>
  );
}
