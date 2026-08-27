import type { MetadataRoute } from 'next';

// Allow-por-excepcion en vez de Disallow por ruta: las paginas de marketing
// viven todas en la raiz (/, /para/*, /prueba-gratis, etc), pero el resto
// del sitio (todo lo que cuelga de /[tenant]/*, un slug arbitrario que no
// se puede matchear con un patron fijo) es la app logueada -- no tiene
// sentido indexarla, y listar cada ruta interna a mano se desincroniza
// apenas se agrega una pagina nueva. Reforzado ademas con robots:noindex
// en app/[tenant]/layout.tsx y app/platform-admin/layout.tsx (robots.txt
// evita el rastreo, pero no garantiza que una URL nunca se indexe si
// alguien la linkea desde afuera -- el meta noindex es la señal que sí lo
// garantiza).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: [
        '/$', '/para/', '/prueba-gratis', '/suscripcion', '/terminos', '/privacidad', '/arrepentimiento', '/login', '/instalar',
        // Assets que Google/redes sociales necesitan poder pedir directo para
        // mostrar el favicon en resultados de busqueda y la preview al
        // compartir un link (og:image) -- si no, el Disallow: '/' de abajo
        // tambien se los bloquea a ellos aunque el archivo exista y sirva bien.
        '/favicon.ico', '/icon.png', '/apple-icon.png', '/opengraph-image', '/manifest.webmanifest', '/icons/',
        // El propio sitemap tiene que estar permitido explicitamente: el
        // Disallow: '/' de abajo lo alcanza a el tambien, y Search Console
        // reporta "No se ha podido acceder a tu sitemap" cuando el archivo
        // referenciado en Sitemap: mas abajo esta bloqueado por robots.txt.
        '/sitemap.xml',
      ],
      disallow: '/',
    },
    sitemap: 'https://www.comarpos.com/sitemap.xml',
  };
}
