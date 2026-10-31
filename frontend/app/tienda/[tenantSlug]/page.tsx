/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useStore } from './StoreContext';
import { ArrowRight, ShoppingBag, Tag } from 'lucide-react';

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
    <div>
      {store.description && <p className="t-desc">{store.description}</p>}

      <Link href={`/tienda/${tenantSlug}/productos`} className="t-btn" style={{ marginBottom: 24 }}>
        <ShoppingBag size={18} /> Ver todos los productos
      </Link>

      {(loading || categories.length > 0) && (
        <div className="t-section-head">
          <h2 className="t-h2">Categorías</h2>
          <Link href={`/tienda/${tenantSlug}/productos`} className="t-link">
            Ver todo <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div className="t-spinner" />
        </div>
      ) : categories.length === 0 ? null : (
        <div className="t-cat-grid">
          {categories.map((c) => (
            <Link key={c.id} href={`/tienda/${tenantSlug}/productos?category=${c.slug}`} className="t-cat">
              <div className="t-cat-icon"><Tag size={16} /></div>
              <div>
                <div className="t-cat-name">{c.name}</div>
                <div className="t-cat-count">{c.productsCount} producto{c.productsCount === 1 ? '' : 's'}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
