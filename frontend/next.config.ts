import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },
  // Vercel solo empaqueta los archivos que el file tracer de Next detecta
  // por import estatico -- content/*.md se lee en runtime con fs.readFile
  // (app/api/markdown/[[...slug]]/route.ts), asi que sin esto el handler
  // funciona en `next dev` pero tira ENOENT en produccion.
  outputFileTracingIncludes: {
    '/api/markdown/[[...slug]]': ['./content/**/*.md'],
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
