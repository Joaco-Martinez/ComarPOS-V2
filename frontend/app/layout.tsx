import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import PwaRegister from '@/components/PwaRegister';
import KeyboardInsetWatcher from '@/components/KeyboardInsetWatcher';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'ComarPOS', template: '%s | ComarPOS' },
  description: 'Sistema ERP y POS — todo lo que tu negocio necesita, en un solo lugar.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ComarPOS',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#001125',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('comarpos-theme');if(t==='light')document.documentElement.classList.add('light');}catch(e){}})();` }} />
      </head>
      <body>
        {children}
        <PwaRegister />
        <KeyboardInsetWatcher />
      </body>
    </html>
  );
}
