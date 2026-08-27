/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useMemo, useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import SearchableSelect from '@/components/SearchableSelect';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { Return, Sale, Product, PaymentMethod, ReturnSettlementType } from '@/types';
import { fmtDate, fmtMoney, normalizeArray } from '@/lib/helpers';
import { toDateInputAR } from '@/lib/dateAR';
import { RotateCcw, Eye, X, RefreshCcw, Plus, Search, Trash2, ArrowLeftRight } from 'lucide-react';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';

const REFUND_METHODS: PaymentMethod[] = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'QR'];
// El item de envío no tiene sentido "devolverlo" -- y si se lo deja como
// checkbox, el backend nunca detecta la devolución como "total" (necesita
// que TODO lo pendiente este en el pedido, ver return.service.ts#isFullReturn)
// y la venta queda para siempre en COMPLETED en vez de cancelarse.
const DELIVERY_SKU = 'ENVIO-FLETE2';
const isDeliveryItem = (item: Sale['items'][number]) => item.product?.sku === DELIVERY_SKU;

// Tolerancia para tratar una diferencia como "$0" (redondeos de coma flotante).
const EPS = 0.01;

type Selection = { checked: boolean; quantity: string; quantityKg: string };
type ExchangeLine = {
  key: string;
  productId: string;
  name: string;
  saleUnit: 'UNIT' | 'KG';
  quantity: string;
  quantityKg: string;
  price: string;
};

