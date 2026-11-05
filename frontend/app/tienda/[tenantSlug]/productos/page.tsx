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
  // Precio Minorista tachado + % off cuando la lista de precios lo deja más
  // barato (null = sin descuento).
  regularPrice?: number | null;
  discountPercent?: number | null;
  stockLabel: string;
  canSell: boolean;
  // Stock que se puede poner en el carrito (null = sin tope).
  maxQuantity?: number | null;
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
  const { cart, addItem, syncPriceList } = useCartContext();
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

  const unitLabel = (saleUnit: string, n: number) => (saleUnit === 'KG' ? `${n} kg` : `${n} ${n === 1 ? 'unidad' : 'unidades'}`);

  const flashAdded = (id: string) => {
    setJustAdded(id);
    setTimeout(() => setJustAdded((cur) => (cur === id ? null : cur)), 1200);
  };

  // El carrito guarda el productId de la variante y su nombre completo
  // ("Remera - M / Rojo"). No deja pasarse del stock disponible.
  const handleAddVariant = (parent: StoreProduct, v: StoreVariant) => {
    const res = addItem({ productId: v.id, name: v.name, imageUrl: v.imageUrl ?? parent.imageUrl, price: v.price, saleUnit: parent.saleUnit, maxQty: v.maxQuantity }, 1);
    if (!res.ok) {
      toast.error(`Ya tenés en el carrito todo el stock de ${v.name} (${unitLabel(parent.saleUnit, res.max)})`);
      return;
    }
    setChoosing(null);
    flashAdded(parent.id);
    toast.success(`${v.name} agregado al carrito`);
  };

  const handleAdd = (p: StoreProduct) => {
    if (p.hasVariants) {
      // Si se buscó/escaneó el SKU exacto de una variante, se agrega directo.
      const exact = p.variants?.find((v) => v.sku && skuKey(v.sku) === skuKey(search));
      if (exact?.canSell) { handleAddVariant(p, exact); return; }
      setChoosing(p);
      return;
    }
    const res = addItem({ productId: p.id, name: p.name, imageUrl: p.imageUrl, price: p.price, saleUnit: p.saleUnit, maxQty: p.maxQuantity }, 1);
    if (!res.ok) {
      toast.error(`Solo hay ${unitLabel(p.saleUnit, res.max)} de ${p.name} y ya están en tu carrito`);
      return;
    }
    flashAdded(p.id);
    toast.success(res.capped ? `Agregamos lo que queda de ${p.name}` : `${p.name} agregado al carrito`);
  };

  // Cantidad que ya hay en el carrito de un producto simple, para mostrar
  // el boton como "Máximo" cuando ya no queda stock para sumar.
  const inCart = (productId: string) => {
    const line = cart.find((l) => l.productId === productId);
    if (!line) return 0;
    return line.saleUnit === 'KG' ? line.quantityKg : line.quantity;
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
              const atMax = !p.hasVariants && p.maxQuantity != null && p.canSell && inCart(p.id) >= p.maxQuantity;
              return (
                <article key={p.id} className={`t-card${p.canSell ? '' : ' is-soldout'}`}>
                  <div className="t-card-media">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name} loading="lazy" />
                    ) : (
                      <Package size={28} style={{ color: '#D0D5DD' }} />
                    )}
                    {!p.canSell && <span className="t-soldout">Sin stock</span>}
                    {p.canSell && !!p.discountPercent && <span className="t-discount-badge">-{p.discountPercent}%</span>}
                  </div>
                  <div className="t-card-body">
                    <h3 className="t-card-name">{p.name}</h3>
                    {!!p.discountPercent && p.regularPrice != null && (
                      <div className="t-card-regular">
                        <s>{money(p.regularPrice)}</s>
                        <span className="t-discount-pill">{p.discountPercent}% OFF</span>
                      </div>
                    )}
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
                        disabled={!p.canSell || (atMax && !added)}
                        className={`t-card-btn${added ? ' is-added' : ''}`}
                      >
                        {!p.canSell ? 'Sin stock' : atMax && !added ? (
                          <><Check size={15} /> En tu carrito</>
                        ) : (
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
