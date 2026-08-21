import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },
  async redirects() {
    // .com.ar es el dominio canónico; .com redirige (301) para no dividir SEO.
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'comarpos.com' }],
        destination: 'https://www.comarpos.com.ar/:path*',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.comarpos.com' }],
        destination: 'https://www.comarpos.com.ar/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
