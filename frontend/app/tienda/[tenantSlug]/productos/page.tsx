/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
'use client';

import { skuKey } from '@/lib/helpers';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useStore } from '../StoreContext';
import { useCartContext } from '../CartContext';
import SkuScannerModal from '@/components/SkuScannerModal';
import { Search, Package, ChevronLeft, ChevronRight, Plus, Check, ScanBarcode } from 'lucide-react';
import VariantChooser, { type StoreVariant } from './VariantChooser';

type StoreCategory = { id: string; name: string; slug: string; productsCount: number };

type StoreProduct = {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  saleUnit: string;
  category: { id: string; name: string; slug: string } | null;
  price: number;
  stockLabel: string;
  canSell: boolean;
  // Variantes: el catálogo trae el padre con sus variantes adentro.
  hasVariants?: boolean;
  variantOptions?: { name: string; values: string[] }[];
  variants?: StoreVariant[];
  hasPriceRange?: boolean;
};

const money = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0);

export default function TiendaProductosPage() {
  const { tenantSlug, linkPriceListId, setPriceList } = useStore();
  const { addItem, syncPriceList } = useCartContext();
  const searchParams = useSearchParams();
  const categorySlug = searchParams.get('category') ?? '';

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [choosing, setChoosing] = useState<StoreProduct | null>(null);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  // La búsqueda pega a la API recién cuando el comprador deja de tipear.
  const [query, setQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    api.get(`/tienda/${tenantSlug}/catalog/categories`)
      .then(({ data }) => setCategories(data.content ?? []))
      .catch(() => setCategories([]));
  }, [tenantSlug]);

  // El carrito guarda el productId de la variante y su nombre completo
  // ("Remera - M / Rojo").
  const handleAddVariant = (parent: StoreProduct, v: StoreVariant) => {
    addItem({ productId: v.id, name: v.name, imageUrl: v.imageUrl ?? parent.imageUrl, price: v.price, saleUnit: parent.saleUnit }, 1);
    setChoosing(null);
    setJustAdded(parent.id);
    toast.success(`${v.name} agregado al carrito`);
    setTimeout(() => setJustAdded((cur) => (cur === parent.id ? null : cur)), 1200);
  };

  const handleAdd = (p: StoreProduct) => {
    if (p.hasVariants) {
      // Si se buscó/escaneó el SKU exacto de una variante, se agrega directo.
      const exact = p.variants?.find((v) => v.sku && skuKey(v.sku) === skuKey(search));
      if (exact?.canSell) { handleAddVariant(p, exact); return; }
      setChoosing(p);
      return;
    }
    addItem({ productId: p.id, name: p.name, imageUrl: p.imageUrl, price: p.price, saleUnit: p.saleUnit }, p.saleUnit === 'KG' ? 1 : 1);
    setJustAdded(p.id);
    toast.success(`${p.name} agregado al carrito`);
    setTimeout(() => setJustAdded((cur) => (cur === p.id ? null : cur)), 1200);
  };

  const handleScanned = (code: string) => {
    setScannerOpen(false);
    setSearch(code.trim());
    toast.success(`Buscando "${code.trim()}"...`);
  };

  useEffect(() => { setPage(1); }, [categorySlug, query]);

  const goToPage = (next: number) => {
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    setLoading(true);
    const params: Record<string, any> = { page, limit: 24 };
    if (categorySlug) params.category = categorySlug;
    if (query) params.search = query;
    if (linkPriceListId) params.lista = linkPriceListId;

    api.get(`/tienda/${tenantSlug}/catalog/products`, { params })
      .then(({ data }) => {
        // La lista que realmente aplica la decide el backend (link o la del
        // cliente logueado): si cambió, el carrito tenía otros precios.
        const appliedList = data.content?.priceList ?? null;
        setPriceList(appliedList);
        if (syncPriceList(appliedList?.id ?? null)) {
          toast(`Actualizamos los precios${appliedList ? ` a la lista ${appliedList.name}` : ''}: vaciamos tu carrito para que coincidan.`, { icon: '🏷️' });
        }
        setProducts(data.content?.products ?? []);
        setTotalPages(data.content?.pagination?.totalPages ?? 1);
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [tenantSlug, categorySlug, query, page, linkPriceListId]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCategory = categories.find((c) => c.slug === categorySlug);

  return (
    <div>
      <div className="t-search-row">
        <div className="t-search">
          <Search size={17} />
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={activeCategory ? `Buscar en ${activeCategory.name}...` : 'Buscar productos...'}
            aria-label="Buscar productos"
          />
        </div>
        <button
          onClick={() => setScannerOpen(true)}
          title="Escanear código de barras"
          aria-label="Escanear código de barras"
          className="t-icon-btn"
          style={{ height: 46, width: 46, padding: 0 }}
        >
          <ScanBarcode size={19} style={{ color: 'var(--store-accent)' }} />
        </button>
      </div>

      {categories.length > 0 && (
        <nav className="t-chips" aria-label="Categorías">
          <Link href={`/tienda/${tenantSlug}/productos`} scroll={false} className={`t-cat-chip${!categorySlug ? ' is-active' : ''}`}>
            Todos
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/tienda/${tenantSlug}/productos?category=${c.slug}`}
              scroll={false}
              className={`t-cat-chip${c.slug === categorySlug ? ' is-active' : ''}`}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      )}

      <SkuScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleScanned}
        title="Escanear producto"
        hint="Apuntá la cámara al código de barras del producto."
      />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="t-spinner" />
        </div>
      ) : products.length === 0 ? (
        <div className="t-empty">
          <Package size={32} />
          <span style={{ fontSize: 14 }}>
            {query ? `No encontramos productos para "${query}"` : 'Sin productos para mostrar'}
          </span>
          {(query || categorySlug) && (
            <Link
              href={`/tienda/${tenantSlug}/productos`}
              onClick={() => setSearch('')}
              className="t-link"
            >
              Ver todos los productos
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="t-grid">
            {products.map((p) => {
              const added = justAdded === p.id;
              return (
                <article key={p.id} className={`t-card${p.canSell ? '' : ' is-soldout'}`}>
                  <div className="t-card-media">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name} loading="lazy" />
                    ) : (
                      <Package size={28} style={{ color: '#D0D5DD' }} />
                    )}
                    {!p.canSell && <span className="t-soldout">Sin stock</span>}
                  </div>
                  <div className="t-card-body">
                    <h3 className="t-card-name">{p.name}</h3>
                    <div className="t-card-price">
                      {p.hasPriceRange && <small>Desde </small>}
                      {money(p.price)}
                      {p.saleUnit === 'KG' && <small>/kg</small>}
                    </div>
                    {p.hasVariants ? (
                      <div className="t-card-meta">
                        {(p.variantOptions ?? []).map((o) => `${o.values.length} ${o.name.toLowerCase()}`).join(' · ')}
                      </div>
                    ) : p.canSell && p.stockLabel ? (
                      <div className="t-card-meta">{p.stockLabel}</div>
                    ) : null}
                    <div className="t-card-btn-wrap">
                      <button
                        onClick={() => handleAdd(p)}
                        disabled={!p.canSell}
                        className={`t-card-btn${added ? ' is-added' : ''}`}
                      >
                        {!p.canSell ? 'Sin stock' : (
                          <>
                            {added ? <Check size={15} /> : <Plus size={15} />}
                            {added ? 'Agregado' : p.hasVariants ? 'Opciones' : 'Agregar'}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="t-pager">
              <button onClick={() => goToPage(Math.max(1, page - 1))} disabled={page <= 1} aria-label="Página anterior">
                <ChevronLeft size={18} />
              </button>
              <span style={{ fontSize: 14, color: '#667085' }}>Página {page} de {totalPages}</span>
              <button onClick={() => goToPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} aria-label="Página siguiente">
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </>
      )}
      {choosing && (
        <VariantChooser
          name={choosing.name}
          description={choosing.description}
          imageUrl={choosing.imageUrl}
          saleUnit={choosing.saleUnit}
          options={choosing.variantOptions ?? []}
          variants={choosing.variants ?? []}
          money={money}
          onAdd={(v) => handleAddVariant(choosing, v)}
          onClose={() => setChoosing(null)}
        />
      )}
    </div>
  );
}
