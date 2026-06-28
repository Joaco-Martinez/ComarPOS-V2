/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import type { CartItem, Client, DiscountType, PaymentMethod, Product, ProductCategory, ReceiptType, SalePayment } from '@/types';
import { categoryName, clientName, fmtMoney, normalizeArray, num, productPrice } from '@/lib/helpers';
import {
  AlertTriangle, Check, Minus, Package, Plus, RefreshCcw,
  ScanBarcode, Search, ShoppingCart, Trash2, X, User, Percent,
  DollarSign, CreditCard, Banknote, Smartphone,
} from 'lucide-react';

type PaymentMode = PaymentMethod;

const ALL_METHODS: { method: PaymentMode; label: string; icon: React.ReactNode }[] = [
  { method: 'EFECTIVO',      label: 'Efectivo',      icon: <Banknote size={14} /> },
  { method: 'TRANSFERENCIA', label: 'Transferencia', icon: <Smartphone size={14} /> },
  { method: 'TARJETA',       label: 'Tarjeta',       icon: <CreditCard size={14} /> },
  { method: 'QR_MERCADOPAGO',label: 'MercadoPago',   icon: <Smartphone size={14} /> },
  { method: 'QR_NACION',    label: 'QR Nación',     icon: <Smartphone size={14} /> },
  { method: 'CUENTA_CORRIENTE', label: 'Cta. Cte.',  icon: <CreditCard size={14} /> },
];

