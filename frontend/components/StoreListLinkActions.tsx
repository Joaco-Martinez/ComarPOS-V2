'use client';

import toast from 'react-hot-toast';
import { Copy, ExternalLink, MessageCircle } from 'lucide-react';

/**
 * Link de la tienda online con una lista de precios aplicada: la lista
 * principal (Minorista) es el link normal; cualquier otra agrega
 * ?lista=<id>, y la tienda muestra y cobra los precios de esa lista.
 */
export function buildStoreListUrl(tenantSlug: string, list?: { id: string; isDefault?: boolean } | null) {
  if (typeof window === 'undefined' || !tenantSlug) return '';
  const base = `${window.location.origin}/tienda/${tenantSlug}`;
  return list && !list.isDefault ? `${base}?lista=${encodeURIComponent(list.id)}` : base;
}

export default function StoreListLinkActions({
  url,
  listName,
  storeName,
  size = 'xs',
}: {
  url: string;
  listName: string;
  storeName?: string | null;
  size?: 'xs' | 'sm';
}) {
  if (!url) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Link de la lista ${listName} copiado`);
    } catch {
      toast.error('No se pudo copiar, copialo a mano');
    }
  };

  const message = `Hola! Te paso ${storeName ? `la tienda online de ${storeName}` : 'nuestra tienda online'} con los precios de la lista ${listName}: ${url}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const btn = `btn btn-secondary btn-${size}`;

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button type="button" onClick={copy} className={btn} style={{ gap: 4 }}>
        <Copy size={12} /> Copiar link
      </button>
      <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={btn} style={{ gap: 4 }}>
        <MessageCircle size={12} /> WhatsApp
      </a>
      <a href={url} target="_blank" rel="noopener noreferrer" className={btn} style={{ gap: 4 }}>
        <ExternalLink size={12} /> Ver
      </a>
    </div>
  );
}
