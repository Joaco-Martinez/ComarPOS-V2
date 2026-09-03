/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import ConfirmModal, { type ConfirmState } from '@/components/ConfirmModal';
import ClientFormModal from '@/components/ClientFormModal';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { BusinessLocation, CartItem, Client, DiscountType, PaymentMethod, PriceList, Product, ProductCategory, SalePayment } from '@/types';
import { categoryName, clientName, fmtKg, fmtMoney, normalizeArray, num, productPrice } from '@/lib/helpers';
import {
  AlertTriangle, Check, ChevronLeft, LayoutGrid, List, Minus, Package, Plus, RefreshCcw,
  ScanBarcode, Search, ShoppingCart, Trash2, X, User, Percent,
  DollarSign, CreditCard, Banknote, Smartphone, Warehouse,
} from 'lucide-react';

const PAGE_SIZE = 60;
const SKU_SCANNER_ELEMENT_ID = 'comarpos-pos-sku-scanner';
// Producto especial "Costo de envío" (ver backend GET /sales/delivery-product)
// que representa un monto de envío cargado a mano, opcional - no hay calculo
// automatico por distancia.
const DELIVERY_SKU = 'ENVIO-FLETE2';

type QuickPriceType = 'price' | 'wholesalePrice';

type PaymentMode = PaymentMethod;

const ALL_METHODS: { method: PaymentMode; label: string; icon: React.ReactNode }[] = [
  { method: 'EFECTIVO',      label: 'Efectivo',      icon: <Banknote size={14} /> },
  { method: 'TRANSFERENCIA', label: 'Transferencia', icon: <Smartphone size={14} /> },
  { method: 'TARJETA',       label: 'Tarjeta',       icon: <CreditCard size={14} /> },
  { method: 'QR_MERCADOPAGO',label: 'MercadoPago',   icon: <Smartphone size={14} /> },
  { method: 'QR_NACION',    label: 'QR Nación',     icon: <Smartphone size={14} /> },
  { method: 'CUENTA_CORRIENTE', label: 'Cta. Cte.',  icon: <CreditCard size={14} /> },
];

type KgModal = { product: Product; qty: string; priceType: QuickPriceType } | null;

