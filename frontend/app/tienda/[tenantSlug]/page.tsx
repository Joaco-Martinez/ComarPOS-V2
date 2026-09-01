/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useStore } from './StoreContext';
import { ArrowRight, Grid3x3 } from 'lucide-react';

type Category = { id: string; name: string; slug: string; description: string | null; productsCount: number };

export default function TiendaHomePage() {
  const { store, tenantSlug } = useStore();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/tienda/${tenantSlug}/catalog/categories`)
      .then(({ data }) => setCategories(data.content ?? []))
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  }, [tenantSlug]);

  return (
    <div style={{ paddingTop: 8 }}>
      {store.description && (
        <p style={{ fontSize: 14, color: '#344054', lineHeight: 1.6, maxWidth: 640, marginBottom: 24 }}>
          {store.description}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#172033' }}>Categorías</h2>
        <Link
          href={`/tienda/${tenantSlug}/productos`}
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--store-accent)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
        >
          Ver todos los productos <ArrowRight size={14} />
        </Link>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div style={{ width: 22, height: 22, border: '3px solid #E4E7EC', borderTopColor: 'var(--store-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : categories.length === 0 ? (
        <Link
          href={`/tienda/${tenantSlug}/productos`}
          className="tienda-cta"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24,
            borderRadius: 12, border: '1px dashed #D0D5DD', color: '#667085', textDecoration: 'none', fontSize: 14,
          }}
        >
          <Grid3x3 size={18} /> Ver todos los productos
        </Link>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/tienda/${tenantSlug}/productos?category=${c.slug}`}
              style={{
                display: 'block', padding: 16, borderRadius: 12, border: '1px solid #E4E7EC',
                background: '#fff', textDecoration: 'none', transition: 'border-color 0.12s',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: '#172033', marginBottom: 4 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: '#98A2B3' }}>{c.productsCount} producto{c.productsCount === 1 ? '' : 's'}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
