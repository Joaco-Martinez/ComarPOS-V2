/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { BusinessLocation, Client, PriceList, Product, Sale } from '@/types';
import { clientName, fmtDate, fmtMoney, normalizeArray, num } from '@/lib/helpers';
import { FileText, Plus, Trash2, Search, Download, RefreshCcw, X } from 'lucide-react';

type CartLine = {
  product: Product;
  quantity: number;
  quantityKg?: number;
  manualPrice?: string;
};

type DiscountRow = {
  label: string;
  type: 'PERCENTAGE' | 'FIXED';
  value: string;
  applied: boolean;
};

type PriceOverride = { price: number; pricePerKg: number | null };

export default function CotizacionesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [businessLocations, setBusinessLocations] = useState<BusinessLocation[]>([]);
  const [pending, setPending] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPending, setLoadingPending] = useState(true);

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [clientId, setClientId] = useState('');
  const [priceListId, setPriceListId] = useState('');
  const [priceOverrides, setPriceOverrides] = useState<Record<string, PriceOverride>>({});
  const [stockLocationId, setStockLocationId] = useState('');
  const [discounts, setDiscounts] = useState<DiscountRow[]>([]);
  const [accumulate, setAccumulate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [pr, clr, plr, blr] = await Promise.all([
        api.get('/products', { params: { isActive: true, limit: 500 } }).catch(() => null),
        api.get('/clients', { params: { limit: 300 } }).catch(() => null),
        api.get('/price-lists').catch(() => null),
        api.get('/business-locations').catch(() => null),
      ]);
      if (pr) setProducts(normalizeArray<Product>(pr.data));
      if (clr) setClients(normalizeArray<Client>(clr.data));
      if (plr) setPriceLists(normalizeArray<PriceList>(plr.data));
      if (blr) {
        const locations = normalizeArray<BusinessLocation>(blr.data).filter((l) => l.isActive);
        setBusinessLocations(locations);
        setStockLocationId(locations.find((l) => l.isDefault)?.id ?? locations[0]?.id ?? '');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadPending = async () => {
    setLoadingPending(true);
    try {
      const { data } = await api.get('/sales/pending');
      setPending(normalizeArray<Sale>(data));
    } finally {
      setLoadingPending(false);
    }
  };

  useEffect(() => { load(); loadPending(); }, []);

  const selectedClient = clients.find((c) => c.id === clientId) || null;

  // Al elegir un cliente, precarga la lista de precios asignada (si tiene).
  useEffect(() => {
    if (selectedClient) setPriceListId(selectedClient.priceListId ?? '');
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trae los precios override de la lista elegida (si no es la default,
  // que ya coincide con el precio del producto).
  useEffect(() => {
    const list = priceLists.find((pl) => pl.id === priceListId);
    if (!priceListId || list?.isDefault) {
      setPriceOverrides({});
      return;
    }
    api
      .get(`/price-lists/${priceListId}`)
      .then(({ data }) => {
        const map: Record<string, PriceOverride> = {};
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
      return override?.pricePerKg ?? num(product.pricePerKg);
    }
    return override?.price ?? num(product.price);
  };

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
      .slice(0, 15);
  }, [search, products]);

  const addProduct = (product: Product) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.product.id === product.id);
      if (idx >= 0) {
        const next = [...prev];
        if (product.saleUnit === 'KG') {
          next[idx] = { ...next[idx], quantityKg: num(next[idx].quantityKg) + 1 };
        } else {
          next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        }
        return next;
      }
      return [...prev, { product, quantity: 1, quantityKg: product.saleUnit === 'KG' ? 1 : undefined }];
    });
    setSearch('');
  };

  const updateLine = (productId: string, patch: Partial<CartLine>) => {
    setCart((prev) => prev.map((l) => (l.product.id === productId ? { ...l, ...patch } : l)));
  };

  const removeLine = (productId: string) => setCart((prev) => prev.filter((l) => l.product.id !== productId));

  const lineUnitPrice = (line: CartLine) => (line.manualPrice !== undefined && line.manualPrice !== '' ? num(line.manualPrice) : resolvedPrice(line.product));

  const lineSubtotal = (line: CartLine) => {
    const price = lineUnitPrice(line);
    const qty = line.product.saleUnit === 'KG' ? num(line.quantityKg) : line.quantity;
    return price * qty;
  };

  const subtotal = cart.reduce((acc, line) => acc + lineSubtotal(line), 0);

  const activeDiscounts = discounts.filter((d) => d.applied && num(d.value) > 0);

  const discountAmount = useMemo(() => {
    if (activeDiscounts.length === 0 || subtotal <= 0) return 0;
    const amountOf = (d: DiscountRow, base: number) =>
      d.type === 'PERCENTAGE' ? base * (num(d.value) / 100) : num(d.value);
    if (!accumulate) return Math.min(amountOf(activeDiscounts[0], subtotal), subtotal);
    let remaining = subtotal;
    for (const d of activeDiscounts) remaining = Math.max(0, remaining - amountOf(d, remaining));
    return subtotal - remaining;
  }, [activeDiscounts, subtotal, accumulate]);

  const total = Math.max(0, subtotal - discountAmount);

  const addDiscount = () => setDiscounts((prev) => [...prev, { label: '', type: 'PERCENTAGE', value: '', applied: true }]);
  const updateDiscount = (idx: number, patch: Partial<DiscountRow>) =>
    setDiscounts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  const removeDiscount = (idx: number) => setDiscounts((prev) => prev.filter((_, i) => i !== idx));

  const resetBuilder = () => {
    setCart([]);
    setClientId('');
    setPriceListId('');
    setDiscounts([]);
    setAccumulate(false);
  };

  const save = async () => {
    if (cart.length === 0) {
      toast.error('Agregá al menos un producto');
      return;
    }
    if (!stockLocationId) {
      toast.error('No hay una sucursal/depósito configurado para reservar el stock');
      return;
    }
    setSaving(true);
    try {
      const items = cart.map((line) => ({
        productId: line.product.id,
        quantity: line.product.saleUnit === 'KG' ? 1 : line.quantity,
        quantityKg: line.product.saleUnit === 'KG' ? num(line.quantityKg) : undefined,
        ...(line.manualPrice !== undefined && line.manualPrice !== ''
          ? { price: num(line.manualPrice), priceType: 'MANUAL' }
          : {}),
      }));

      const body: Record<string, any> = {
        items,
        receiptType: 'TICKET',
        paymentMethod: 'EFECTIVO',
        status: 'PENDING',
        stockLocationId,
        ...(clientId && { clientId }),
        ...(priceListId && { priceListId }),
        ...(activeDiscounts.length > 0 && {
          discounts: activeDiscounts.map((d) => ({
            label: d.label.trim() || undefined,
            type: d.type,
            value: num(d.value),
            applied: true,
          })),
          discountsAccumulate: accumulate,
        }),
      };

      await api.post('/sales', body);
      toast.success(`Cotización guardada — ${fmtMoney(total)}`);
      resetBuilder();
      loadPending();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al guardar la cotización');
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async (sale: Sale) => {
    setDownloadingId(sale.id);
    try {
      const res = await api.get(`/sales/${sale.id}/cotizacion-pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cotizacion-${sale.id.slice(-8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('No se pudo generar el PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) {
    return (
      <AppLayout title="Cotizaciones" subtitle="Armá presupuestos con descuentos y listas de precios">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
          <div className="spinner" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Cotizaciones" subtitle="Armá presupuestos con descuentos y listas de precios">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        {/* Carrito */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Productos</div>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text3)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto por nombre o SKU..."
              style={{ paddingLeft: 30 }}
            />
            {filteredProducts.length > 0 && (
              <div className="card" style={{ position: 'absolute', zIndex: 10, top: 38, left: 0, right: 0, maxHeight: 260, overflowY: 'auto', padding: 4 }}>
                {filteredProducts.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => addProduct(p)}
                    style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontSize: 13 }}>{p.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{fmtMoney(resolvedPrice(p))}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {cart.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              <FileText size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
              <div>Todavía no agregaste productos</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cart.map((line) => (
                <div key={line.product.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.product.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtMoney(lineUnitPrice(line))} / {line.product.saleUnit === 'KG' ? 'kg' : 'un.'}</div>
                  </div>
                  {line.product.saleUnit === 'KG' ? (
                    <input
                      type="number" min="0" step="0.01"
                      value={line.quantityKg ?? ''}
                      onChange={(e) => updateLine(line.product.id, { quantityKg: Number(e.target.value) })}
                      style={{ width: 70 }}
                    />
                  ) : (
                    <input
                      type="number" min="1"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.product.id, { quantity: Math.max(1, Number(e.target.value)) })}
                      style={{ width: 60 }}
                    />
                  )}
                  <input
                    type="number" min="0"
                    placeholder="precio"
                    value={line.manualPrice ?? ''}
                    onChange={(e) => updateLine(line.product.id, { manualPrice: e.target.value })}
                    title="Precio manual (opcional, pisa el precio de la lista)"
                    style={{ width: 90 }}
                  />
                  <div style={{ width: 90, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700 }}>
                    {fmtMoney(lineSubtotal(line))}
                  </div>
                  <button onClick={() => removeLine(line.product.id)} className="btn btn-ghost btn-xs"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cliente, lista de precios, descuentos y totales */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">Cliente</label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Consumidor final</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{clientName(c)}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: businessLocations.length > 1 ? 10 : 0 }}>
              <label className="form-label">Lista de precios</label>
              <select value={priceListId} onChange={(e) => setPriceListId(e.target.value)}>
                <option value="">Minorista (default)</option>
                {priceLists.filter((pl) => !pl.isDefault).map((pl) => (
                  <option key={pl.id} value={pl.id}>{pl.name}</option>
                ))}
              </select>
            </div>
            {businessLocations.length > 1 && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Reservar stock desde</label>
                <select value={stockLocationId} onChange={(e) => setStockLocationId(e.target.value)}>
                  {businessLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>Descuentos</span>
              <button onClick={addDiscount} className="btn btn-secondary btn-xs" style={{ gap: 4 }}><Plus size={12} /> Agregar</button>
            </div>
            {discounts.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Sin descuentos cargados.</div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
                  {discounts.map((d, idx) => (
                    <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                        <input
                          type="checkbox"
                          checked={d.applied}
                          onChange={(e) => updateDiscount(idx, { applied: e.target.checked })}
                          title="Aplicar este descuento"
                          style={{ width: 14, height: 14, flex: '0 0 auto', marginTop: 9 }}
                        />
                        <textarea
                          placeholder="Ej: Descuento del 10% abonando en efectivo"
                          value={d.label}
                          onChange={(e) => updateDiscount(idx, { label: e.target.value })}
                          rows={1}
                          style={{ flex: 1, minWidth: 0, resize: 'vertical' }}
                        />
                        <button onClick={() => removeDiscount(idx)} className="btn btn-ghost btn-xs" style={{ flex: '0 0 auto' }}><X size={12} /></button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 20 }}>
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>Valor:</span>
                        <select value={d.type} onChange={(e) => updateDiscount(idx, { type: e.target.value as DiscountRow['type'] })} style={{ width: 60 }}>
                          <option value="PERCENTAGE">%</option>
                          <option value="FIXED">$</option>
                        </select>
                        <input
                          type="number" min="0"
                          value={d.value}
                          onChange={(e) => updateDiscount(idx, { value: e.target.value })}
                          style={{ width: 90 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {discounts.length > 1 && (
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
                    <input type="checkbox" checked={accumulate} onChange={(e) => setAccumulate(e.target.checked)} style={{ width: 14, height: 14, flex: '0 0 auto', marginTop: 2 }} />
                    <span>
                      Acumular todos los descuentos marcados (se suman entre sí).
                      Si lo dejás sin marcar, se muestran en la cotización como opciones alternativas
                      (ej. 10% pagando en efectivo o 5% con tarjeta) y el total se calcula con el primero.
                    </span>
                  </label>
                )}
              </>
            )}
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>
              <span>Subtotal</span><span style={{ fontFamily: 'var(--mono)' }}>{fmtMoney(subtotal)}</span>
            </div>
            {discountAmount > 0.01 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>
                <span>Descuento</span><span style={{ fontFamily: 'var(--mono)' }}>- {fmtMoney(discountAmount)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <span>Total</span><span style={{ fontFamily: 'var(--mono)' }}>{fmtMoney(total)}</span>
            </div>
            <button
              onClick={save}
              disabled={saving || cart.length === 0}
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 12 }}
            >
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Guardar cotización'}
            </button>
          </div>
        </div>
      </div>

      {/* Cotizaciones pendientes */}
      <div className="card" style={{ padding: 16, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontWeight: 800, fontSize: 14 }}>Cotizaciones pendientes</span>
          <button onClick={loadPending} className="btn btn-ghost btn-sm"><RefreshCcw size={13} /></button>
        </div>
        {loadingPending ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><div className="spinner" /></div>
        ) : pending.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Sin cotizaciones pendientes</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pending.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{clientName(s.client)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {fmtDate(s.createdAt)}
                    {s.quotationExpiresAt && ` · vence ${fmtDate(s.quotationExpiresAt)}`}
                    {s.priceList?.name && !s.priceList.isDefault && ` · ${s.priceList.name}`}
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13 }}>{fmtMoney(s.total)}</div>
                <button
                  onClick={() => downloadPdf(s)}
                  disabled={downloadingId === s.id}
                  className="btn btn-secondary btn-xs"
                  style={{ gap: 4 }}
                >
                  {downloadingId === s.id ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Download size={12} />}
                  PDF
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
