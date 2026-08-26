/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { BusinessLocation, Product, Purchase, Supplier } from '@/types';
import { fmtDate, fmtMoney, normalizeArray, num } from '@/lib/helpers';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
import FilterBar from '@/components/mobile/FilterBar';
import { ShoppingBag, Plus, X, Eye, RefreshCcw, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { todayInputAR } from '@/lib/dateAR';

// Mismo subconjunto curado que backend/src/services/libroIvaDigital/invoiceTypes.ts
// -- los tipos de comprobante de compra que un comercio chico/mediano recibe en la práctica.
const PURCHASE_INVOICE_TYPES = [
  { code: 1, label: 'Factura A' },
  { code: 2, label: 'Nota de Débito A' },
  { code: 3, label: 'Nota de Crédito A' },
  { code: 6, label: 'Factura B' },
  { code: 7, label: 'Nota de Débito B' },
  { code: 8, label: 'Nota de Crédito B' },
  { code: 11, label: 'Factura C' },
  { code: 12, label: 'Nota de Débito C' },
  { code: 13, label: 'Nota de Crédito C' },
  { code: 51, label: 'Factura M' },
  { code: 52, label: 'Nota de Débito M' },
  { code: 53, label: 'Nota de Crédito M' },
];
const IVA_RATES = [21, 10.5, 27, 5, 2.5, 0];

const emptyFiscalForm = {
  providerCuit: '', invoiceType: '', invoicePointOfSale: '',
  nonTaxedAmount: '', exemptAmount: '', ivaPerceptionAmount: '',
  nationalTaxPerceptionAmount: '', iibbPerceptionAmount: '',
  municipalPerceptionAmount: '', internalTaxAmount: '',
};

export default function ComprasPage() {
  const { tenant } = useParams<{ tenant: string }>();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create' | 'detail' | null>(null);
  const [selected, setSelected] = useState<Purchase | null>(null);
  const [form, setForm] = useState({ supplierId: '', date: todayInputAR(), notes: '', invoiceNumber: '', businessLocationId: '', paymentMethod: 'TRANSFERENCIA' });
  const [items, setItems] = useState<{ productId: string; quantity: string; quantityKg: string; unitCost: string; ivaRate: string }[]>([]);
  const [fiscalForm, setFiscalForm] = useState(emptyFiscalForm);
  const [showFiscalExtra, setShowFiscalExtra] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [pr, sup, prod, loc] = await Promise.all([
        api.get('/purchases', { params: { limit: 100 } }),
        api.get('/suppliers', { params: { isActive: true } }),
        api.get('/products', { params: { limit: 500, isActive: true } }),
        api.get('/business-locations', { params: { onlyActive: true } }),
      ]);
      setPurchases(normalizeArray<Purchase>(pr.data));
      setSuppliers(normalizeArray<Supplier>(sup.data));
      setProducts(normalizeArray<Product>(prod.data));
      const locs = normalizeArray<BusinessLocation>(loc.data);
      setLocations(locs);
      setForm((p) => ({ ...p, businessLocationId: p.businessLocationId || locs[0]?.id || '' }));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);


  const addItem = () => setItems((p) => [...p, { productId: '', quantity: '1', quantityKg: '', unitCost: '', ivaRate: '21' }]);
  const removeItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, k: string, v: string) => setItems((p) => { const n = [...p]; n[i] = { ...n[i], [k]: v }; return n; });

  const selectSupplier = (supplierId: string) => {
    setForm((p) => ({ ...p, supplierId }));
    const supplier = suppliers.find((s) => s.id === supplierId);
    if (supplier?.cuit) setFiscalForm((p) => ({ ...p, providerCuit: supplier.cuit ?? '' }));
  };

  const save = async () => {
    if (!items.length) return;
    if (!form.businessLocationId) { toast.error('Elegí una ubicación de destino'); return; }
    setSaving(true);
    try {
      await api.post('/purchases', {
        supplierId: form.supplierId || undefined,
        date: form.date,
        description: form.notes || undefined,
        businessLocationId: form.businessLocationId,
        paymentMethod: form.paymentMethod,
        invoiceNumber: form.invoiceNumber || undefined,
        providerCuit: fiscalForm.providerCuit || undefined,
        invoiceType: fiscalForm.invoiceType || undefined,
        invoicePointOfSale: fiscalForm.invoicePointOfSale || undefined,
        nonTaxedAmount: fiscalForm.nonTaxedAmount || undefined,
        exemptAmount: fiscalForm.exemptAmount || undefined,
        ivaPerceptionAmount: fiscalForm.ivaPerceptionAmount || undefined,
        nationalTaxPerceptionAmount: fiscalForm.nationalTaxPerceptionAmount || undefined,
        iibbPerceptionAmount: fiscalForm.iibbPerceptionAmount || undefined,
        municipalPerceptionAmount: fiscalForm.municipalPerceptionAmount || undefined,
        internalTaxAmount: fiscalForm.internalTaxAmount || undefined,
        items: items.filter((i) => i.productId).map((i) => {
          const p = products.find((x) => x.id === i.productId);
          return {
            productId: i.productId,
            quantity: p?.saleUnit === 'KG' ? 1 : Number(i.quantity),
            quantityKg: p?.saleUnit === 'KG' ? Number(i.quantityKg) : undefined,
            unitCost: Number(i.unitCost),
            ivaRate: Number(i.ivaRate),
          };
        }),
      });
      toast.success('Compra registrada');
      setModal(null);
      setItems([]);
      setFiscalForm(emptyFiscalForm);
      setShowFiscalExtra(false);
      setForm((p) => ({ supplierId: '', date: todayInputAR(), notes: '', invoiceNumber: '', businessLocationId: p.businessLocationId, paymentMethod: 'TRANSFERENCIA' }));
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al registrar');
    } finally { setSaving(false); }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return purchases;
    const q = search.toLowerCase();
    return purchases.filter((p) =>
      p.supplier?.name?.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
    );
  }, [purchases, search]);

  const totalMonth = purchases.reduce((a, p) => a + num(p.totalAmount), 0);

  return (
    <AppLayout
      title="Compras"
      subtitle={`${purchases.length} registros`}
      actions={
        <button onClick={() => { setForm((p) => ({ supplierId: '', date: todayInputAR(), notes: '', invoiceNumber: '', businessLocationId: p.businessLocationId, paymentMethod: 'TRANSFERENCIA' })); setItems([{ productId: '', quantity: '1', quantityKg: '', unitCost: '', ivaRate: '21' }]); setFiscalForm(emptyFiscalForm); setShowFiscalExtra(false); setModal('create'); }}
          className="btn btn-primary btn-sm" style={{ gap: 6 }}>
          <Plus size={13} /> Registrar compra
        </button>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 10, marginBottom: 16 }}>
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Total compras</div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent)', marginTop: 4 }}>{fmtMoney(totalMonth)}</div>
        </div>
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Registros</div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent2)', marginTop: 4 }}>{purchases.length}</div>
        </div>
      </div>

      <div style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Buscar proveedor..." />
        <a href={`/${tenant}/libro-iva-digital`} style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap' }}>
          Ver Libro IVA Digital →
        </a>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : (
          <ResponsiveTable
            data={filtered}
            keyFor={(p) => p.id}
            emptyIcon={ShoppingBag}
            emptyMessage="Sin compras registradas"
            columns={[
              { key: 'fecha', header: 'Fecha', render: (p) => <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtDate(p.date)}</span> },
              { key: 'proveedor', header: 'Proveedor', render: (p) => <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>{p.supplier?.name ?? 'Sin proveedor'}</span> },
              { key: 'productos', header: 'Productos', render: (p) => <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{p.items?.length ?? '—'}</span> },
              { key: 'notas', header: 'Notas', render: (p) => <span style={{ fontSize: 12, color: 'var(--text3)' }}>{p.description ?? '—'}</span> },
              {
                key: 'total', header: 'Total', style: { textAlign: 'right' },
                render: (p) => <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)' }}>{fmtMoney(p.totalAmount)}</span>,
              },
              {
                key: 'acciones', header: '', render: (p) => (
                  <button onClick={() => { setSelected(p); setModal('detail'); }} className="btn btn-ghost btn-xs"><Eye size={12} /></button>
                ),
              },
            ] as ResponsiveTableColumn<Purchase>[]}
            renderMobileCard={(p) => (
              <div onClick={() => { setSelected(p); setModal('detail'); }} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="mobile-card-head">
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>{fmtDate(p.date)}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)' }}>{fmtMoney(p.totalAmount)}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.supplier?.name ?? 'Sin proveedor'}</div>
                <div className="mobile-card-row">
                  <span>{p.items?.length ?? 0} productos</span>
                  <span>{p.description ?? '—'}</span>
                </div>
              </div>
            )}
          />
        )}
      </div>

      {modal === 'create' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-xl" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '92vh' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 800, fontSize: 15 }}>Registrar compra</span>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Proveedor</label>
                  <select value={form.supplierId} onChange={(e) => selectSupplier(e.target.value)}>
                    <option value="">Sin proveedor</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Fecha</label>
                  <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Destino del stock</label>
                  <select value={form.businessLocationId} onChange={(e) => setForm((p) => ({ ...p, businessLocationId: e.target.value }))}>
                    <option value="">Seleccionar...</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Forma de pago</label>
                  <select value={form.paymentMethod} onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))}>
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="EFECTIVO">Efectivo (sale de la caja abierta)</option>
                    <option value="TARJETA">Tarjeta</option>
                    <option value="CUENTA_CORRIENTE">Cta. Cte. proveedor</option>
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Notas</label>
                <input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Opcional" />
              </div>

              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Datos fiscales del comprobante</div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tipo de comprobante</label>
                  <select value={fiscalForm.invoiceType} onChange={(e) => setFiscalForm((p) => ({ ...p, invoiceType: e.target.value }))}>
                    <option value="">Sin especificar</option>
                    {PURCHASE_INVOICE_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Punto de venta</label>
                  <input type="number" min="0" value={fiscalForm.invoicePointOfSale} onChange={(e) => setFiscalForm((p) => ({ ...p, invoicePointOfSale: e.target.value }))} placeholder="0001" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Número de comprobante</label>
                  <input value={form.invoiceNumber} onChange={(e) => setForm((p) => ({ ...p, invoiceNumber: e.target.value }))} placeholder="00000001" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">CUIT del proveedor</label>
                  <input value={fiscalForm.providerCuit} onChange={(e) => setFiscalForm((p) => ({ ...p, providerCuit: e.target.value }))} placeholder="20123456789" />
                </div>
              </div>
              <button type="button" onClick={() => setShowFiscalExtra((v) => !v)} className="btn btn-ghost btn-xs" style={{ alignSelf: 'flex-start', gap: 4 }}>
                {showFiscalExtra ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Percepciones / exento / impuestos internos
              </button>
              {showFiscalExtra && (
                <>
                  <div className="form-row">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">No gravado</label>
                      <input type="number" min="0" value={fiscalForm.nonTaxedAmount} onChange={(e) => setFiscalForm((p) => ({ ...p, nonTaxedAmount: e.target.value }))} placeholder="0" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Exento</label>
                      <input type="number" min="0" value={fiscalForm.exemptAmount} onChange={(e) => setFiscalForm((p) => ({ ...p, exemptAmount: e.target.value }))} placeholder="0" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Percepción IVA</label>
                      <input type="number" min="0" value={fiscalForm.ivaPerceptionAmount} onChange={(e) => setFiscalForm((p) => ({ ...p, ivaPerceptionAmount: e.target.value }))} placeholder="0" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Otras percepciones nacionales</label>
                      <input type="number" min="0" value={fiscalForm.nationalTaxPerceptionAmount} onChange={(e) => setFiscalForm((p) => ({ ...p, nationalTaxPerceptionAmount: e.target.value }))} placeholder="0" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Percepción IIBB</label>
                      <input type="number" min="0" value={fiscalForm.iibbPerceptionAmount} onChange={(e) => setFiscalForm((p) => ({ ...p, iibbPerceptionAmount: e.target.value }))} placeholder="0" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Percepción municipal</label>
                      <input type="number" min="0" value={fiscalForm.municipalPerceptionAmount} onChange={(e) => setFiscalForm((p) => ({ ...p, municipalPerceptionAmount: e.target.value }))} placeholder="0" />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Impuestos internos</label>
                    <input type="number" min="0" value={fiscalForm.internalTaxAmount} onChange={(e) => setFiscalForm((p) => ({ ...p, internalTaxAmount: e.target.value }))} placeholder="0" />
                  </div>
                </>
              )}

              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Productos</div>
              <div className="line-item-scroll">
                {items.map((item, idx) => {
                  const prod = products.find((x) => x.id === item.productId);
                  return (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end', marginBottom: 8 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Producto</label>
                        <select value={item.productId} onChange={(e) => updateItem(idx, 'productId', e.target.value)}>
                          <option value="">Seleccionar...</option>
                          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">{prod?.saleUnit === 'KG' ? 'Kilos' : 'Cantidad'}</label>
                        <input type="number" min="0" step="any" value={prod?.saleUnit === 'KG' ? item.quantityKg : item.quantity}
                          onChange={(e) => updateItem(idx, prod?.saleUnit === 'KG' ? 'quantityKg' : 'quantity', e.target.value)} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Costo unitario</label>
                        <input type="number" min="0" step="any" value={item.unitCost} onChange={(e) => updateItem(idx, 'unitCost', e.target.value)} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">IVA</label>
                        <select value={item.ivaRate} onChange={(e) => updateItem(idx, 'ivaRate', e.target.value)}>
                          {IVA_RATES.map((r) => <option key={r} value={r}>{r === 0 ? 'Exento' : `${r}%`}</option>)}
                        </select>
                      </div>
                      <button onClick={() => removeItem(idx)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)', marginBottom: 0 }}><Trash2 size={12} /></button>
                    </div>
                  );
                })}
              </div>
              <button onClick={addItem} className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start', gap: 6 }}>
                <Plus size={13} /> Agregar producto
              </button>

              <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800, color: 'var(--accent)' }}>
                Total: {fmtMoney(items.reduce((a, i) => a + num(i.unitCost) * (i.quantityKg ? num(i.quantityKg) : num(i.quantity)), 0))}
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={save} disabled={saving || items.filter((i) => i.productId).length === 0} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Registrar compra'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'detail' && selected && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Detalle de compra</div>
                <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2 }}>{fmtDate(selected.date)}</div>
              </div>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="grid-responsive" style={{ gap: 10 }}>
                {[
                  ['Proveedor', selected.supplier?.name ?? 'Sin proveedor'], ['Fecha', fmtDate(selected.date)],
                  ['Destino', selected.businessLocation?.name ?? '—'], ['Notas', selected.description ?? '—'],
                  ['Tipo de comprobante', PURCHASE_INVOICE_TYPES.find((t) => t.code === selected.invoiceType)?.label ?? '—'],
                  ['Punto de venta / Número', [selected.invoicePointOfSale, selected.invoiceNumber].filter(Boolean).join(' - ') || '—'],
                  ['CUIT proveedor', selected.providerCuit ?? selected.supplier?.cuit ?? '—'],
                  ['Total', fmtMoney(selected.totalAmount)],
                ].map(([k, v]) => (
                  <div key={k}><div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{k}</div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{v}</div></div>
                ))}
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Producto</th><th>Cantidad</th><th style={{ textAlign: 'right' }}>Costo</th><th style={{ textAlign: 'right' }}>IVA</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr></thead>
                  <tbody>
                    {selected.items?.map((i, idx) => (
                      <tr key={idx}>
                        <td style={{ color: 'var(--text)' }}>{i.product?.name ?? '—'}</td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{i.quantityKg != null ? `${i.quantityKg}kg` : i.quantity}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(i.unitCost)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{i.ivaRate != null ? `${i.ivaRate}%` : '—'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmtMoney(i.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