type KgModal = { product: Product; qty: string } | null;
type ConfirmState = { title: string; message: string; onConfirm: () => void } | null;

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [receiptType, setReceiptType] = useState<ReceiptType>('TICKET');
  const [discountType, setDiscountType] = useState<DiscountType>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('');
  const [payments, setPayments] = useState<SalePayment[]>([{ method: 'EFECTIVO', amount: 0 }]);
  const [kgModal, setKgModal] = useState<KgModal>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [pr, cr, clr] = await Promise.all([
          api.get('/products', { params: { isActive: true, limit: 500 } }),
          api.get('/categories'),
          api.get('/clients', { params: { limit: 200 } }),
        ]);
        setProducts(normalizeArray<Product>(pr.data));
        setCategories(normalizeArray<ProductCategory>(cr.data).filter((c) => c.isActive));
        setClients(normalizeArray<Client>(clr.data));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    let p = products.filter((x) => x.isActive !== false);
    if (catFilter) p = p.filter((x) => x.categoryId === catFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      p = p.filter((x) => x.name.toLowerCase().includes(q) || x.sku?.toLowerCase().includes(q));
    }
    return p;
  }, [products, catFilter, search]);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients.slice(0, 8);
    return clients.filter((c) =>
      c.nombre.toLowerCase().includes(q) ||
      c.apellido.toLowerCase().includes(q) ||
      c.dni.includes(q)
    ).slice(0, 8);
  }, [clients, clientSearch]);

  const priceType = useMemo<CartItem['priceType']>(() => {
    if (!selectedClient) return 'price';
    if (selectedClient.category === 'Mayorista') return 'wholesalePrice';
    if (selectedClient.category === 'Cliente') return 'clientPrice';
    return 'price';
  }, [selectedClient]);

  const addToCart = (product: Product) => {
    if (product.saleUnit === 'KG') {
      setKgModal({ product, qty: '' });
      return;
    }
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.product.id === product.id && i.priceType === priceType);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { product, quantity: 1, priceType }];
    });
  };

  const confirmKgAdd = () => {
    if (!kgModal) return;
    const qty = parseFloat(kgModal.qty);
    if (!qty || qty <= 0) { setKgModal(null); return; }
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.product.id === kgModal.product.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantityKg: num(next[idx].quantityKg) + qty };
        return next;
      }
      return [...prev, { product: kgModal.product, quantity: 1, quantityKg: qty, priceType }];
    });
    setKgModal(null);
  };

  const updateQty = (idx: number, delta: number) => {
    setCart((prev) => {
      const next = [...prev];
      const newQty = next[idx].quantity + delta;
      if (newQty <= 0) return prev.filter((_, i) => i !== idx);
      next[idx] = { ...next[idx], quantity: newQty };
      return next;
    });
  };

  const removeFromCart = (idx: number) => setCart((prev) => prev.filter((_, i) => i !== idx));

  const subtotal = cart.reduce((acc, item) => {
    const price = item.manualPrice ?? productPrice(item.product, item.priceType);
    const qty = item.product.saleUnit === 'KG' ? num(item.quantityKg) : item.quantity;
    return acc + price * qty;
  }, 0);

  const discountAmount = useMemo(() => {
    const dv = num(discountValue);
    if (!dv) return 0;
    if (discountType === 'PERCENTAGE') return subtotal * (dv / 100);
    return Math.min(dv, subtotal);
  }, [subtotal, discountType, discountValue]);

  const total = Math.max(0, subtotal - discountAmount);

  const totalPaid = payments.reduce((a, p) => a + num(p.amount), 0);
  const change = Math.max(0, totalPaid - total);

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
    setPayments([{ method: 'EFECTIVO', amount: 0 }]);
    setReceiptType('TICKET');
    setSearch('');
    searchRef.current?.focus();
  };

  const submitSale = async () => {
    if (cart.length === 0) return;
    if (totalPaid < total) {
      alert(`Faltan $${fmtMoney(total - totalPaid)} para cubrir el total.`);
      return;
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
        receiptType,
        paymentMethod: payments[0].method,
        payments: payments.map((p) => ({ method: p.method, amount: num(p.amount) })),
        ...(selectedClient && { clientId: selectedClient.id }),
        ...(discountValue && { discountType, discountValue: num(discountValue) }),
      };

      await api.post('/sales', body);
      setSuccessMsg(`Venta registrada — ${fmtMoney(total)}`);
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
          position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
          background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)',
          color: 'var(--success)', borderRadius: 8, padding: '10px 22px',
          fontSize: 14, fontWeight: 600, animation: 'fadeIn 0.3s ease',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Check size={16} /> {successMsg}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 100px)', overflow: 'hidden' }}>

        {/* ─── Left: Product grid ─── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto por nombre o SKU..."
              style={{ paddingLeft: 34, paddingRight: 36 }}
              autoFocus
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 2 }}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* Categories */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0, paddingBottom: 2 }}>
            <button
              onClick={() => setCatFilter('')}
              className={`btn btn-sm ${catFilter === '' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Todos
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCatFilter(catFilter === c.id ? '' : c.id)}
                className={`btn btn-sm ${catFilter === c.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{ whiteSpace: 'nowrap' }}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Product grid */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 8, alignContent: 'start' }}>
            {filtered.length === 0 ? (
              <div className="empty-state" style={{ gridColumn: '1/-1' }}>
                <Package size={32} />
                <p>Sin resultados</p>
              </div>
            ) : (
              filtered.map((p) => {
                const stock = p.saleUnit === 'KG' ? num(p.stockLocalKg) : num(p.stockLocal);
                const price = productPrice(p, priceType);
                const lowStock = stock <= num(p.saleUnit === 'KG' ? p.minStockKg : p.minStock) && num(p.saleUnit === 'KG' ? p.minStockKg : p.minStock) > 0;
                const noStock = p.saleUnit !== 'KG' && stock <= 0 && !p.isService;

                return (
                  <button
                    key={p.id}
                    onClick={() => !noStock && addToCart(p)}
                    disabled={noStock}
                    style={{
                      background: 'var(--surface)',
                      border: `1px solid ${noStock ? 'var(--border)' : lowStock ? 'rgba(243,156,18,0.3)' : 'var(--border)'}`,
                      borderRadius: 8, padding: '10px 10px 8px',
                      textAlign: 'left', cursor: noStock ? 'not-allowed' : 'pointer',
                      opacity: noStock ? 0.4 : 1,
                      transition: 'all 0.12s',
                    }}
                    onMouseEnter={(e) => { if (!noStock) e.currentTarget.style.borderColor = '#2563EB'; e.currentTarget.style.background = 'var(--surface2)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = lowStock ? 'rgba(243,156,18,0.3)' : 'var(--border)'; e.currentTarget.style.background = 'var(--surface)'; }}
                  >
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name} style={{ width: '100%', height: 72, objectFit: 'cover', borderRadius: 5, marginBottom: 6 }} />
                    ) : (
                      <div style={{ width: '100%', height: 52, borderRadius: 5, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                        <Package size={20} style={{ color: 'var(--text3)', opacity: 0.4 }} />
                      </div>
                    )}
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, marginBottom: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>
                      {fmtMoney(price)}{p.saleUnit === 'KG' ? '/kg' : ''}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: lowStock ? 'var(--warn)' : 'var(--text3)', fontFamily: 'var(--mono)' }}>
                        {lowStock && <AlertTriangle size={9} style={{ display: 'inline', marginRight: 2 }} />}
                        Stock: {p.saleUnit === 'KG' ? `${stock}kg` : stock}
                      </span>
                      <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                        {categoryName(p).slice(0, 8)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ─── Right: Cart ─── */}
        <div style={{
          width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
        }}>
          {/* Cart header */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShoppingCart size={16} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Carrito</span>
              {cart.length > 0 && (
                <span className="badge badge-blue" style={{ fontSize: 10 }}>{cart.length}</span>
              )}
            </div>
            {cart.length > 0 && (
              <button
                onClick={() => setConfirm({ title: 'Limpiar carrito', message: '¿Vaciar el carrito?', onConfirm: resetPOS })}
                className="btn btn-ghost btn-xs"
                style={{ color: 'var(--danger)', gap: 4 }}
              >
                <Trash2 size={12} /> Limpiar
              </button>
            )}
          </div>

          {/* Client picker */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
            {showClientPicker ? (
              <div>
                <div style={{ position: 'relative', marginBottom: 6 }}>
                  <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                  <input
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Buscar cliente..."
                    style={{ paddingLeft: 28, fontSize: 12 }}
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

          {/* Cart items */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
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

          {/* Totals + controls */}
          <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Receipt type */}
            <div style={{ display: 'flex', gap: 4 }}>
              {(['TICKET', 'FACTURA'] as ReceiptType[]).map((rt) => (
                <button
                  key={rt}
                  onClick={() => setReceiptType(rt)}
                  className={`btn btn-xs ${receiptType === rt ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                >
                  {rt}
                </button>
              ))}
            </div>

            {/* Discount */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                onClick={() => setDiscountType(discountType === 'PERCENTAGE' ? 'FIXED' : 'PERCENTAGE')}
                className="btn btn-secondary btn-xs"
                style={{ padding: '4px 8px', flexShrink: 0 }}
                title="Cambiar tipo de descuento"
              >
                {discountType === 'PERCENTAGE' ? <Percent size={12} /> : <DollarSign size={12} />}
              </button>
              <input
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === 'PERCENTAGE' ? 'Descuento %' : 'Descuento $'}
                type="number" min="0" step="any"
                style={{ fontSize: 12, padding: '5px 9px' }}
              />
            </div>

            {/* Summary */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)' }}>
                <span>Subtotal</span>
                <span style={{ fontFamily: 'var(--mono)' }}>{fmtMoney(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--warn)' }}>
                  <span>Descuento</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>−{fmtMoney(discountAmount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: 'var(--text)', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                <span>Total</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmtMoney(total)}</span>
              </div>
            </div>

            {/* Payments */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {payments.map((pay, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <select
                    value={pay.method}
                    onChange={(e) => updatePayment(idx, 'method', e.target.value)}
                    style={{ fontSize: 11, padding: '4px 6px', flex: 1 }}
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
                    style={{ fontSize: 12, padding: '4px 8px', width: 80, flexShrink: 0 }}
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
              {change > 0 && (
                <div style={{ fontSize: 12, color: 'var(--success)', fontFamily: 'var(--mono)', textAlign: 'right' }}>
                  Vuelto: {fmtMoney(change)}
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              onClick={submitSale}
              disabled={cart.length === 0 || submitting || totalPaid < total}
              className="btn btn-primary"
              style={{ width: '100%', fontSize: 14, padding: '11px 16px' }}
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

      {/* Confirm Modal */}
      {confirm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 340 }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700 }}>{confirm.title}</span>
              <button onClick={() => setConfirm(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body"><p style={{ fontSize: 14, color: 'var(--text2)' }}>{confirm.message}</p></div>
            <div className="modal-footer">
              <button onClick={() => setConfirm(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={() => { confirm.onConfirm(); setConfirm(null); }} className="btn btn-danger btn-sm">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
