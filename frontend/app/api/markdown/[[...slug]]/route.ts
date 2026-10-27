import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { appendVaryAccept } from '@/lib/contentNegotiation';

// Sirve la version .md de las paginas de marketing listadas en
// MARKDOWN_NEGOTIATED_PATHS (proxy.ts reescribe /, /about, /contact y
// /privacy hacia aca cuando el request pide Accept: text/markdown). El
// contenido vive en frontend/content/*.md -- separado de las pages de React
// para no tener que derivar markdown desde JSX en cada request.
export async function GET(_req: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  // Solo nombres simples dentro de content/ (sin "..", barras invertidas ni
  // segmentos raros que permitan salir de la carpeta).
  if (slug.some((seg) => !/^[a-z0-9_-]+$/i.test(seg))) {
    return new Response('Not found', { status: 404 });
  }
  const name = slug.length === 0 ? 'index' : slug.join('/');
  const contentDir = path.join(process.cwd(), 'content');
  const contentPath = path.join(contentDir, `${name}.md`);
  if (!contentPath.startsWith(contentDir + path.sep)) {
    return new Response('Not found', { status: 404 });
  }

  let body: string;
  try {
    body = await readFile(contentPath, 'utf8');
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const headers = new Headers({
    'Content-Type': 'text/markdown; charset=utf-8',
    'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
  });
  appendVaryAccept(headers);

  return new Response(body, { headers });
}