export default function DevolucionesPage() {
  const [returns, setReturns] = useState<Return[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Return | null>(null);

  // Create return modal
  const [createModal, setCreateModal] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [saleSearch, setSaleSearch] = useState('');
  const [pickedSale, setPickedSale] = useState<Sale | null>(null);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [exchangeItems, setExchangeItems] = useState<ExchangeLine[]>([]);
  const [exchangeProductId, setExchangeProductId] = useState('');
  const [settlementType, setSettlementType] = useState<ReturnSettlementType | ''>('');
  const [settlementMethod, setSettlementMethod] = useState<PaymentMethod | ''>('EFECTIVO');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/returns', { params: { limit: 100 } });
      setReturns(normalizeArray<Return>(data));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);


  const openCreate = async () => {
    setPickedSale(null);
    setSaleSearch('');
    setSelections({});
    setExchangeItems([]);
    setExchangeProductId('');
    setSettlementType('');
    setSettlementMethod('EFECTIVO');
    setReason('');
    setCreateModal(true);
    setSalesLoading(true);
    try {
      const from = new Date();
      from.setDate(from.getDate() - 60);
      const [salesRes, productsRes] = await Promise.all([
        api.get('/sales', { params: { status: 'COMPLETED', from: toDateInputAR(from), limit: 200 } }),
        api.get('/products', { params: { limit: 500, isActive: true } }),
      ]);
      setSales(normalizeArray<Sale>(salesRes.data));
      setProducts(normalizeArray<Product>(productsRes.data));
    } catch { setSales([]); }
    finally { setSalesLoading(false); }
  };

  const pickSale = (s: Sale) => {
    setPickedSale(s);
    const initial: Record<string, Selection> = {};
    for (const item of s.items) {
      initial[item.id] = {
        checked: false,
        quantity: String(item.quantity ?? ''),
        quantityKg: item.quantityKg != null ? String(item.quantityKg) : '',
      };
    }
    setSelections(initial);
    setExchangeItems([]);
    setExchangeProductId('');
    setSettlementType('');
  };

  const toggleItem = (itemId: string) =>
    setSelections((p) => ({ ...p, [itemId]: { ...p[itemId], checked: !p[itemId]?.checked } }));

  const setItemQty = (itemId: string, field: 'quantity' | 'quantityKg', value: string) =>
    setSelections((p) => ({ ...p, [itemId]: { ...p[itemId], [field]: value } }));

  const addExchangeProduct = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setExchangeItems((prev) => [
      ...prev,
      {
        key: `${productId}-${Date.now()}`,
        productId,
        name: product.name,
        saleUnit: product.saleUnit,
        quantity: product.saleUnit === 'UNIT' ? '1' : '',
        quantityKg: product.saleUnit === 'KG' ? '1' : '',
        price: String(product.saleUnit === 'KG' ? (product.pricePerKg ?? product.price) : product.price),
      },
    ]);
    setExchangeProductId('');
  };

  const removeExchangeItem = (key: string) => setExchangeItems((prev) => prev.filter((i) => i.key !== key));

  const setExchangeField = (key: string, field: 'quantity' | 'quantityKg' | 'price', value: string) =>
    setExchangeItems((prev) => prev.map((i) => (i.key === key ? { ...i, [field]: value } : i)));

  const returnedSubtotal = useMemo(() => {
    if (!pickedSale) return 0;
    return pickedSale.items.reduce((sum, item) => {
      const sel = selections[item.id];
      if (!sel?.checked) return sum;
      const qty = item.quantityKg != null ? Number(sel.quantityKg || 0) : Number(sel.quantity || 0);
      return sum + qty * item.price;
    }, 0);
  }, [pickedSale, selections]);

  const exchangeSubtotal = useMemo(
    () =>
      exchangeItems.reduce((sum, it) => {
        const qty = it.saleUnit === 'KG' ? Number(it.quantityKg || 0) : Number(it.quantity || 0);
        return sum + qty * Number(it.price || 0);
      }, 0),
    [exchangeItems]
  );

  const diff = Math.round((returnedSubtotal - exchangeSubtotal) * 100) / 100;
  const clientHasAccount = !!pickedSale?.client?.isAccountEnabled;
  const hasSelection = Object.values(selections).some((s) => s.checked);

  const processReturn = async () => {
    if (!pickedSale) return;

    const items = Object.entries(selections)
      .filter(([, v]) => v.checked)
      .map(([saleItemId, v]) => {
        const saleItem = pickedSale.items.find((i) => i.id === saleItemId)!;
        return saleItem.quantityKg != null
          ? { saleItemId, quantityKg: Number(v.quantityKg || 0) }
          : { saleItemId, quantity: Number(v.quantity || 0) };
      });

    if (items.length === 0) { toast.error('Elegí al menos un ítem para devolver'); return; }

    const exchangePayload = exchangeItems.map((it) => ({
      productId: it.productId,
      quantity: it.saleUnit === 'UNIT' ? Number(it.quantity || 0) : undefined,
      quantityKg: it.saleUnit === 'KG' ? Number(it.quantityKg || 0) : undefined,
      price: Number(it.price || 0),
    }));

    let settlement: { type: ReturnSettlementType; method?: PaymentMethod } | undefined;
    if (Math.abs(diff) > EPS) {
      if (!settlementType) { toast.error('Elegí cómo se salda la diferencia'); return; }
      settlement = {
        type: settlementType,
        method: settlementType === 'REFUND' ? (settlementMethod || undefined) : undefined,
      };
    }

    setSaving(true);
    try {
      await api.post(`/returns/${pickedSale.id}`, {
        items,
        exchangeItems: exchangePayload.length ? exchangePayload : undefined,
        settlement,
        reason: reason || undefined,
      });
      toast.success('Devolución registrada');
      setCreateModal(false);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al procesar devolución');
    } finally { setSaving(false); }
  };

  const filteredSales = sales.filter((s) => {
    const q = saleSearch.toLowerCase();
    if (!q) return true;
    const name = s.client ? `${s.client.nombre} ${s.client.apellido}`.toLowerCase() : '';
    return name.includes(q) || s.id.includes(q);
  });

  const productOptions = products.map((p) => ({
    value: p.id,
    label: `${p.name} — ${fmtMoney(p.saleUnit === 'KG' ? (p.pricePerKg ?? p.price) : p.price)}${p.saleUnit === 'KG' ? '/kg' : ''}`,
  }));

  return (
    <AppLayout
      title="Devoluciones"
      subtitle={`${returns.length} devoluciones registradas`}
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} className="btn btn-ghost btn-sm"><RefreshCcw size={13} /></button>
          <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
            <Plus size={13} /> Nueva devolución
          </button>
        </div>
      }
    >
      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : (
          <ResponsiveTable
            data={returns}
            keyFor={(r) => r.id}
            emptyIcon={RotateCcw}
            emptyMessage="Sin devoluciones registradas"
            columns={[
              { key: 'fecha', header: 'Fecha', render: (r) => <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtDate(r.createdAt)}</span> },
              { key: 'cliente', header: 'Cliente', render: (r) => <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>{r.client ? `${r.client.nombre} ${r.client.apellido}` : 'Consumidor final'}</span> },
              { key: 'motivo', header: 'Motivo / Notas', render: (r) => <span style={{ fontSize: 12, color: 'var(--text2)' }}>{r.reason ?? '—'}</span> },
              {
                key: 'productos', header: 'Productos', render: (r) => (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {r.items?.filter((i) => i.direction === 'RETURNED').length ?? '—'}
                    {r.items?.some((i) => i.direction === 'EXCHANGE_OUT') && (
                      <span title="Con cambio por otro producto" style={{ display: 'inline-flex' }}><ArrowLeftRight size={11} style={{ color: 'var(--accent)' }} /></span>
                    )}
                  </span>
                ),
              },
              {
                key: 'total', header: 'Valor devuelto', style: { textAlign: 'right' },
                render: (r) => <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--danger)' }}>{fmtMoney(r.total)}</span>,
              },
              {
                key: 'acciones', header: '', render: (r) => (
                  <button onClick={() => setSelected(r)} className="btn btn-ghost btn-xs"><Eye size={12} /></button>
                ),
              },
            ] as ResponsiveTableColumn<Return>[]}
            renderMobileCard={(r) => (
              <div onClick={() => setSelected(r)} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="mobile-card-head">
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>{fmtDate(r.createdAt)}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--danger)' }}>{fmtMoney(r.total)}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.client ? `${r.client.nombre} ${r.client.apellido}` : 'Consumidor final'}</div>
                <div className="mobile-card-row">
                  <span>{r.reason ?? '—'}</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{r.items?.filter((i) => i.direction === 'RETURNED').length ?? '—'} prod.</span>
                </div>
              </div>
            )}
          />
        )}
      </div>

      {/* Create return modal */}
      {createModal && (
        <div className="modal-overlay" onClick={() => setCreateModal(false)}>
          <div className="modal modal-lg" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800 }}>Nueva devolución</span>
              <button onClick={() => setCreateModal(false)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Step 1 — pick sale */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>1. Seleccioná la venta</div>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                  <input value={saleSearch} onChange={(e) => setSaleSearch(e.target.value)} placeholder="Buscar por cliente..." style={{ paddingLeft: 30 }} />
                </div>
                {salesLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><div className="spinner" /></div>
                ) : (
                  <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 7 }}>
                    {filteredSales.slice(0, 50).map((s) => (
                      <button
                        key={s.id}
                        onClick={() => pickSale(s)}
                        style={{
                          width: '100%', textAlign: 'left', padding: '9px 12px', background: pickedSale?.id === s.id ? 'rgba(13,89,231,0.12)' : 'transparent',
                          borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          border: 'none',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                            {s.client ? `${s.client.nombre} ${s.client.apellido}` : 'Consumidor final'}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{fmtDate(s.createdAt)} · {s.paymentMethod} · {s.items.length} ítem(s)</div>
                        </div>
                        <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{fmtMoney(s.total)}</div>
                      </button>
                    ))}
                    {filteredSales.length === 0 && <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--text3)' }}>Sin resultados</div>}
                  </div>
                )}
              </div>

              {pickedSale && (
                <>
                  {/* Step 2 — pick items to return */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>2. Elegí qué se devuelve</div>
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th></th><th>Producto</th><th style={{ textAlign: 'right' }}>Vendido</th><th style={{ textAlign: 'right' }}>Devolver</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr></thead>
                        <tbody>
                          {pickedSale.items.filter((item) => !isDeliveryItem(item)).map((item) => {
                            const sel = selections[item.id];
                            const isKg = item.quantityKg != null;
                            return (
                              <tr key={item.id}>
                                <td><input type="checkbox" checked={!!sel?.checked} onChange={() => toggleItem(item.id)} /></td>
                                <td style={{ color: 'var(--text)' }}>{item.product?.name ?? item.productNameSnapshot ?? '—'}</td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{isKg ? `${item.quantityKg}kg` : item.quantity}</td>
                                <td style={{ textAlign: 'right' }}>
                                  <input
                                    type="number" min="0" step={isKg ? '0.001' : '1'}
                                    disabled={!sel?.checked}
                                    max={isKg ? item.quantityKg ?? undefined : item.quantity}
                                    value={isKg ? (sel?.quantityKg ?? '') : (sel?.quantity ?? '')}
                                    onChange={(e) => setItemQty(item.id, isKg ? 'quantityKg' : 'quantity', e.target.value)}
                                    style={{ width: 80, textAlign: 'right' }}
                                  />
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                                  {sel?.checked ? fmtMoney((isKg ? Number(sel.quantityKg || 0) : Number(sel.quantity || 0)) * item.price) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Step 3 — exchange (optional) */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>3. ¿Se lleva algo a cambio? (opcional)</div>
                    <SearchableSelect
                      value={exchangeProductId}
                      onChange={(v) => { setExchangeProductId(v); if (v) addExchangeProduct(v); }}
                      options={productOptions}
                      placeholder="Buscar producto para agregar..."
                    />
                    {exchangeItems.length > 0 && (
                      <div className="table-wrap" style={{ marginTop: 8 }}>
                        <table>
                          <thead><tr><th>Producto</th><th style={{ textAlign: 'right' }}>Cantidad</th><th style={{ textAlign: 'right' }}>Precio</th><th style={{ textAlign: 'right' }}>Subtotal</th><th></th></tr></thead>
                          <tbody>
                            {exchangeItems.map((it) => (
                              <tr key={it.key}>
                                <td style={{ color: 'var(--text)' }}>{it.name}</td>
                                <td style={{ textAlign: 'right' }}>
                                  <input
                                    type="number" min="0" step={it.saleUnit === 'KG' ? '0.001' : '1'}
                                    value={it.saleUnit === 'KG' ? it.quantityKg : it.quantity}
                                    onChange={(e) => setExchangeField(it.key, it.saleUnit === 'KG' ? 'quantityKg' : 'quantity', e.target.value)}
                                    style={{ width: 70, textAlign: 'right' }}
                                  />
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <input
                                    type="number" min="0" value={it.price}
                                    onChange={(e) => setExchangeField(it.key, 'price', e.target.value)}
                                    style={{ width: 80, textAlign: 'right' }}
                                  />
                                </td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                                  {fmtMoney((it.saleUnit === 'KG' ? Number(it.quantityKg || 0) : Number(it.quantity || 0)) * Number(it.price || 0))}
                                </td>
                                <td><button onClick={() => removeExchangeItem(it.key)} className="btn btn-ghost btn-xs"><Trash2 size={12} /></button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Step 4 — settle the difference */}
                  <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: 'var(--text3)' }}>Valor devuelto</span>
                      <span style={{ fontFamily: 'var(--mono)' }}>{fmtMoney(returnedSubtotal)}</span>
                    </div>
                    {exchangeItems.length > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: 'var(--text3)' }}>Valor entregado a cambio</span>
                        <span style={{ fontFamily: 'var(--mono)' }}>− {fmtMoney(exchangeSubtotal)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, borderTop: '1px solid var(--border2)', paddingTop: 8 }}>
                      <span>{Math.abs(diff) <= EPS ? 'Diferencia' : diff > 0 ? 'A favor del cliente' : 'El cliente debe pagar'}</span>
                      <span style={{ fontFamily: 'var(--mono)', color: diff > EPS ? 'var(--warn)' : diff < -EPS ? 'var(--danger)' : 'var(--text3)' }}>{fmtMoney(Math.abs(diff))}</span>
                    </div>

                    {Math.abs(diff) > EPS && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => setSettlementType('REFUND')}
                            className={`btn btn-sm ${settlementType === 'REFUND' ? 'btn-primary' : 'btn-secondary'}`}
                          >
                            {diff > 0 ? 'Devolver plata' : 'Cobrar ahora'}
                          </button>
                          <button
                            onClick={() => setSettlementType(diff > 0 ? 'CREDIT' : 'DEBT')}
                            disabled={!clientHasAccount}
                            title={!clientHasAccount ? 'El cliente no tiene cuenta corriente habilitada' : undefined}
                            className={`btn btn-sm ${(settlementType === 'CREDIT' || settlementType === 'DEBT') ? 'btn-primary' : 'btn-secondary'}`}
                          >
                            {diff > 0 ? 'Dejar a favor en cuenta corriente' : 'Sumar a su cuenta corriente'}
                          </button>
                        </div>
                        {!clientHasAccount && (
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                            {pickedSale.client ? 'Este cliente no tiene cuenta corriente habilitada (se activa desde Clientes).' : 'Esta venta no tiene un cliente asociado.'}
                          </div>
                        )}
                        {settlementType === 'REFUND' && (
                          <select value={settlementMethod} onChange={(e) => setSettlementMethod(e.target.value as PaymentMethod)} style={{ maxWidth: 220 }}>
                            {REFUND_METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                          </select>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Motivo (opcional)</label>
                    <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo de la devolución" />
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setCreateModal(false)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={processReturn} disabled={saving || !pickedSale || !hasSelection} className="btn btn-danger btn-sm" style={{ gap: 6 }}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <><RotateCcw size={13} /> Procesar devolución</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Detalle devolución</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{fmtDate(selected.createdAt)}</div>
              </div>
              <button onClick={() => setSelected(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="grid-responsive" style={{ gap: 10 }}>
                {[
                  ['Cliente', selected.client ? `${selected.client.nombre} ${selected.client.apellido}` : 'Consumidor final'],
                  ['Motivo', selected.reason ?? '—'],
                  ['Valor devuelto', fmtMoney(selected.total)],
                  ...(selected.refundAmount ? [['Devuelto en plata', `${fmtMoney(selected.refundAmount)} (${selected.refundMethod ?? '—'})`]] : []),
                  ...(selected.creditAmount ? [['A favor en cta. cte.', fmtMoney(selected.creditAmount)]] : []),
                  ...(selected.chargeAmount ? [['Cobrado de más', `${fmtMoney(selected.chargeAmount)}${selected.chargeMethod ? ` (${selected.chargeMethod})` : ' (cta. cte.)'}`]] : []),
                ].map(([k, v]) => (
                  <div key={k}><div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{k}</div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{v}</div></div>
                ))}
              </div>
              {selected.items && selected.items.some((i) => i.direction === 'RETURNED') && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Devuelto</div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Producto</th><th>Cantidad</th><th style={{ textAlign: 'right' }}>Precio unit.</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr></thead>
                      <tbody>
                        {selected.items.filter((i) => i.direction === 'RETURNED').map((i, idx) => (
                          <tr key={idx}>
                            <td style={{ color: 'var(--text)' }}>{i.product?.name ?? '—'}</td>
                            <td style={{ fontFamily: 'var(--mono)' }}>{i.quantityKg != null ? `${i.quantityKg}kg` : i.quantity}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(i.unitPrice)}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmtMoney(i.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {selected.items && selected.items.some((i) => i.direction === 'EXCHANGE_OUT') && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Entregado a cambio</div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Producto</th><th>Cantidad</th><th style={{ textAlign: 'right' }}>Precio unit.</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr></thead>
                      <tbody>
                        {selected.items.filter((i) => i.direction === 'EXCHANGE_OUT').map((i, idx) => (
                          <tr key={idx}>
                            <td style={{ color: 'var(--text)' }}>{i.product?.name ?? '—'}</td>
                            <td style={{ fontFamily: 'var(--mono)' }}>{i.quantityKg != null ? `${i.quantityKg}kg` : i.quantity}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(i.unitPrice)}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmtMoney(i.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
