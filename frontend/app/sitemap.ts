import type { MetadataRoute } from 'next';
import { VERTICALS } from '@/components/landing/verticals';

const BASE_URL = 'https://www.comarpos.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE_URL}/prueba-gratis`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/suscripcion`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/terminos`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/privacidad`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    // Boton de Arrepentimiento (Resolucion 424/2020): debe ser facil de
    // encontrar, sumarlo al sitemap ayuda a que se indexe/aparezca en
    // busquedas directas ("comarpos baja", "comarpos cancelar"), no solo
    // via el link del footer.
    { url: `${BASE_URL}/arrepentimiento`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
  ];

  const verticalPages: MetadataRoute.Sitemap = VERTICALS.map((v) => ({
    url: `${BASE_URL}/para/${v.slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.8,
  }));

  return [...staticPages, ...verticalPages];
}
