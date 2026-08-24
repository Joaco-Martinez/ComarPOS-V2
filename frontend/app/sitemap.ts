import type { MetadataRoute } from 'next';
import { VERTICALS } from '@/components/landing/verticals';

const BASE_URL = 'https://comarpos.com.ar';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE_URL}/prueba-gratis`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/suscripcion`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/terminos`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/privacidad`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const verticalPages: MetadataRoute.Sitemap = VERTICALS.map((v) => ({
    url: `${BASE_URL}/para/${v.slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.8,
  }));

  return [...staticPages, ...verticalPages];
}