export default function PosPage() {
  const { user } = useAuthStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string>('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Preferencia de vista (grilla con imagenes vs tabla compacta) - por
  // dispositivo/usuario, no por tenant, asi que se guarda en localStorage
  // en vez de mandarse al backend.
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [stockLocationId, setStockLocationId] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [newClientQuery, setNewClientQuery] = useState<string | null>(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountType>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('');
  const [discountMode, setDiscountMode] = useState<'DISCOUNT' | 'SURCHARGE'>('DISCOUNT');
  const [paymentMode, setPaymentMode] = useState<'single' | 'multi'>('single');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('EFECTIVO');
  const [payments, setPayments] = useState<SalePayment[]>([{ method: 'EFECTIVO', amount: 0 }]);
  const [kgModal, setKgModal] = useState<KgModal>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [mobileCartStep, setMobileCartStep] = useState<'items' | 'checkout'>('items');

  const [skuScannerOpen, setSkuScannerOpen] = useState(false);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const scannerInstanceRef = useRef<any>(null);
  const scannerHandledRef = useRef(false);

  const [businessLocations, setBusinessLocations] = useState<BusinessLocation[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [priceListId, setPriceListId] = useState('');
  const [priceOverrides, setPriceOverrides] = useState<Record<string, { price: number; pricePerKg: number | null }>>({});

  // Costo de envío manual y opcional - el vendedor lo tipea si el cliente
  // pide que se lo cobren aparte, no hay calculo automatico por distancia.
  const [deliveryAmountInput, setDeliveryAmountInput] = useState('');
  const deliveryProductRef = useRef<Product | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('comarpos:pos:viewMode');
    if (stored === 'grid' || stored === 'list') setViewMode(stored);
  }, []);

  const toggleViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('comarpos:pos:viewMode', mode);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [pr, cr, clr, blr, plr] = await Promise.all([
          api.get('/products', { params: { isActive: true, limit: 500 } }).catch(() => null),
          api.get('/categories').catch(() => null),
          api.get('/clients', { params: { limit: 200 } }).catch(() => null),
          api.get('/business-locations').catch(() => null),
          api.get('/price-lists').catch(() => null),
        ]);
        if (pr) setProducts(normalizeArray<Product>(pr.data));
        if (cr) setCategories(normalizeArray<ProductCategory>(cr.data).filter((c) => c.isActive));
        if (clr) setClients(normalizeArray<Client>(clr.data));
        if (plr) setPriceLists(normalizeArray<PriceList>(plr.data));
        if (!pr || !cr || !clr) {
          alert('Algunos datos no se pudieron cargar (productos, categorías o clientes). Actualizá la página para reintentar.');
        }
        if (blr) {
          const locations = normalizeArray<BusinessLocation>(blr.data).filter((l) => l.isActive);
          setBusinessLocations(locations);
          // La sucursal de base del usuario (Usuarios > Sucursal de base)
          // manda por sobre la default del negocio si esta asignada y sigue
          // activa (doc "puntos de venta separados") - evita que cada
          // vendedor tenga que acordarse de tocar el switcher cada vez.
          const userLocationId = user?.defaultBusinessLocationId;
          const userLocationValid = !!userLocationId && locations.some((l) => l.id === userLocationId);
          const defaultId = locations.find((l) => l.isDefault)?.id ?? locations[0]?.id ?? '';
          setStockLocationId(userLocationValid ? userLocationId! : defaultId);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Si este effect corrio antes de que useAuthStore ya tuviera el usuario
  // resuelto (ej. F5 directo en /pos: me() y este fetch salen en paralelo),
  // corrige la sucursal preseleccionada apenas el usuario esta disponible -
  // sin pisar una eleccion manual ya hecha a mano en el switcher de stock.
  useEffect(() => {
    const userLocationId = user?.defaultBusinessLocationId;
    if (!userLocationId || businessLocations.length === 0) return;
    if (!businessLocations.some((l) => l.id === userLocationId)) return;

    const stillOnTenantDefault = !stockLocationId || stockLocationId === businessLocations.find((l) => l.isDefault)?.id;
    if (stillOnTenantDefault && stockLocationId !== userLocationId) setStockLocationId(userLocationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.defaultBusinessLocationId, businessLocations]);

  // Al elegir un cliente, precarga la lista de precios que tiene asignada
  // (si tiene) - se puede overridear a mano con el selector de al lado.
  useEffect(() => {
    setPriceListId(selectedClient?.priceListId ?? '');
  }, [selectedClient]);

  // Trae los precios override de la lista elegida (si no es la default, que
  // ya coincide con el precio del producto - ver Product.price).
  useEffect(() => {
    const list = priceLists.find((pl) => pl.id === priceListId);
    if (!priceListId || list?.isDefault) {
      setPriceOverrides({});
      return;
    }
    api
      .get(`/price-lists/${priceListId}`)
      .then(({ data }) => {
        const map: Record<string, { price: number; pricePerKg: number | null }> = {};
        for (const item of data.items ?? []) {
          map[item.productId] = { price: item.price, pricePerKg: item.pricePerKg ?? null };
        }
        setPriceOverrides(map);
      })
      .catch(() => setPriceOverrides({}));
  }, [priceListId, priceLists]);

  const resolvedPrice = (product: Product) => {
    const override = priceOverrides[product.id];
    if (product.saleUnit === 'KG') {
      return override?.pricePerKg ?? productPrice(product, 'price');
    }
    return override?.price ?? productPrice(product, 'price');
  };

  const filtered = useMemo(() => {
    let p = products.filter((x) => x.isActive !== false);
    if (catFilter) p = p.filter((x) => x.categoryId === catFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      p = p.filter((x) => x.name.toLowerCase().includes(q) || x.sku?.toLowerCase().includes(q));
    }
    return p;
  }, [products, catFilter, search]);

  // Reset pagination whenever the visible set changes, so "Ver más" always starts from the top.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, catFilter, stockLocationId]);

  const visibleProducts = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients.slice(0, 8);
    return clients.filter((c) =>
      c.nombre.toLowerCase().includes(q) ||
      c.apellido?.toLowerCase().includes(q) ||
      c.dni?.includes(q)
    ).slice(0, 8);
  }, [clients, clientSearch]);

  const productStock = (p: Product) => {
    const row = p.stock?.find((s) => s.businessLocationId === stockLocationId);
    if (!row) return 0;
    return num(p.saleUnit === 'KG' ? row.quantityKg : row.quantity);
  };

  const addToCart = (product: Product, priceType: QuickPriceType) => {
    if (product.saleUnit === 'KG') {
      setKgModal({ product, qty: '', priceType });
      return;
    }
    // Si hay una lista de precios elegida con override para este producto,
    // se fija ese precio al agregarlo (mismo mecanismo que ya usaba el
    // envío para su costo calculado) - así no depende de que el producto
    // "sepa" de listas de precios en cada render.
    const override = priceOverrides[product.id]?.price;
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.product.id === product.id && i.priceType === priceType);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { product, quantity: 1, priceType, ...(override !== undefined ? { manualPrice: override } : {}) }];
    });
  };

  const confirmKgAdd = () => {
    if (!kgModal) return;
    const qty = parseFloat(kgModal.qty);
    if (!qty || qty <= 0) { setKgModal(null); return; }
    const override = priceOverrides[kgModal.product.id]?.pricePerKg ?? undefined;
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.product.id === kgModal.product.id && i.priceType === kgModal.priceType);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantityKg: num(next[idx].quantityKg) + qty };
        return next;
      }
      return [...prev, { product: kgModal.product, quantity: 1, quantityKg: qty, priceType: kgModal.priceType, ...(override !== undefined ? { manualPrice: override } : {}) }];
    });
    setKgModal(null);
  };

  const stopSkuScanner = async () => {
    const scanner = scannerInstanceRef.current;
    scannerHandledRef.current = false;
    if (!scanner) return;
    try {
      const state = scanner.getState?.();
      if (state === 2) await scanner.stop();
    } catch {
      // ignore - puede tirar error si ya se detuvo
    }
    try {
      await scanner.clear?.();
    } catch {
      // html5-qrcode puede tirar error si el contenedor ya fue desmontado
    }
    scannerInstanceRef.current = null;
  };

  const closeSkuScanner = async () => {
    await stopSkuScanner();
    setScannerError('');
    setScannerLoading(false);
    setSkuScannerOpen(false);
  };

  const openSkuScanner = () => {
    setScannerError('');
    setScannerLoading(true);
    scannerHandledRef.current = false;
    setSkuScannerOpen(true);
  };

  const handleScannedSku = async (rawSku: string) => {
    const sku = rawSku.trim();
    if (!sku || scannerHandledRef.current) return;
    scannerHandledRef.current = true;

    const product = products.find((p) => p.sku && p.sku.trim().toLowerCase() === sku.toLowerCase());

    if (!product) {
      scannerHandledRef.current = false;
      setScannerError(`No encontré ningún producto con SKU: ${sku}`);
      return;
    }
    if (product.isService) {
      scannerHandledRef.current = false;
      setScannerError('Ese SKU pertenece a un servicio y no se agrega desde el scanner.');
      return;
    }

    addToCart(product, 'price');
    await closeSkuScanner();
  };

  useEffect(() => {
    if (!skuScannerOpen) return;
    let cancelled = false;

    const startScanner = async () => {
      setScannerLoading(true);
      setScannerError('');
      try {
        if (typeof window === 'undefined') return;
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;

        const scanner = new Html5Qrcode(SKU_SCANNER_ELEMENT_ID);
        scannerInstanceRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72);
              return {
                width: Math.max(220, Math.min(size, 340)),
                height: Math.max(120, Math.min(Math.floor(size * 0.55), 220)),
              };
            },
            aspectRatio: 1.777,
          },
          async (decodedText: string) => { await handleScannedSku(decodedText); },
          () => { /* lectura fallida, seguimos intentando */ },
        );

        if (!cancelled) setScannerLoading(false);
      } catch (e: any) {
        console.error(e);
        if (!cancelled) {
          setScannerLoading(false);
          setScannerError(
            e?.message?.includes('Permission')
              ? 'No se pudo acceder a la cámara. Revisá los permisos del navegador.'
              : 'No se pudo iniciar la cámara. Probá con HTTPS, otro navegador o buscá el SKU manualmente.'
          );
        }
      }
    };

    const timeoutId = window.setTimeout(startScanner, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      void stopSkuScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuScannerOpen]);

  const updateQty = (idx: number, delta: number) => {
    setCart((prev) => {
      const next = [...prev];
      const newQty = next[idx].quantity + delta;
      if (newQty <= 0) return prev.filter((_, i) => i !== idx);
      next[idx] = { ...next[idx], quantity: newQty };
      return next;
    });
  };

  const removeFromCart = (idx: number) => {
    setCart((prev) => {
      if (prev[idx]?.product.sku === DELIVERY_SKU) setDeliveryAmountInput('');
      return prev.filter((_, i) => i !== idx);
    });
  };

  // Agrega/actualiza (o saca) la linea de "Costo de envío" del carrito segun
  // lo que tipeo el vendedor - el producto especial se pide una sola vez y
  // se cachea (deliveryProductRef), no hace falta pedirlo en cada tecla.
  const applyDeliveryAmount = async (value: string) => {
    setDeliveryAmountInput(value);
    const amount = num(value);

    if (!amount || amount <= 0) {
      setCart((prev) => prev.filter((i) => i.product.sku !== DELIVERY_SKU));
      return;
    }

    if (!deliveryProductRef.current) {
      try {
        const { data } = await api.get('/sales/delivery-product');
        deliveryProductRef.current = data;
      } catch {
        alert('No se pudo cargar el producto de envío. Probá de nuevo.');
        return;
      }
    }

    const deliveryProduct = deliveryProductRef.current;
    if (!deliveryProduct) return;

    setCart((prev) => {
      const withoutDelivery = prev.filter((i) => i.product.sku !== DELIVERY_SKU);
      return [...withoutDelivery, { product: deliveryProduct, quantity: 1, manualPrice: amount, priceType: 'price' }];
    });
  };

  const subtotal = cart.reduce((acc, item) => {
    const price = item.manualPrice ?? productPrice(item.product, item.priceType);
    const qty = item.product.saleUnit === 'KG' ? num(item.quantityKg) : item.quantity;
    return acc + price * qty;
  }, 0);

  // Negativo = recargo (suma al total en vez de restar) - mismo campo que el
  // descuento, con el signo dado por discountMode. El backend no distingue
  // tipos separados: total = subtotal - discountAmount funciona para ambos.
  const discountAmount = useMemo(() => {
    const dv = num(discountValue);
    if (!dv) return 0;
    const amount = discountType === 'PERCENTAGE' ? subtotal * (dv / 100) : dv;
    if (discountMode === 'SURCHARGE') return -amount;
    return Math.min(amount, subtotal);
  }, [subtotal, discountType, discountValue, discountMode]);

  const total = Math.max(0, subtotal - discountAmount);

  // Modo simple (default): un solo método, se asume que cubre el total exacto
  // (o queda todo como deuda si es cuenta corriente) - no hace falta tipear
  // un monto, igual que en Grupo VJ. Modo múltiple: mismo comportamiento de
  // siempre, con montos por método y vuelto si se pasan.
  const totalPaid = paymentMode === 'single'
    ? (paymentMethod === 'CUENTA_CORRIENTE' ? 0 : total)
    : payments.reduce((a, p) => a + num(p.amount), 0);
  const change = paymentMode === 'multi' ? Math.max(0, totalPaid - total) : 0;

  const addPaymentMethod = () => {
    setPayments((p) => [...p, { method: 'EFECTIVO', amount: 0 }]);
  };

  const updatePayment = (idx: number, field: 'method' | 'amount', value: string | number) => {
    setPayments((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const removePayment = (idx: number) => {
    if (payments.length <= 1) return;
    setPayments((p) => p.filter((_, i) => i !== idx));
  };

  const resetPOS = () => {
    setCart([]);
    setSelectedClient(null);
    setClientSearch('');
    setDiscountValue('');
    setDiscountType('PERCENTAGE');
    setDiscountMode('DISCOUNT');
    setPaymentMode('single');
    setPaymentMethod('EFECTIVO');
    setPayments([{ method: 'EFECTIVO', amount: 0 }]);
    setSearch('');
    setMobileCartStep('items');
    setPriceListId('');
    setDeliveryAmountInput('');
    searchRef.current?.focus();
  };

  const submitSale = async (status: 'COMPLETED' | 'PENDING') => {
    if (cart.length === 0) return;
    if (!stockLocationId) {
      alert('Elegí de qué ubicación sale el stock antes de confirmar la venta. Si no hay ninguna creada, configurá una en Sucursales.');
      return;
    }
    if (status === 'COMPLETED') {
      if (paymentMode === 'single' && paymentMethod === 'CUENTA_CORRIENTE' && !selectedClient) {
        alert('Para vender en cuenta corriente tenés que elegir un cliente.');
        return;
      }
      if (paymentMode === 'multi' && totalPaid < total && !selectedClient) {
        alert('Para dejar un saldo parcial en cuenta corriente tenés que elegir un cliente.');
        return;
      }
    }
    setSubmitting(true);
    try {
      const items = cart.map((i) => ({
        productId: i.product.id,
        quantity: i.product.saleUnit === 'KG' ? 1 : i.quantity,
        quantityKg: i.product.saleUnit === 'KG' ? num(i.quantityKg) : undefined,
        price: i.manualPrice ?? productPrice(i.product, i.priceType),
      }));

      const body: Record<string, any> = {
        items,
        receiptType: 'TICKET',
        status,
        stockLocationId,
        ...(priceListId && { priceListId }),
        paymentMethod: paymentMode === 'single' ? paymentMethod : payments[0].method,
        ...(paymentMode === 'multi' && {
          payments: payments.filter((p) => num(p.amount) > 0).map((p) => ({ method: p.method, amount: num(p.amount) })),
        }),
        ...(selectedClient && { clientId: selectedClient.id }),
        ...(discountValue && {
          discountType,
          discountValue: discountMode === 'SURCHARGE' ? -num(discountValue) : num(discountValue),
        }),
      };

      await api.post('/sales', body);
      setSuccessMsg(status === 'PENDING' ? `Venta guardada como pendiente — ${fmtMoney(total)}` : `Venta registrada — ${fmtMoney(total)}`);
      resetPOS();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Error al registrar la venta');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AppLayout title="POS" subtitle="Punto de venta">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <div className="spinner" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="POS — Punto de Venta">
      {successMsg && (
        <div style={{
          position: 'fixed', top: 'calc(var(--app-header-height, 56px) + 14px)', left: '50%', transform: 'translateX(-50%)', zIndex: 200,
          background: 'rgba(24,193,94,0.15)', border: '1px solid rgba(24,193,94,0.4)',
          color: 'var(--success)', borderRadius: 8, padding: '10px 22px',
          fontSize: 14, fontWeight: 600, animation: 'fadeIn 0.3s ease',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Check size={16} /> {successMsg}
        </div>
      )}

      <div className="pos-layout">

        {/* ─── Left: Product grid ─── */}
        <div className="pos-products">
          {/* Search */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto por nombre o SKU..."
                style={{ paddingLeft: 34, paddingRight: search ? 62 : 36 }}
                autoFocus
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 36, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 2 }}>
                  <X size={14} />
                </button>
              )}
              <button
                onClick={openSkuScanner}
                title="Escanear SKU con la cámara"
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 2, display: 'flex' }}
              >
                <ScanBarcode size={16} />
              </button>
            </div>
            {/* Toggle grilla (con imagenes) / tabla (compacta, sin imagenes) -
                preferencia por dispositivo, ver comarpos:pos:viewMode. */}
            <div style={{ display: 'flex', flexShrink: 0, border: '1px solid var(--border2)', borderRadius: 8, overflow: 'hidden' }}>
              <button
                onClick={() => toggleViewMode('grid')}
                title="Vista de grilla con imágenes"
                className={`btn btn-xs ${viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: 0, padding: '9px 8px' }}
              >
                <LayoutGrid size={14} />
              </button>
              <button
                onClick={() => toggleViewMode('list')}
                title="Vista de tabla"
                className={`btn btn-xs ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: 0, padding: '9px 8px' }}
              >
                <List size={14} />
              </button>
            </div>
          </div>

          {/* Stock location */}
          {businessLocations.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--danger)', flexShrink: 0 }}>
              No hay ubicaciones de stock configuradas — creá una en Sucursales antes de vender.
            </div>
          ) : user?.restrictToDefaultLocation ? (
            // Usuario restringido a su sucursal de base (Usuarios > "Restringir
            // a esta sucursal") - no se le ofrece el switcher, ni el backend le
            // va a aceptar vender desde otra aunque se arme el request a mano.
            <div style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Warehouse size={11} /> Stock: {businessLocations.find((l) => l.id === stockLocationId)?.name ?? '—'}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flexShrink: 0, paddingBottom: 2 }}>
              {businessLocations.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => setStockLocationId(loc.id)}
                  className={`btn btn-xs ${stockLocationId === loc.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flexShrink: 0, gap: 5, whiteSpace: 'nowrap' }}
                >
                  <Warehouse size={11} /> Stock: {loc.name}
                </button>
              ))}
            </div>
          )}

          {/* Categories */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0, paddingBottom: 2 }}>
            <button
              onClick={() => setCatFilter('')}
              className={`btn btn-sm category-chip ${catFilter === '' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Todos
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCatFilter(catFilter === c.id ? '' : c.id)}
                className={`btn btn-sm category-chip ${catFilter === c.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{ whiteSpace: 'nowrap' }}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Product grid / tabla */}
          <div
            className={viewMode === 'grid' ? 'pos-products-grid' : undefined}
            style={
              viewMode === 'grid'
                ? { gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, alignContent: 'start' }
                : { display: 'flex', flexDirection: 'column', gap: 4 }
            }
          >
            {filtered.length === 0 ? (
              <div className="empty-state" style={viewMode === 'grid' ? { gridColumn: '1/-1' } : undefined}>
                <Package size={32} />
                <p>Sin resultados</p>
              </div>
            ) : viewMode === 'list' ? (
              visibleProducts.map((p) => {
                const stock = productStock(p);
                const stockRow = p.stock?.find((s) => s.businessLocationId === stockLocationId);
                const minStock = num(p.saleUnit === 'KG' ? stockRow?.minQuantityKg : stockRow?.minQuantity);
                const lowStock = stock <= minStock && minStock > 0 && !p.unlimitedStock;
                const noStock = stock <= 0 && !p.isService && !p.unlimitedStock;
                const retailPrice = resolvedPrice(p);

                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p, 'price')}
                    disabled={noStock}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                      background: 'var(--surface)',
                      border: `1px solid ${lowStock ? 'rgba(243,156,18,0.3)' : 'var(--border)'}`,
                      borderRadius: 6, padding: '8px 10px',
                      opacity: noStock ? 0.5 : 1,
                      cursor: noStock ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                        <span style={{ fontSize: 10, color: lowStock ? 'var(--warn)' : 'var(--text3)', fontFamily: 'var(--mono)' }}>
                          {lowStock && <AlertTriangle size={9} style={{ display: 'inline', marginRight: 2 }} />}
                          {p.unlimitedStock
                            ? 'Sin límite'
                            : noStock ? 'Sin stock' : `Stock: ${p.saleUnit === 'KG' ? `${fmtKg(stock)}kg` : stock}`}
                        </span>
                        {categoryName(p) !== 'Sin categoría' && (
                          <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {categoryName(p)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--text)', flexShrink: 0 }}>
                      {fmtMoney(retailPrice)}{p.saleUnit === 'KG' ? '/kg' : ''}
                    </span>
                  </button>
                );
              })
            ) : (
              visibleProducts.map((p) => {
                const stock = productStock(p);
                const stockRow = p.stock?.find((s) => s.businessLocationId === stockLocationId);
                const minStock = num(p.saleUnit === 'KG' ? stockRow?.minQuantityKg : stockRow?.minQuantity);
                const lowStock = stock <= minStock && minStock > 0 && !p.unlimitedStock;
                const noStock = stock <= 0 && !p.isService && !p.unlimitedStock;
                const retailPrice = resolvedPrice(p);

                return (
                  <div
                    key={p.id}
                    style={{
                      background: 'var(--surface)',
                      border: `1px solid ${noStock ? 'var(--border)' : lowStock ? 'rgba(243,156,18,0.3)' : 'var(--border)'}`,
                      borderRadius: 'var(--m-radius, 8px)', padding: '10px 10px 8px',
                      boxShadow: 'var(--m-shadow, none)',
                      opacity: noStock ? 0.5 : 1,
                    }}
                  >
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name} loading="lazy" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 5, marginBottom: 6 }} />
                    ) : (
                      <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 5, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                        <Package size={18} style={{ color: 'var(--text3)', opacity: 0.4 }} />
                      </div>
                    )}
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, marginBottom: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', minHeight: 30 }}>
                      {p.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 6 }}>
                      <span style={{ fontSize: 10, color: lowStock ? 'var(--warn)' : 'var(--text3)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                        {lowStock && <AlertTriangle size={9} style={{ display: 'inline', marginRight: 2 }} />}
                        {p.unlimitedStock
                          ? 'Sin límite'
                          : noStock ? 'Sin stock' : `Stock: ${p.saleUnit === 'KG' ? `${fmtKg(stock)}kg` : stock}`}
                      </span>
                      {categoryName(p) !== 'Sin categoría' && (
                        <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {categoryName(p)}
                        </span>
                      )}
                    </div>
                    {/* minmax(0, 1fr) y no 1fr: un track "1fr" no encoge por
                        debajo del min-content de su contenido, y en la
                        grilla mobile de 3 columnas (ver .pos-products-grid)
                        la tarjeta es angosta -- por eso se desbordaba.
                        Ademas, en mobile (ver .pos-price-grid/.pos-price-btn
                        en globals.css) los dos botones pasan de lado-a-lado
                        a apilados: aun con el ancho ya corregido, dos
                        precios uno al lado del otro en una tarjeta de ~114px
                        quedaban tan comprimidos que se superponian/pisaban
                        -- apilados, cada uno usa el ancho completo de la
                        tarjeta y el precio entra comodo. */}
                    <button
                      onClick={() => addToCart(p, 'price')}
                      disabled={noStock}
                      className="btn btn-secondary pos-price-btn"
                      style={{ width: '100%', flexDirection: 'column', gap: 0, padding: '6px 4px', height: 'auto', cursor: noStock ? 'not-allowed' : 'pointer' }}
                      title="Agregar al carrito"
                    >
                      <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                        {fmtMoney(retailPrice)}{p.saleUnit === 'KG' ? '/kg' : ''}
                      </span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
          {visibleProducts.length < filtered.length && (
            <button
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="btn btn-secondary btn-sm"
              style={{ flexShrink: 0, alignSelf: 'center' }}
            >
              Ver más productos · {filtered.length - visibleProducts.length} restantes
            </button>
          )}
        </div>

        {/* ─── Right: Cart ─── */}
        <div
          className={`pos-cart-wrap ${showMobileCart ? 'open' : ''}`}
          onClick={() => setShowMobileCart(false)}
        >
        <div className="pos-cart" data-step={mobileCartStep} onClick={(e) => e.stopPropagation()}>
          <div className="pos-cart-handle" />
          {/* Cart header */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setMobileCartStep('items')}
                className="btn btn-ghost btn-xs step-back-btn"
                style={{ padding: 4 }}
              >
                <ChevronLeft size={16} />
              </button>
              <ShoppingCart size={16} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>{mobileCartStep === 'checkout' ? 'Cobro' : 'Carrito'}</span>
              {cart.length > 0 && (
                <span className="badge badge-blue" style={{ fontSize: 10 }}>{cart.length}</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {cart.length > 0 && (
                <button
                  onClick={() => setConfirmState({ title: 'Limpiar carrito', message: '¿Vaciar el carrito?', onConfirm: resetPOS })}
                  className="btn btn-ghost btn-xs"
                  style={{ color: 'var(--danger)', gap: 4 }}
                >
                  <Trash2 size={12} /> Limpiar
                </button>
              )}
              <button
                onClick={() => setShowMobileCart(false)}
                className="btn btn-ghost btn-xs md:hidden"
                style={{ padding: 4 }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Client picker */}
          <div className="step-items-only" style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
            {showClientPicker ? (
              <div>
                <div style={{ position: 'relative', marginBottom: 6 }}>
                  <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                  <input
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Buscar cliente..."
                    style={{ paddingLeft: 28 }}
                    autoFocus
                  />
                </div>
                <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button
                    onClick={() => { setSelectedClient(null); setShowClientPicker(false); setClientSearch(''); }}
                    className="btn btn-ghost btn-xs"
                    style={{ justifyContent: 'flex-start', color: 'var(--text3)' }}
                  >
                    Consumidor final
                  </button>
                  {filteredClients.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedClient(c); setShowClientPicker(false); setClientSearch(''); }}
                      className="btn btn-ghost btn-xs"
                      style={{ justifyContent: 'flex-start', gap: 6 }}
                    >
                      <User size={11} />
                      <span>{c.nombre} {c.apellido}</span>
                      <span style={{ color: 'var(--text3)', fontSize: 10, marginLeft: 'auto' }}>{c.category}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => { setNewClientQuery(clientSearch); setShowClientPicker(false); }}
                    className="btn btn-ghost btn-xs"
                    style={{ justifyContent: 'flex-start', gap: 6, color: 'var(--accent)', borderTop: '1px solid var(--border)', marginTop: 2, paddingTop: 6 }}
                  >
                    <Plus size={11} />
                    <span>{clientSearch.trim() ? `Crear cliente "${clientSearch.trim()}"` : 'Crear cliente nuevo'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowClientPicker(true)}
                className="btn btn-ghost btn-xs"
                style={{ width: '100%', justifyContent: 'flex-start', gap: 6 }}
              >
                <User size={12} style={{ color: selectedClient ? 'var(--accent2)' : 'var(--text3)' }} />
                <span style={{ color: selectedClient ? 'var(--text)' : 'var(--text3)' }}>
                  {selectedClient ? `${selectedClient.nombre} ${selectedClient.apellido}` : 'Consumidor final'}
                </span>
                {selectedClient && (
                  <span className="badge badge-cyan" style={{ fontSize: 9, marginLeft: 'auto' }}>{selectedClient.category}</span>
                )}
              </button>
            )}
          </div>

          {/* Lista de precios */}
          {priceLists.some((pl) => !pl.isDefault) && (
            <div className="step-items-only" style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
              <select value={priceListId} onChange={(e) => setPriceListId(e.target.value)} style={{ padding: '5px 9px', fontSize: 12 }}>
                <option value="">Lista: Minorista (default)</option>
                {priceLists.filter((pl) => !pl.isDefault).map((pl) => (
                  <option key={pl.id} value={pl.id}>Lista: {pl.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Costo de envío (manual, opcional) */}
          <div className="step-checkout-only" style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text3)' }}>
              Costo de envío (opcional)
              <input
                type="number"
                min="0"
                step="any"
                value={deliveryAmountInput}
                onChange={(e) => applyDeliveryAmount(e.target.value)}
                placeholder="0"
                style={{ width: 100, padding: '4px 8px', fontSize: 12 }}
              />
            </label>
          </div>

          {/* Cart items */}
          <div className="step-items-only" style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
            {cart.length === 0 ? (
              <div className="empty-state" style={{ padding: '32px 20px' }}>
                <ShoppingCart size={28} />
                <p>Carrito vacío</p>
              </div>
            ) : (
              cart.map((item, idx) => {
                const price = item.manualPrice ?? productPrice(item.product, item.priceType);
                const qty = item.product.saleUnit === 'KG' ? num(item.quantityKg) : item.quantity;
                return (
                  <div key={idx} style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.product.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                        {fmtMoney(price)} × {item.product.saleUnit === 'KG' ? `${qty}kg` : qty}
                        {' = '}
                        <span style={{ color: 'var(--text2)', fontWeight: 600 }}>{fmtMoney(price * qty)}</span>
                      </div>
                    </div>
                    {item.product.saleUnit !== 'KG' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => updateQty(idx, -1)} className="btn btn-ghost btn-xs" style={{ padding: 3 }}><Minus size={11} /></button>
                        <span style={{ fontSize: 12, fontWeight: 700, minWidth: 20, textAlign: 'center', fontFamily: 'var(--mono)' }}>{item.quantity}</span>
                        <button onClick={() => updateQty(idx, 1)} className="btn btn-ghost btn-xs" style={{ padding: 3 }}><Plus size={11} /></button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{qty}kg</span>
                    )}
                    <button onClick={() => removeFromCart(idx)} className="btn btn-ghost btn-xs" style={{ padding: 3, color: 'var(--danger)' }}>
                      <X size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Continuar al cobro — mobile only, paso "items" del carrito */}
          <div className="step-continue-btn" style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text2)' }}>
              <span>Subtotal</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmtMoney(total)}</span>
            </div>
            <button
              onClick={() => setMobileCartStep('checkout')}
              disabled={cart.length === 0}
              className="btn btn-primary"
              style={{ width: '100%', fontSize: 14, padding: '12px 16px' }}
            >
              Continuar al cobro
            </button>
          </div>

          {/* Totals + controls */}
          <div className="step-checkout-only" style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Discount / surcharge */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                onClick={() => setDiscountMode(discountMode === 'DISCOUNT' ? 'SURCHARGE' : 'DISCOUNT')}
                className="btn btn-secondary btn-xs"
                style={{
                  padding: '4px 8px',
                  flexShrink: 0,
                  color: discountMode === 'SURCHARGE' ? 'var(--accent)' : 'var(--warn)',
                }}
                title={discountMode === 'DISCOUNT' ? 'Cambiar a recargo (suma al total)' : 'Cambiar a descuento (resta del total)'}
              >
                {discountMode === 'DISCOUNT' ? <Minus size={12} /> : <Plus size={12} />}
              </button>
              <button
                onClick={() => setDiscountType(discountType === 'PERCENTAGE' ? 'FIXED' : 'PERCENTAGE')}
                className="btn btn-secondary btn-xs"
                style={{ padding: '4px 8px', flexShrink: 0 }}
                title="Cambiar tipo de descuento/recargo"
              >
                {discountType === 'PERCENTAGE' ? <Percent size={12} /> : <DollarSign size={12} />}
              </button>
              <input
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={
                  discountMode === 'DISCOUNT'
                    ? (discountType === 'PERCENTAGE' ? 'Descuento %' : 'Descuento $')
                    : (discountType === 'PERCENTAGE' ? 'Recargo %' : 'Recargo $')
                }
                type="number" min="0" step="any"
                style={{ padding: '5px 9px' }}
              />
            </div>

            {/* Summary */}
            {(() => {
              const ivaByRate: Record<number, number> = {};
              let netoTotal = 0;
              cart.forEach((item) => {
                const price = item.manualPrice ?? productPrice(item.product, item.priceType);
                const qty = item.product.saleUnit === 'KG' ? num(item.quantityKg) : item.quantity;
                const itemSubtotal = price * qty;
                const rate = num((item.product as any).ivaRate ?? 21);
                const neto = itemSubtotal / (1 + rate / 100);
                const iva = itemSubtotal - neto;
                netoTotal += neto;
                ivaByRate[rate] = (ivaByRate[rate] ?? 0) + iva;
              });
              const ivaEntries = Object.entries(ivaByRate).filter(([, v]) => v > 0.01);
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)' }}>
                    <span>Neto</span>
                    <span style={{ fontFamily: 'var(--mono)' }}>{fmtMoney(netoTotal)}</span>
                  </div>
                  {ivaEntries.map(([rate, ivaAmt]) => (
                    <div key={rate} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)' }}>
                      <span>IVA {rate}%</span>
                      <span style={{ fontFamily: 'var(--mono)' }}>{fmtMoney(ivaAmt)}</span>
                    </div>
                  ))}
                  {discountAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--warn)' }}>
                      <span>Descuento</span>
                      <span style={{ fontFamily: 'var(--mono)' }}>−{fmtMoney(discountAmount)}</span>
                    </div>
                  )}
                  {discountAmount < 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--accent)' }}>
                      <span>Recargo</span>
                      <span style={{ fontFamily: 'var(--mono)' }}>+{fmtMoney(-discountAmount)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: 'var(--text)', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                    <span>Total</span>
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmtMoney(total)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Payments */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => setPaymentMode('single')}
                  className={`btn btn-xs ${paymentMode === 'single' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                >
                  Un método
                </button>
                <button
                  onClick={() => setPaymentMode('multi')}
                  className={`btn btn-xs ${paymentMode === 'multi' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                >
                  Múltiples / parcial
                </button>
              </div>

              {paymentMode === 'single' ? (
                <>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    style={{ padding: '6px 8px' }}
                  >
                    {ALL_METHODS.map((m) => (
                      <option key={m.method} value={m.method}>{m.label}</option>
                    ))}
                  </select>
                  {paymentMethod === 'CUENTA_CORRIENTE' && !selectedClient && (
                    <div style={{ fontSize: 11, color: 'var(--warn)' }}>Elegí un cliente para vender en cuenta corriente.</div>
                  )}
                </>
              ) : (
                <>
                  {payments.map((pay, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                      <select
                        value={pay.method}
                        onChange={(e) => updatePayment(idx, 'method', e.target.value)}
                        style={{ padding: '4px 6px', flex: 1 }}
                      >
                        {ALL_METHODS.map((m) => (
                          <option key={m.method} value={m.method}>{m.label}</option>
                        ))}
                      </select>
                      <input
                        type="number" min="0" step="any"
                        value={pay.amount || ''}
                        onChange={(e) => updatePayment(idx, 'amount', Number(e.target.value))}
                        placeholder={idx === 0 ? fmtMoney(total).replace('$', '') : '0'}
                        style={{ padding: '4px 8px', width: 80, flexShrink: 0 }}
                      />
                      {payments.length > 1 && (
                        <button onClick={() => removePayment(idx)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)', padding: 3 }}>
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={addPaymentMethod} className="btn btn-ghost btn-xs" style={{ justifyContent: 'flex-start', color: 'var(--text3)', fontSize: 11 }}>
                    <Plus size={11} /> Agregar método de pago
                  </button>
                  {totalPaid < total && (
                    <div style={{ fontSize: 11, color: 'var(--warn)' }}>
                      {selectedClient ? `Faltan ${fmtMoney(total - totalPaid)} — quedan como saldo en cuenta corriente.` : `Faltan ${fmtMoney(total - totalPaid)}. Elegí un cliente para dejarlo en cuenta corriente.`}
                    </div>
                  )}
                  {change > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--success)', fontFamily: 'var(--mono)', textAlign: 'right' }}>
                      Vuelto: {fmtMoney(change)}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Submit */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => submitSale('PENDING')}
                disabled={cart.length === 0 || submitting}
                className="btn btn-secondary"
                title="Guarda la venta sin confirmarla — queda pendiente para completarla después desde Historial de Ventas"
                style={{ fontSize: 13, padding: '11px 12px', flexShrink: 0 }}
              >
                Guardar pendiente
              </button>
              <button
                onClick={() => submitSale('COMPLETED')}
                disabled={
                  cart.length === 0 || submitting ||
                  (paymentMode === 'single' && paymentMethod === 'CUENTA_CORRIENTE' && !selectedClient) ||
                  (paymentMode === 'multi' && totalPaid < total && !selectedClient)
                }
                className="btn btn-primary"
                style={{ flex: 1, fontSize: 14, padding: '11px 16px' }}
              >
                {submitting ? (
                  <span className="spinner" style={{ width: 16, height: 16 }} />
                ) : (
                  <><Check size={15} /> Confirmar venta {total > 0 ? `— ${fmtMoney(total)}` : ''}</>
                )}
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Mobile cart bar — siempre visible, fija abajo, por encima de todo */}
      {!showMobileCart && (
        <button className="pos-mobile-bar" onClick={() => { setShowMobileCart(true); setMobileCartStep('items'); }}>
          <span className="pos-mobile-bar-left">
            <ShoppingCart size={18} />
            <span>
              <b>Carrito</b>
              <small>{cart.length === 0 ? 'Tocar para abrir' : `${cart.length} ${cart.length === 1 ? 'item' : 'items'}`}</small>
            </span>
          </span>
          <span className="pos-mobile-bar-right">
            <b>{fmtMoney(total)}</b>
            <small>{cart.length > 0 ? 'Finalizar' : ' '}</small>
          </span>
        </button>
      )}

      {/* KG Modal */}
      {kgModal && (
        <div className="modal-overlay" onClick={() => setKgModal(null)}>
          <div className="modal" style={{ maxWidth: 300 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontSize: 15, fontWeight: 700 }}>{kgModal.product.name}</span>
              <button onClick={() => setKgModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Cantidad (kg)</label>
                <input
                  type="number" min="0.01" step="0.01"
                  value={kgModal.qty}
                  onChange={(e) => setKgModal({ ...kgModal, qty: e.target.value })}
                  placeholder="Ej: 1.5"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && confirmKgAdd()}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setKgModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={confirmKgAdd} className="btn btn-primary btn-sm">Agregar</button>
            </div>
          </div>
        </div>
      )}

      {/* Scanner Modal */}
      {skuScannerOpen && (
        <div className="modal-overlay" onClick={closeSkuScanner}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 700 }}>Escanear producto</span>
              <button onClick={closeSkuScanner} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12, color: 'var(--text2)' }}>
                <ScanBarcode size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <b style={{ display: 'block', color: 'var(--text)' }}>Apuntá al código de barras o QR</b>
                  Cuando lo detecte, agrega el producto directo al carrito.
                </div>
              </div>
              <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#000', minHeight: 220 }}>
                <div id={SKU_SCANNER_ELEMENT_ID} style={{ width: '100%' }} />
                {scannerLoading && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#fff' }}>
                    <span className="spinner" />
                    <p style={{ fontSize: 12 }}>Iniciando cámara...</p>
                  </div>
                )}
              </div>
              {scannerError ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--danger)' }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{scannerError}</span>
                </div>
              ) : (
                <p style={{ fontSize: 11, color: 'var(--text3)' }}>Tip: acercá el código, evitá reflejos y usá buena luz.</p>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={closeSkuScanner} className="btn btn-secondary btn-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <ClientFormModal
        open={newClientQuery !== null}
        onClose={() => setNewClientQuery(null)}
        initialQuery={newClientQuery ?? ''}
        onCreated={(client) => {
          setClients((prev) => [client, ...prev]);
          setSelectedClient(client);
          setClientSearch('');
          setNewClientQuery(null);
        }}
      />

      <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
    </AppLayout>
  );
}
