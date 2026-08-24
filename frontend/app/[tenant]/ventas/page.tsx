/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import type { Product, Sale, SalePayment } from '@/types';
import { clientName, fmtDate, fmtMoney, normalizeArray, num, productPrice } from '@/lib/helpers';
import { todayInputAR, firstDayOfMonthAR } from '@/lib/dateAR';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
import FilterBar from '@/components/mobile/FilterBar';
import Pagination from '@/components/mobile/Pagination';
import {
  Search, Download, RefreshCcw, X, FileText, Eye, MoreVertical, Check, Printer,
  Send, Plus, Trash2, AlertTriangle, CreditCard, Package,
} from 'lucide-react';

type InvoiceType = 1 | 6 | 11;
const INVOICE_TYPE_LABEL: Record<number, string> = { 1: 'Factura A', 6: 'Factura B', 11: 'Factura C' };
function allowedInvoiceTypes(ivaCondition?: string | null): InvoiceType[] {
  if (String(ivaCondition ?? '').trim().toUpperCase() === 'IVA RESPONSABLE INSCRIPTO') return [6, 1];
  return [11];
}

const ALL_PAYMENT_METHODS: { method: string; label: string }[] = [
  { method: 'EFECTIVO', label: 'Efectivo' },
  { method: 'TRANSFERENCIA', label: 'Transferencia' },
  { method: 'TARJETA', label: 'Tarjeta' },
  { method: 'QR_MERCADOPAGO', label: 'MercadoPago' },
  { method: 'QR_NACION', label: 'QR Nación' },
  { method: 'CUENTA_CORRIENTE', label: 'Cta. Cte.' },
];

type EditItem = { productId: string; productName: string; saleUnit?: string; quantity: number; quantityKg?: number; price: number };
type ConfirmState = { title: string; message: string; danger?: boolean; confirmText?: string; onConfirm: () => void } | null;

const PAGE_SIZE = 20;

const statusBadge = (s: string) =>
  s === 'COMPLETED' ? 'badge-green' : s === 'PENDING' ? 'badge-amber' : 'badge-red';

const receiptBadge = (r: string) => r === 'FACTURA' ? 'badge-blue' : 'badge-gray';

const paymentLabel: Record<string, string> = {
  EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia', TARJETA: 'Tarjeta',
  DEBITO: 'Débito', CREDITO: 'Crédito', QR: 'QR', QR_MERCADOPAGO: 'MercadoPago',
  QR_NACION: 'QR Nación', CUENTA_CORRIENTE: 'Cta. Cte.',
};

