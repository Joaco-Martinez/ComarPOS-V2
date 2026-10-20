/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useStore } from '../StoreContext';
import { useCartContext } from '../CartContext';
import SkuScannerModal from '@/components/SkuScannerModal';
import { Search, Package, ChevronLeft, ChevronRight, Plus, Check, ScanBarcode } from 'lucide-react';
import VariantChooser, { type StoreVariant } from './VariantChooser';

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
  const { tenantSlug } = useStore();
  const { addItem } = useCartContext();
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
      const exact = p.variants?.find((v) => v.sku && v.sku.toLowerCase() === search.trim().toLowerCase());
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

  useEffect(() => { setPage(1); }, [categorySlug, search]);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, any> = { page, limit: 24 };
    if (categorySlug) params.category = categorySlug;
    if (search.trim()) params.search = search.trim();

    api.get(`/tienda/${tenantSlug}/catalog/products`, { params })
      .then(({ data }) => {
        setProducts(data.content?.products ?? []);
        setTotalPages(data.content?.pagination?.totalPages ?? 1);
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [tenantSlug, categorySlug, search, page]);

  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, maxWidth: 420 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#98A2B3' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar productos..."
            style={{
              width: '100%', padding: '10px 12px 10px 36px', borderRadius: 10,
              border: '1px solid #D0D5DD', fontSize: 14, outline: 'none',
            }}
          />
        </div>
        <button
          onClick={() => setScannerOpen(true)}
          title="Escanear código de barras"
          style={{
            flexShrink: 0, width: 44, height: 44, borderRadius: 10, border: '1px solid #D0D5DD',
            background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
        >
          <ScanBarcode size={18} style={{ color: 'var(--store-accent)' }} />
        </button>
      </div>

      <SkuScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleScanned}
        title="Escanear producto"
        hint="Apuntá la cámara al código de barras del producto."
      />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div style={{ width: 24, height: 24, border: '3px solid #E4E7EC', borderTopColor: 'var(--store-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : products.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 60, color: '#98A2B3' }}>
          <Package size={32} />
          <span style={{ fontSize: 14 }}>Sin productos para mostrar</span>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
            {products.map((p) => (
              <div
                key={p.id}
                style={{
                  border: '1px solid #E4E7EC', borderRadius: 12, overflow: 'hidden', background: '#fff',
                  opacity: p.canSell ? 1 : 0.55,
                }}
              >
                <div style={{ width: '100%', aspectRatio: '1 / 1', background: '#F7F8FA', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Package size={28} style={{ color: '#D0D5DD' }} />
                  )}
                </div>
                <div style={{ padding: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#172033', marginBottom: 4, minHeight: 34, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--store-accent)' }}>
                    {p.hasPriceRange ? 'Desde ' : ''}{money(p.price)}{p.saleUnit === 'KG' ? '/kg' : ''}
                  </div>
                  {p.hasVariants && (
                    <div style={{ fontSize: 11, color: '#667085', marginTop: 2 }}>
                      {(p.variantOptions ?? []).map((o) => `${o.values.length} ${o.name.toLowerCase()}`).join(' · ')}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: p.canSell ? '#98A2B3' : '#F04438', marginTop: 4, marginBottom: 10 }}>
                    {p.canSell ? p.stockLabel : 'Sin stock'}
                  </div>
                  <button
                    onClick={() => handleAdd(p)}
                    disabled={!p.canSell}
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none',
                      background: justAdded === p.id ? '#12B76A' : p.canSell ? 'var(--store-accent)' : '#E4E7EC',
                      color: p.canSell ? '#fff' : '#98A2B3', fontSize: 12, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      cursor: p.canSell ? 'pointer' : 'not-allowed', transition: 'background 0.15s',
                    }}
                  >
                    {justAdded === p.id ? <Check size={13} /> : <Plus size={13} />}
                    {justAdded === p.id ? 'Agregado' : p.hasVariants ? 'Elegir opciones' : 'Agregar'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 24 }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{ border: '1px solid #D0D5DD', borderRadius: 8, padding: '6px 10px', background: '#fff', cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.4 : 1 }}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: 13, color: '#667085' }}>Página {page} de {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{ border: '1px solid #D0D5DD', borderRadius: 8, padding: '6px 10px', background: '#fff', cursor: page >= totalPages ? 'default' : 'pointer', opacity: page >= totalPages ? 0.4 : 1 }}
              >
                <ChevronRight size={16} />
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
