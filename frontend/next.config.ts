import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },
  async headers() {
    // Next.js solo pone cache larga por default en los chunks hasheados de
    // _next/static -- estos assets en public/ (logo, iconos) tienen su propio
    // nombre estable, así que si cambia el archivo hay que cambiarle el
    // nombre (o aceptar hasta 1 año de cache stale en algún cliente).
    return [
      {
        source: '/brand/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/icons/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