export default function VentasPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState(todayInputAR());
  const [to, setTo] = useState(todayInputAR());
  const [status, setStatus] = useState('');
  const [receiptType, setReceiptType] = useState('');
  const [selected, setSelected] = useState<Sale | null>(null);

  // Acciones de venta
  const [actionsSale, setActionsSale] = useState<Sale | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [toast, setToast] = useState('');
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [quotingId, setQuotingId] = useState<string | null>(null);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const [paymentsSale, setPaymentsSale] = useState<Sale | null>(null);
  const [editPayments, setEditPayments] = useState<SalePayment[]>([]);
  const [savingPayments, setSavingPayments] = useState(false);

  const [itemsSale, setItemsSale] = useState<Sale | null>(null);
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [savingItems, setSavingItems] = useState(false);

  const [invoiceModal, setInvoiceModal] = useState<{ sale: Sale; dni: string; invoiceType: InvoiceType } | null>(null);
  const [invoiceTypes, setInvoiceTypes] = useState<InvoiceType[]>([11]);
  const [invoicing, setInvoicing] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const canEditItems = (s: Sale) => s.status === 'PENDING' && !s.invoiceAfip?.cae;
  const isInvoiced = (s: Sale) => !!s.invoiceAfip?.cae;

  useEffect(() => {
    api.get('/arca-config/config').then(({ data }) => {
      setInvoiceTypes(allowedInvoiceTypes(data?.content?.ivaCondition));
    }).catch(() => setInvoiceTypes([11]));
  }, []);

  const changeStatus = (s: Sale, next: 'COMPLETED' | 'CANCELLED') => {
    const run = async () => {
      setUpdatingStatusId(s.id);
      try {
        await api.patch(`/sales/${s.id}/status`, { status: next });
        showToast(next === 'CANCELLED' ? 'Venta cancelada' : 'Venta confirmada');
        fetchSales(page);
      } catch (err: any) {
        showToast(err?.response?.data?.message ?? 'No se pudo actualizar la venta');
      } finally {
        setUpdatingStatusId(null);
      }
    };
    if (next === 'CANCELLED') {
      setConfirmState({
        title: 'Cancelar venta',
        message: `¿Cancelar la venta #${s.id.slice(-8)} y revertir stock/deuda si corresponde?`,
        danger: true,
        confirmText: 'Cancelar venta',
        onConfirm: run,
      });
    } else {
      run();
    }
  };

  const printTicket = async (s: Sale) => {
    setPrintingId(s.id);
    try {
      await api.post(`/tickets/sale/${s.id}/print`);
      showToast('Ticket enviado a impresión');
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'No se pudo imprimir el ticket');
    } finally {
      setPrintingId(null);
    }
  };

  const downloadCotizacion = async (s: Sale) => {
    setQuotingId(s.id);
    try {
      const res = await api.get(`/sales/${s.id}/cotizacion-pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cotizacion-${s.id.slice(-8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('No se pudo generar la cotización');
    } finally {
      setQuotingId(null);
    }
  };

  // Regenera el PDF de la factura al vuelo (no depende de que ya este
  // cacheado en Cloudinary desde el momento de facturar, ver
  // factura-pdf.service.ts#obtenerFacturaPDFPathService) -- funciona igual
  // para Factura A, B o C, la letra sale sola del invoiceAfip de la venta.
  const downloadFacturaPdf = async (s: Sale) => {
    setDownloadingInvoiceId(s.id);
    try {
      const res = await api.get(`/factura-pdf/${s.id}/descargar`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `factura-${s.invoiceAfip?.cae ?? s.id.slice(-8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('No se pudo descargar la factura');
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  const openPayments = (s: Sale) => {
    setPaymentsSale(s);
    setEditPayments(
      (s.payments?.length ? s.payments : [{ method: s.paymentMethod, amount: s.total }])
        .map((p) => ({ method: p.method, amount: num(p.amount), reference: p.reference ?? '', notes: p.notes ?? '' }))
    );
  };

  const savePayments = async () => {
    if (!paymentsSale) return;
    setSavingPayments(true);
    try {
      const payments = editPayments.filter((p) => num(p.amount) > 0);
      if (!payments.length) {
        showToast('Ingresá al menos un monto mayor a 0');
        setSavingPayments(false);
        return;
      }
      await api.patch(`/sales/${paymentsSale.id}/payments`, { payments, setAsPrimary: true });
      showToast('Pagos actualizados');
      setPaymentsSale(null);
      fetchSales(page);
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'No se pudieron actualizar los pagos');
    } finally {
      setSavingPayments(false);
    }
  };

  const loadProducts = async () => {
    if (products.length || loadingProducts) return;
    setLoadingProducts(true);
    try {
      const { data } = await api.get('/products', { params: { isActive: true, limit: 500 } });
      setProducts(normalizeArray<Product>(data));
    } finally {
      setLoadingProducts(false);
    }
  };

  const openItems = (s: Sale) => {
    if (!canEditItems(s)) {
      showToast('Solo se puede editar una venta pendiente y sin factura');
      return;
    }
    setItemsSale(s);
    setProductSearch('');
    setEditItems((s.items ?? []).map((it) => ({
      productId: it.productId,
      productName: it.product?.name ?? it.productNameSnapshot ?? 'Producto',
      saleUnit: it.product?.saleUnit,
      quantity: it.quantity,
      quantityKg: it.quantityKg ?? undefined,
      price: it.price,
    })));
    loadProducts();
  };

  const addProductToEdit = (p: Product) => {
    setEditItems((prev) => {
      const idx = prev.findIndex((i) => i.productId === p.id);
      if (idx >= 0) {
        const next = [...prev];
        if (p.saleUnit === 'KG') next[idx] = { ...next[idx], quantityKg: num(next[idx].quantityKg) + 1 };
        else next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, {
        productId: p.id, productName: p.name, saleUnit: p.saleUnit,
        quantity: 1, quantityKg: p.saleUnit === 'KG' ? 1 : undefined,
        price: productPrice(p, 'price'),
      }];
    });
  };

  const removeEditItem = (productId: string) => setEditItems((prev) => prev.filter((i) => i.productId !== productId));

  const saveItems = async () => {
    if (!itemsSale) return;
    if (!editItems.length) { showToast('La venta debe tener al menos un producto'); return; }
    setSavingItems(true);
    try {
      await api.patch(`/sales/${itemsSale.id}/items`, {
        items: editItems.map((i) => ({
          productId: i.productId,
          quantity: i.saleUnit === 'KG' ? 1 : i.quantity,
          quantityKg: i.saleUnit === 'KG' ? i.quantityKg : undefined,
          price: i.price,
        })),
        deliveryMethod: itemsSale.deliveryMethod ?? 'PICKUP',
        deliveryStatus: itemsSale.deliveryStatus ?? 'NONE',
      });
      showToast('Productos actualizados');
      setItemsSale(null);
      fetchSales(page);
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'No se pudieron actualizar los productos');
    } finally {
      setSavingItems(false);
    }
  };

  const openInvoice = (s: Sale) => setInvoiceModal({ sale: s, dni: s.client?.dni ?? '', invoiceType: invoiceTypes[0] });

  const submitInvoice = async () => {
    if (!invoiceModal) return;
    setInvoicing(true);
    try {
      await api.post('/afip/facturar', {
        saleId: invoiceModal.sale.id,
        tipoComprobante: invoiceModal.invoiceType,
        receiverDoc: invoiceModal.dni,
      });
      showToast('Factura emitida correctamente');
      setInvoiceModal(null);
      fetchSales(page);
    } catch (err: any) {
      showToast(`Error AFIP: ${err?.response?.data?.message ?? 'desconocido'}`);
    } finally {
      setInvoicing(false);
    }
  };

  const filteredEditProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)).slice(0, 30);
  }, [products, productSearch]);

  const fetchSales = async (p = 1) => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page: p, limit: PAGE_SIZE };
      if (from) params.from = from;
      if (to) params.to = to;
      if (status) params.status = status;
      if (receiptType) params.receiptType = receiptType;
      const { data } = await api.get('/sales', { params });
      const arr = normalizeArray<Sale>(data);
      setSales(arr);
      setTotal(data?.total ?? data?.pagination?.total ?? arr.length);
      setPage(p);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSales(1); }, [from, to, status, receiptType]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sales;
    const q = search.toLowerCase();
    return sales.filter((s) =>
      s.id.toLowerCase().includes(q) ||
      (s.client && `${s.client.nombre} ${s.client.apellido}`.toLowerCase().includes(q)) ||
      s.paymentMethod.toLowerCase().includes(q)
    );
  }, [sales, search]);

  const totalRevenue = filtered.reduce((a, s) => a + num(s.total), 0);
  const totalProfit = filtered.reduce((a, s) => a + num(s.grossProfit), 0);

  return (
    <AppLayout
      title="Historial de Ventas"
      subtitle={`${total} registros encontrados`}
      actions={
        <button onClick={() => fetchSales(page)} className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
          <RefreshCcw size={13} />
        </button>
      }
    >
      {toast && (
        <div style={{ position: 'fixed', top: 70, right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)', animation: 'fadeIn 0.2s ease' }}>{toast}</div>
      )}

      {/* Filters */}
      <div style={{ marginBottom: 16 }}>
        <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Buscar..." collapsible>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150, fontSize: 13 }} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150, fontSize: 13 }} />
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 140, fontSize: 13 }}>
            <option value="">Todos los estados</option>
            <option value="COMPLETED">Completada</option>
            <option value="PENDING">Pendiente</option>
            <option value="CANCELLED">Cancelada</option>
          </select>
          <select value={receiptType} onChange={(e) => setReceiptType(e.target.value)} style={{ width: 140, fontSize: 13 }}>
            <option value="">Ticket y Factura</option>
            <option value="TICKET">Ticket</option>
            <option value="FACTURA">Factura</option>
          </select>
          <button onClick={() => { setFrom(firstDayOfMonthAR()); setTo(todayInputAR()); }} className="btn btn-secondary btn-sm">Este mes</button>
        </FilterBar>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Ingresos', value: fmtMoney(totalRevenue), color: 'var(--accent)' },
          { label: 'Ganancia bruta', value: fmtMoney(totalProfit), color: 'var(--success)' },
          { label: 'Operaciones', value: String(filtered.length), color: 'var(--accent2)' },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)', color: s.color, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <div className="spinner" />
          </div>
        ) : (
          <>
            <ResponsiveTable
              data={filtered}
              keyFor={(s) => s.id}
              emptyIcon={FileText}
              emptyMessage="Sin ventas en el período seleccionado"
              columns={[
                { key: 'fecha', header: 'Fecha', render: (s) => <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtDate(s.createdAt)}</span> },
                { key: 'cliente', header: 'Cliente', render: (s) => <span style={{ color: 'var(--text)', fontWeight: 500 }}>{clientName(s.client)}</span> },
                { key: 'pago', header: 'Pago', render: (s) => <span style={{ fontSize: 12 }}>{paymentLabel[s.paymentMethod] ?? s.paymentMethod}</span> },
                { key: 'tipo', header: 'Tipo', render: (s) => <span className={`badge ${receiptBadge(s.receiptType)}`}>{s.receiptType}</span> },
                { key: 'estado', header: 'Estado', render: (s) => <span className={`badge ${statusBadge(s.status)}`}>{s.status}</span> },
                {
                  key: 'afip', header: 'AFIP', render: (s) => s.invoiceAfip?.cae ? (
                    <span className="badge badge-green" title={s.invoiceAfip.cae}>CAE ✓</span>
                  ) : s.receiptType === 'FACTURA' ? (
                    <span className="badge badge-amber">Pendiente</span>
                  ) : (
                    <span className="badge badge-gray">—</span>
                  ),
                },
                {
                  key: 'total', header: 'Total', style: { textAlign: 'right' },
                  render: (s) => <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>{fmtMoney(s.total)}</span>,
                },
                {
                  key: 'acciones', header: '', render: (s) => (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => setSelected(s)} className="btn btn-ghost btn-xs" style={{ gap: 4 }} title="Ver detalle">
                        <Eye size={12} />
                      </button>
                      <button onClick={() => setActionsSale(s)} className="btn btn-ghost btn-xs" style={{ gap: 4 }} title="Más acciones">
                        <MoreVertical size={12} />
                      </button>
                    </div>
                  ),
                },
              ] as ResponsiveTableColumn<Sale>[]}
              renderMobileCard={(s) => (
                <div onClick={() => setActionsSale(s)} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="mobile-card-head">
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>{fmtDate(s.createdAt)}</span>
                    <span className={`badge ${statusBadge(s.status)}`}>{s.status}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{clientName(s.client)}</div>
                  <div className="mobile-card-row">
                    <span>
                      {paymentLabel[s.paymentMethod] ?? s.paymentMethod} · <span className={`badge ${receiptBadge(s.receiptType)}`}>{s.receiptType}</span>
                      {s.invoiceAfip?.cae && <span className="badge badge-green" style={{ marginLeft: 4 }}>CAE ✓</span>}
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)' }}>{fmtMoney(s.total)}</span>
                  </div>
                </div>
              )}
            />

            {total > PAGE_SIZE && (
              <div style={{ padding: '4px 16px 12px', borderTop: '1px solid var(--border)' }}>
                <Pagination page={page} totalPages={Math.ceil(total / PAGE_SIZE)} onChange={(p) => fetchSales(p)} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Detalle de venta</div>
                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2 }}>{selected.id}</div>
              </div>
              <button onClick={() => setSelected(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="grid-responsive" style={{ gap: 10 }}>
                {[
                  ['Fecha', fmtDate(selected.createdAt)],
                  ['Cliente', clientName(selected.client)],
                  ['Tipo', selected.receiptType],
                  ['Estado', selected.status],
                  ['Pago', paymentLabel[selected.paymentMethod] ?? selected.paymentMethod],
                  ['Total', fmtMoney(selected.total)],
                  ...(selected.grossProfit != null ? [['Ganancia', fmtMoney(selected.grossProfit)]] : []),
                  ...(selected.invoiceAfip?.cae ? [['CAE', selected.invoiceAfip.cae]] : []),
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: k === 'Total' || k === 'Ganancia' || k === 'CAE' ? 'var(--mono)' : undefined }}>{v}</div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Productos</div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Producto</th><th>Cant.</th><th style={{ textAlign: 'right' }}>Precio</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr></thead>
                    <tbody>
                      {selected.items?.map((item, i) => (
                        <tr key={i}>
                          <td style={{ color: 'var(--text)' }}>{item.product?.name ?? item.productNameSnapshot ?? '—'}</td>
                          <td style={{ fontFamily: 'var(--mono)' }}>{item.quantityKg != null ? `${item.quantityKg}kg` : item.quantity}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(item.price)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmtMoney(num(item.subtotal, item.price * (item.quantityKg ?? item.quantity)))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {selected.invoiceAfip?.pdfUrl && (
                <a href={selected.invoiceAfip.pdfUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start', gap: 6 }}>
                  <FileText size={13} /> Ver PDF Factura
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Acciones de venta */}
      {actionsSale && (
        <div className="modal-overlay" onClick={() => setActionsSale(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Acciones de venta</div>
                <div style={{ fontWeight: 800, fontSize: 15, marginTop: 2 }}>#{actionsSale.id.slice(-8)} · {clientName(actionsSale.client)}</div>
              </div>
              <button onClick={() => setActionsSale(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                <span className={`badge ${statusBadge(actionsSale.status)}`}>{actionsSale.status}</span>
                <span className={`badge ${receiptBadge(actionsSale.receiptType)}`}>{actionsSale.receiptType}</span>
                <span className="badge badge-gray">{paymentLabel[actionsSale.paymentMethod] ?? actionsSale.paymentMethod}</span>
                {isInvoiced(actionsSale) && <span className="badge badge-green">CAE ✓</span>}
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--accent)' }}>{fmtMoney(actionsSale.total)}</span>
              </div>

              {[
                {
                  show: true, icon: <Eye size={16} />, label: 'Ver detalle', sub: 'Productos y pagos',
                  onClick: () => { setSelected(actionsSale); setActionsSale(null); },
                },
                {
                  show: canEditItems(actionsSale), icon: <Plus size={16} />, label: 'Editar productos', sub: 'Agregar o modificar antes de confirmar',
                  onClick: () => { openItems(actionsSale); setActionsSale(null); },
                },
                {
                  show: actionsSale.status === 'PENDING', icon: <Check size={16} />, label: 'Confirmar venta', sub: 'Pasar la venta a completada', primary: true,
                  onClick: () => { changeStatus(actionsSale, 'COMPLETED'); setActionsSale(null); },
                },
                {
                  show: actionsSale.status !== 'CANCELLED', icon: <X size={16} />, label: 'Cancelar venta', sub: 'Revertir stock/deuda si corresponde', danger: true,
                  onClick: () => { changeStatus(actionsSale, 'CANCELLED'); setActionsSale(null); },
                },
                {
                  show: actionsSale.status !== 'CANCELLED', icon: <CreditCard size={16} />, label: 'Editar pagos', sub: 'Efectivo, transferencia, tarjeta o mixto',
                  onClick: () => { openPayments(actionsSale); setActionsSale(null); },
                },
                {
                  show: true, icon: printingId === actionsSale.id ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Printer size={16} />, label: 'Imprimir ticket', sub: 'Enviar ticket no fiscal a impresión',
                  onClick: () => printTicket(actionsSale),
                },
                {
                  show: actionsSale.status === 'PENDING', icon: quotingId === actionsSale.id ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Download size={16} />, label: 'Cotización', sub: 'Descargar PDF de cotización',
                  onClick: () => downloadCotizacion(actionsSale),
                },
                {
                  show: !isInvoiced(actionsSale) && actionsSale.status !== 'CANCELLED', icon: <Send size={16} />, label: 'Facturar en ARCA', sub: 'Generar CAE y comprobante fiscal', primary: true,
                  onClick: () => { openInvoice(actionsSale); setActionsSale(null); },
                },
                {
                  show: isInvoiced(actionsSale), icon: downloadingInvoiceId === actionsSale.id ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Download size={16} />, label: 'Descargar factura', sub: `PDF de la factura ${actionsSale.receiptType || ''} con CAE`,
                  onClick: () => downloadFacturaPdf(actionsSale),
                },
              ].filter((a) => a.show).map((a) => (
                <button
                  key={a.label}
                  onClick={a.onClick}
                  disabled={updatingStatusId === actionsSale.id || printingId === actionsSale.id || quotingId === actionsSale.id || downloadingInvoiceId === actionsSale.id}
                  className="btn btn-secondary"
                  style={{
                    justifyContent: 'flex-start', gap: 12, padding: '12px 14px', textAlign: 'left', height: 'auto',
                    borderColor: a.danger ? 'rgba(239,68,68,0.3)' : a.primary ? 'rgba(13,89,231,0.3)' : undefined,
                  }}
                >
                  <span style={{ color: a.danger ? 'var(--danger)' : a.primary ? 'var(--accent)' : 'var(--text3)', flexShrink: 0 }}>{a.icon}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <b style={{ fontSize: 13, color: a.danger ? 'var(--danger)' : 'var(--text)' }}>{a.label}</b>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>{a.sub}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Editar pagos */}
      {paymentsSale && (
        <div className="modal-overlay" onClick={() => setPaymentsSale(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800 }}>Editar pagos · #{paymentsSale.id.slice(-8)}</span>
              <button onClick={() => setPaymentsSale(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {editPayments.map((pay, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select
                    value={pay.method}
                    onChange={(e) => setEditPayments((p) => p.map((x, i) => i === idx ? { ...x, method: e.target.value as any } : x))}
                    style={{ flex: 1 }}
                  >
                    {ALL_PAYMENT_METHODS.map((m) => <option key={m.method} value={m.method}>{m.label}</option>)}
                  </select>
                  <input
                    type="number" min="0" step="any"
                    value={pay.amount || ''}
                    onChange={(e) => setEditPayments((p) => p.map((x, i) => i === idx ? { ...x, amount: Number(e.target.value) } : x))}
                    style={{ width: 130 }}
                  />
                  {editPayments.length > 1 && (
                    <button onClick={() => setEditPayments((p) => p.filter((_, i) => i !== idx))} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={() => setEditPayments((p) => [...p, { method: 'EFECTIVO', amount: 0 }])} className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', color: 'var(--text3)', gap: 6 }}>
                <Plus size={13} /> Agregar método de pago
              </button>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <span>Total venta</span>
                <span style={{ fontFamily: 'var(--mono)' }}>{fmtMoney(paymentsSale.total)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}>
                <span>Suma de pagos</span>
                <span style={{ fontFamily: 'var(--mono)', color: editPayments.reduce((a, p) => a + num(p.amount), 0) < paymentsSale.total ? 'var(--warn)' : 'var(--success)' }}>
                  {fmtMoney(editPayments.reduce((a, p) => a + num(p.amount), 0))}
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setPaymentsSale(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={savePayments} disabled={savingPayments} className="btn btn-primary btn-sm">
                {savingPayments ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Guardar pagos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editar productos */}
      {itemsSale && (
        <div className="modal-overlay" onClick={() => setItemsSale(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90vh' }}>
            <div className="modal-header">
              <div>
                <div style={{ fontWeight: 800 }}>Editar productos · #{itemsSale.id.slice(-8)}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Solo disponible antes de confirmar o facturar la venta</div>
              </div>
              <button onClick={() => setItemsSale(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Productos en la venta</div>
                <div className="line-item-scroll">
                  {editItems.map((it) => (
                    <div key={it.productId} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 100px 32px', gap: 8, marginBottom: 8, alignItems: 'center', minWidth: 380 }}>
                      <span style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.productName}</span>
                      <input
                        type="number" min="0" step="any"
                        value={it.saleUnit === 'KG' ? (it.quantityKg ?? '') : it.quantity}
                        onChange={(e) => setEditItems((p) => p.map((x) => x.productId === it.productId
                          ? (it.saleUnit === 'KG' ? { ...x, quantityKg: Number(e.target.value) } : { ...x, quantity: Number(e.target.value) })
                          : x))}
                        style={{ fontSize: 13 }}
                      />
                      <input
                        type="number" min="0" step="any"
                        value={it.price}
                        onChange={(e) => setEditItems((p) => p.map((x) => x.productId === it.productId ? { ...x, price: Number(e.target.value) } : x))}
                        style={{ fontSize: 13 }}
                      />
                      <button onClick={() => removeEditItem(it.productId)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  {!editItems.length && <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: 12 }}>Sin productos</div>}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Agregar producto</div>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                  <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Buscar producto para agregar..." style={{ paddingLeft: 30, fontSize: 13 }} />
                </div>
                <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {loadingProducts ? (
                    <div style={{ textAlign: 'center', padding: 12 }}><span className="spinner" /></div>
                  ) : filteredEditProducts.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: 12 }}>No encontré productos</div>
                  ) : filteredEditProducts.map((p) => (
                    <button key={p.id} onClick={() => addProductToEdit(p)} className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', gap: 8 }}>
                      <Package size={14} style={{ color: 'var(--text3)', flexShrink: 0 }} />
                      <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{fmtMoney(productPrice(p, 'price'))}</span>
                      <Plus size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setItemsSale(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={saveItems} disabled={savingItems || !editItems.length} className="btn btn-primary btn-sm">
                {savingItems ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Guardar productos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Facturar en ARCA */}
      {invoiceModal && (
        <div className="modal-overlay" onClick={() => setInvoiceModal(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ fontWeight: 800 }}>Emitir factura AFIP</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{clientName(invoiceModal.sale.client)}</div>
              </div>
              <button onClick={() => setInvoiceModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: 'var(--warn)', display: 'flex', gap: 8 }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                Esta acción emite el comprobante ante AFIP. No se puede revertir.
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tipo de comprobante</label>
                <select value={invoiceModal.invoiceType} onChange={(e) => setInvoiceModal((p) => p && ({ ...p, invoiceType: Number(e.target.value) as InvoiceType }))}>
                  {invoiceTypes.map((t) => <option key={t} value={t}>{INVOICE_TYPE_LABEL[t]}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">DNI / CUIT receptor</label>
                <input value={invoiceModal.dni} onChange={(e) => setInvoiceModal((p) => p && ({ ...p, dni: e.target.value }))} placeholder="DNI o CUIT" />
              </div>
              <div style={{ fontSize: 14, fontFamily: 'var(--mono)', textAlign: 'right', color: 'var(--accent)', fontWeight: 800 }}>
                Total: {fmtMoney(invoiceModal.sale.total)}
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setInvoiceModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={submitInvoice} disabled={invoicing} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
                {invoicing ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <><Send size={13} /> Emitir</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {confirmState && (
        <div className="modal-overlay" onClick={() => setConfirmState(null)}>
          <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 700 }}>{confirmState.title}</span>
              <button onClick={() => setConfirmState(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body"><p style={{ fontSize: 14, color: 'var(--text2)' }}>{confirmState.message}</p></div>
            <div className="modal-footer">
              <button onClick={() => setConfirmState(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button
                onClick={() => { confirmState.onConfirm(); setConfirmState(null); }}
                className={confirmState.danger ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm'}
              >
                {confirmState.confirmText ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
