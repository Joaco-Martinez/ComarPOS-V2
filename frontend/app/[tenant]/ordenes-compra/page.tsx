/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import ConfirmModal, { type ConfirmState } from '@/components/ConfirmModal';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { fmtDate, fmtMoney, normalizeArray, num } from '@/lib/helpers';
import { todayInputAR } from '@/lib/dateAR';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
import { ClipboardList, Truck, Package, Plus, X, Eye, CheckCircle, Trash2, RefreshCcw, Search, ScanBarcode, AlertTriangle, Download, ChevronDown, ChevronUp } from 'lucide-react';

const SKU_SCANNER_ELEMENT_ID = 'comarpos-oc-sku-scanner';
// Mismo subconjunto curado que Compras (ver backend/src/services/libroIvaDigital).
const IVA_RATES = [21, 10.5, 27, 5, 2.5, 0];
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
const emptyFiscalForm = {
  invoiceNumber: '', providerCuit: '', invoiceType: '', invoicePointOfSale: '',
  nonTaxedAmount: '', exemptAmount: '', ivaPerceptionAmount: '',
  nationalTaxPerceptionAmount: '', iibbPerceptionAmount: '',
  municipalPerceptionAmount: '', internalTaxAmount: '',
};

type Status = 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';

const statusBadge: Record<Status, string> = {
  DRAFT: 'badge-amber',
  SENT: 'badge-cyan',
  PARTIAL: 'badge-cyan',
  RECEIVED: 'badge-green',
  CANCELLED: 'badge-red',
};
const statusLabel: Record<Status, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  PARTIAL: 'Parcial',
  RECEIVED: 'Recibida',
  CANCELLED: 'Cancelada',
};

export default function OrdenesCompraPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [modal, setModal] = useState<'create' | 'detail' | null>(null);
  const [selected, setSelected] = useState<any | null>(null);

  // Create form
  const [form, setForm] = useState({ supplierId: '', expectedDate: '', notes: '' });
  const [items, setItems] = useState<{ productId: string; quantityOrdered: string; unitCost: string; ivaRate: string; search: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [openSuggestIndex, setOpenSuggestIndex] = useState<number | null>(null);

  // Scanner de SKU por cámara (mismo patrón que el POS, ver pos/page.tsx) -
  // scannerForIndex indica a qué línea de producto se le carga lo escaneado.
  const [scannerForIndex, setScannerForIndex] = useState<number | null>(null);
  const [scannerLoading, setScannerLoading] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const scannerInstanceRef = useRef<any>(null);
  const scannerHandledRef = useRef(false);

  // Recepción: no hay recepción parcial item-por-item (el schema no trackea
  // cantidad recibida por item) — se acepta todo lo pedido de una, eligiendo
  // solo a qué sucursal entra el stock y cómo se paga. Ver receiveFull en
  // el backend: internamente arma la Compra real (mismos items/costos que
  // ya están en la orden, sin volver a tipearlos).
  const [receiveForm, setReceiveForm] = useState({ businessLocationId: '', paymentMethod: 'TRANSFERENCIA' });
  // Datos fiscales del comprobante que trae el proveedor junto a la
  // mercadería (CUIT, tipo/punto de venta/número, percepciones) — recién se
  // conocen al recibir, no al armar la orden, por eso se piden acá y no en
  // el alta. Sin esto la Compra generada queda incompleta para el Libro IVA
  // Digital, igual que pasaría cargando una compra a mano sin este bloque.
  const [fiscalForm, setFiscalForm] = useState(emptyFiscalForm);
  const [showFiscalExtra, setShowFiscalExtra] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { limit: 100 };
      if (statusFilter) params.status = statusFilter;
      const [ordRes, supRes, prodRes, locRes] = await Promise.all([
        api.get('/purchase-orders', { params }),
        api.get('/suppliers', { params: { isActive: true } }),
        api.get('/products', { params: { limit: 500, isActive: true } }),
        api.get('/business-locations', { params: { onlyActive: true } }),
      ]);
      setOrders(normalizeArray<any>(ordRes.data));
      setSuppliers(normalizeArray<any>(supRes.data));
      setProducts(normalizeArray<any>(prodRes.data));
      const locs = normalizeArray<any>(locRes.data);
      setLocations(locs);
      setReceiveForm((p) => ({ ...p, businessLocationId: p.businessLocationId || locs[0]?.id || '' }));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const openDetail = async (ord: any) => {
    try {
      const { data } = await api.get(`/purchase-orders/${ord.id}`);
      setSelected(data);
      setFiscalForm({ ...emptyFiscalForm, providerCuit: data.supplier?.cuit ?? '' });
      setShowFiscalExtra(false);
      setModal('detail');
    } catch { toast.error('Error al cargar detalle'); }
  };

  const downloadPdf = async (ord: any) => {
    try {
      const res = await api.get(`/purchase-orders/${ord.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orden-compra-${ord.id.slice(-8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('No se pudo generar el PDF');
    }
  };

  const addItem = () => setItems((p) => [...p, { productId: '', quantityOrdered: '1', unitCost: '', ivaRate: '21', search: '' }]);
  const removeItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, k: string, v: string) =>
    setItems((p) => { const n = [...p]; n[i] = { ...n[i], [k]: v }; return n; });

  // Productos ofrecidos al buscar: si hay proveedor elegido, solo los suyos
  // (Product.supplierId) — mismo criterio que en Compras, no tiene sentido
  // pedirle a un proveedor algo que no vende. Sin proveedor, cualquiera.
  const supplierProducts = useMemo(
    () => (form.supplierId ? products.filter((p: any) => p.supplierId === form.supplierId) : products),
    [products, form.supplierId]
  );

  const matchesFor = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return supplierProducts
      .filter((p: any) => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
      .slice(0, 20);
  };

  // Elegir un producto de la lista precarga el costo con el último costo de
  // compra cargado en el producto (Product.purchasePrice) — editable si el
  // proveedor lo aumentó desde la última vez.
  const selectItemProduct = (i: number, product: any) => {
    setItems((prev) => {
      const n = [...prev];
      n[i] = {
        ...n[i],
        productId: product.id,
        search: product.name,
        unitCost: String(product.purchasePrice ?? 0),
        ivaRate: String(product.ivaRate ?? 21),
      };
      return n;
    });
    setOpenSuggestIndex(null);
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
    setScannerForIndex(null);
  };

  const openSkuScanner = (i: number) => {
    setScannerError('');
    setScannerLoading(true);
    scannerHandledRef.current = false;
    setScannerForIndex(i);
  };

  // Mismo criterio que la búsqueda por texto: busca solo entre los
  // productos del proveedor elegido (o cualquiera, sin proveedor).
  const handleScannedSku = async (rawSku: string) => {
    const sku = rawSku.trim();
    if (!sku || scannerHandledRef.current || scannerForIndex === null) return;
    scannerHandledRef.current = true;

    const product = supplierProducts.find((p: any) => p.sku && p.sku.trim().toLowerCase() === sku.toLowerCase());

    if (!product) {
      scannerHandledRef.current = false;
      setScannerError(
        form.supplierId
          ? `No encontré ningún producto de este proveedor con SKU: ${sku}`
          : `No encontré ningún producto con SKU: ${sku}`
      );
      return;
    }

    selectItemProduct(scannerForIndex, product);
    await closeSkuScanner();
  };

  useEffect(() => {
    if (scannerForIndex === null) return;
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
  }, [scannerForIndex]);

  const create = async () => {
    if (!items.length || items.some((it) => !it.productId)) return;
    setSaving(true);
    try {
      await api.post('/purchase-orders', {
        supplierId: form.supplierId || undefined,
        expectedDate: form.expectedDate || undefined,
        notes: form.notes || undefined,
        items: items.map((it) => ({
          productId: it.productId,
          quantity: Number(it.quantityOrdered),
          unitCost: it.unitCost ? Number(it.unitCost) : undefined,
          ivaRate: Number(it.ivaRate),
        })),
      });
      toast.success('Orden creada');
      setModal(null);
      setForm({ supplierId: '', expectedDate: '', notes: '' });
      setItems([]);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al crear');
    } finally { setSaving(false); }
  };

  const changeStatus = async (id: string, status: Status) => {
    try {
      await api.patch(`/purchase-orders/${id}/status`, { status });
      toast.success(`Estado actualizado a ${statusLabel[status]}`);
      load();
      if (selected?.id === id) setSelected((s: any) => s ? { ...s, status } : s);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error');
    }
  };

  const receive = async () => {
    if (!selected) return;
    if (!receiveForm.businessLocationId) { toast.error('Elegí a qué sucursal entra el stock'); return; }
    setSaving(true);
    try {
      await api.post(`/purchase-orders/${selected.id}/receive`, {
        ...receiveForm,
        invoiceNumber: fiscalForm.invoiceNumber || undefined,
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
      });
      toast.success('Recepción registrada: se generó la compra y se sumó el stock');
      setModal(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error');
    } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    try {
      await api.delete(`/purchase-orders/${id}`);
      toast.success('Orden eliminada');
      load();
    } catch { toast.error('Error al eliminar'); }
  };

  const askDel = (id: string) => setConfirmState({
    title: 'Eliminar orden',
    message: '¿Eliminar esta orden?',
    onConfirm: () => del(id),
  });

  // El listado (getAll) no trae los items completos, solo su cantidad
  // (_count.items) — el total ya viene calculado y guardado en la orden
  // (PurchaseOrder.totalAmount), no hace falta (ni se puede, sin items)
  // recalcularlo acá.
  const itemsCount = (ord: any) => ord._count?.items ?? ord.items?.length ?? 0;
  const estimatedTotal = (ord: any) => num(ord.totalAmount);

  return (
    <AppLayout
      title="Órdenes de Compra"
      subtitle={`${orders.length} órdenes`}
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => load()} className="btn btn-ghost btn-sm"><RefreshCcw size={13} /></button>
          <button onClick={() => { setForm({ supplierId: '', expectedDate: '', notes: '' }); setItems([]); setOpenSuggestIndex(null); setModal('create'); }} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
            <Plus size={13} /> Nueva Orden
          </button>
        </div>
      }
    >
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{}}>
          <option value="">Todos los estados</option>
          {(Object.keys(statusLabel) as Status[]).map((s) => (
            <option key={s} value={s}>{statusLabel[s]}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : (
          <ResponsiveTable
            data={orders}
            keyFor={(ord) => ord.id}
            emptyIcon={ClipboardList}
            emptyMessage="No hay órdenes"
            columns={[
              { key: 'numero', header: '#', render: (ord) => <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{ord.id?.slice(-6).toUpperCase()}</span> },
              {
                key: 'proveedor', header: 'Proveedor', render: (ord) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text)' }}>
                    <Truck size={13} style={{ color: 'var(--text3)' }} />
                    {ord.supplier?.name ?? ord.supplier?.nombre ?? '—'}
                  </div>
                ),
              },
              { key: 'fecha', header: 'Fecha esperada', render: (ord) => <span style={{ color: 'var(--text2)' }}>{ord.expectedDate ? fmtDate(ord.expectedDate) : '—'}</span> },
              { key: 'estado', header: 'Estado', render: (ord) => <span className={`badge ${statusBadge[ord.status as Status] ?? 'badge-amber'}`}>{statusLabel[ord.status as Status] ?? ord.status}</span> },
              { key: 'items', header: 'Items', render: (ord) => <span style={{ color: 'var(--text2)' }}>{itemsCount(ord)}</span> },
              { key: 'total', header: 'Total estimado', render: (ord) => <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmtMoney(estimatedTotal(ord))}</span> },
              {
                key: 'acciones', header: 'Acciones', render: (ord) => (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openDetail(ord)} title="Ver detalle"><Eye size={13} /></button>
                    <button className="btn btn-ghost btn-sm" onClick={() => downloadPdf(ord)} title="Descargar PDF para el proveedor"><Download size={13} /></button>
                    {ord.status !== 'CANCELLED' && ord.status !== 'RECEIVED' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => changeStatus(ord.id, 'SENT')} title="Marcar como enviada" style={{ color: 'var(--accent2)' }}><ClipboardList size={13} /></button>
                    )}
                    <button className="btn btn-danger btn-sm" onClick={() => askDel(ord.id)} title="Eliminar"><Trash2 size={13} /></button>
                  </div>
                ),
              },
            ] as ResponsiveTableColumn<any>[]}
            renderMobileCard={(ord) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="mobile-card-head">
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>#{ord.id?.slice(-6).toUpperCase()}</span>
                  <span className={`badge ${statusBadge[ord.status as Status] ?? 'badge-amber'}`}>{statusLabel[ord.status as Status] ?? ord.status}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  <Truck size={13} style={{ color: 'var(--text3)' }} />
                  {ord.supplier?.name ?? ord.supplier?.nombre ?? '—'}
                </div>
                <div className="mobile-card-row">
                  <span>Fecha esperada</span>
                  <span>{ord.expectedDate ? fmtDate(ord.expectedDate) : '—'}</span>
                </div>
                <div className="mobile-card-row">
                  <span>Items</span>
                  <span>{itemsCount(ord)}</span>
                </div>
                <div className="mobile-card-row">
                  <span>Total estimado</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmtMoney(estimatedTotal(ord))}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openDetail(ord)} title="Ver detalle"><Eye size={13} /> Detalle</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => downloadPdf(ord)} title="Descargar PDF"><Download size={13} /> PDF</button>
                  {ord.status !== 'CANCELLED' && ord.status !== 'RECEIVED' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => changeStatus(ord.id, 'SENT')} title="Marcar como enviada" style={{ color: 'var(--accent2)' }}><ClipboardList size={13} /></button>
                  )}
                  <button className="btn btn-danger btn-sm" onClick={() => askDel(ord.id)} title="Eliminar"><Trash2 size={13} /></button>
                </div>
              </div>
            )}
          />
        )}
      </div>

      {/* Create Modal */}
      {modal === 'create' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" style={{ padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <ClipboardList size={16} style={{ color: 'var(--accent)' }} /> Nueva Orden de Compra
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={15} /></button>
            </div>

            <div className="grid-responsive" style={{ gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Proveedor</label>
                <select value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))} style={{ width: '100%' }}>
                  <option value="">Sin proveedor</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name ?? s.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Fecha esperada</label>
                <input type="date" value={form.expectedDate} onChange={(e) => setForm((f) => ({ ...f, expectedDate: e.target.value }))} style={{ width: '100%' }} />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Notas</label>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} style={{ width: '100%', resize: 'vertical' }} />
            </div>

            {/* Items */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="section-title" style={{ fontSize: 12 }}>
                  Productos {form.supplierId ? '(solo los de este proveedor)' : ''}
                </span>
                <button className="btn btn-secondary btn-sm" onClick={addItem} style={{ gap: 5 }}><Plus size={12} /> Agregar</button>
              </div>
              {items.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 12, textAlign: 'center', padding: 12 }}>Sin productos. Agregue al menos uno.</div>}
              <div className="line-item-scroll">
                {items.map((it, i) => {
                  const matches = matchesFor(it.search);
                  const productPicked = !!it.productId;
                  const showSuggestions = openSuggestIndex === i && it.search.trim() && !productPicked;
                  return (
                    <div key={i} style={{ marginBottom: 8, border: showSuggestions ? '1px solid var(--border)' : 'none', borderRadius: 8, padding: showSuggestions ? 6 : 0 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px 78px 32px', gap: 8, alignItems: 'center' }}>
                      <div style={{ position: 'relative' }}>
                        {/* La lupa desaparece una vez que la línea ya tiene
                            un producto elegido — a esa altura ya no es un
                            campo de búsqueda, es el nombre del producto, y
                            la lupa invitaba a seguir tocándolo por error. */}
                        {!productPicked && (
                          <Search size={13} style={{ position: 'absolute', left: 9, top: 10, color: 'var(--text3)' }} />
                        )}
                        <input
                          type="text"
                          value={it.search}
                          onChange={(e) => {
                            const v = e.target.value;
                            setItems((prev) => { const n = [...prev]; n[i] = { ...n[i], search: v, productId: '', unitCost: '' }; return n; });
                            setOpenSuggestIndex(i);
                          }}
                          onFocus={() => setOpenSuggestIndex(i)}
                          onBlur={() => setTimeout(() => setOpenSuggestIndex((cur) => (cur === i ? null : cur)), 150)}
                          placeholder="Buscar por nombre o SKU..."
                          style={{
                            paddingLeft: productPicked ? 12 : 28,
                            paddingRight: productPicked ? 12 : 30,
                            borderColor: productPicked ? 'var(--accent)' : undefined,
                          }}
                        />
                        {!productPicked && (
                          <button
                            type="button"
                            onClick={() => openSkuScanner(i)}
                            title="Escanear SKU con la cámara"
                            style={{ position: 'absolute', right: 6, top: 6, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 2, display: 'flex' }}
                          >
                            <ScanBarcode size={15} />
                          </button>
                        )}
                      </div>
                      <input type="number" min={1} placeholder="Cant." value={it.quantityOrdered} onChange={(e) => updateItem(i, 'quantityOrdered', e.target.value)} style={{}} />
                      <input type="number" min={0} placeholder="Costo u." value={it.unitCost} onChange={(e) => updateItem(i, 'unitCost', e.target.value)} style={{}} />
                      <select value={it.ivaRate} onChange={(e) => updateItem(i, 'ivaRate', e.target.value)} style={{ fontSize: 12.5 }}>
                        {IVA_RATES.map((r) => <option key={r} value={r}>{r === 0 ? 'Exento' : `${r}%`}</option>)}
                      </select>
                      <button className="btn btn-ghost btn-sm" onClick={() => removeItem(i)}><X size={13} /></button>
                    </div>
                    {showSuggestions && (
                      <div style={{ marginTop: 6, maxHeight: 200, overflowY: 'auto' }}>
                        {matches.length === 0 && (
                          <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 10px' }}>Sin resultados</div>
                        )}
                        {matches.map((p: any) => (
                          <div
                            key={p.id}
                            onClick={() => selectItemProduct(i, p)}
                            onMouseDown={(e) => e.preventDefault()}
                            style={{ padding: '6px 10px', marginBottom: 4, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 12.5 }}
                          >
                            <div style={{ fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                              {p.sku ? `SKU: ${p.sku}` : 'Sin SKU'} · Costo: {fmtMoney(p.purchasePrice ?? 0)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={create} disabled={saving || !items.length}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Crear Orden'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {modal === 'detail' && selected && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" style={{ padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Package size={16} style={{ color: 'var(--accent)' }} />
                  Orden #{selected.id?.slice(-6).toUpperCase()}
                  <span className={`badge ${statusBadge[selected.status as Status] ?? 'badge-amber'}`}>{statusLabel[selected.status as Status] ?? selected.status}</span>
                </div>
                {selected.supplier && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{selected.supplier.name ?? selected.supplier.nombre}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => downloadPdf(selected)} style={{ gap: 6 }}><Download size={13} /> PDF</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={15} /></button>
              </div>
            </div>

            {/* Status actions */}
            {selected.status !== 'RECEIVED' && selected.status !== 'CANCELLED' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {selected.status === 'DRAFT' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => changeStatus(selected.id, 'SENT')}>Marcar como Enviada</button>
                )}
                <button className="btn btn-danger btn-sm" onClick={() => { changeStatus(selected.id, 'CANCELLED'); setModal(null); }}>Cancelar Orden</button>
              </div>
            )}

            {/* Items table */}
            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Producto', 'Cantidad', 'IVA', 'Costo u.', 'Subtotal'].map((h) => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(selected.items ?? []).map((it: any) => (
                    <tr key={it.productId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', color: 'var(--text)' }}>{it.product?.name ?? it.product?.nombre ?? it.productId}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>{it.quantityKgOrdered != null ? `${it.quantityKgOrdered} kg` : it.quantityOrdered}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>{it.ivaRate === 0 ? 'Exento' : `${it.ivaRate ?? 21}%`}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>{it.unitCost ? fmtMoney(it.unitCost) : '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{it.unitCost ? fmtMoney(num(it.unitCost) * num(it.quantityOrdered)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(selected.status === 'SENT' || selected.status === 'PARTIAL') && (
              <div style={{ padding: 12, background: 'var(--bg2)', borderRadius: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Confirmar recepción completa</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>
                  Acepta toda la mercadería pedida tal cual está en la orden — genera la compra automáticamente
                  (suma el stock, actualiza el costo y la deuda con el proveedor), sin volver a cargar los productos a mano.
                </div>
                <div className="grid-responsive" style={{ gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Sucursal / destino del stock</label>
                    <select value={receiveForm.businessLocationId} onChange={(e) => setReceiveForm((f) => ({ ...f, businessLocationId: e.target.value }))} style={{ width: '100%' }}>
                      <option value="">Seleccionar...</option>
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Forma de pago</label>
                    <select value={receiveForm.paymentMethod} onChange={(e) => setReceiveForm((f) => ({ ...f, paymentMethod: e.target.value }))} style={{ width: '100%' }}>
                      <option value="TRANSFERENCIA">Transferencia</option>
                      <option value="EFECTIVO">Efectivo (sale de la caja abierta)</option>
                      <option value="TARJETA">Tarjeta</option>
                      <option value="CUENTA_CORRIENTE">Cta. Cte. proveedor</option>
                    </select>
                  </div>
                </div>

                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Datos fiscales del comprobante</div>
                <div className="grid-responsive" style={{ gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Tipo de comprobante</label>
                    <select value={fiscalForm.invoiceType} onChange={(e) => setFiscalForm((f) => ({ ...f, invoiceType: e.target.value }))} style={{ width: '100%' }}>
                      <option value="">Sin especificar</option>
                      {PURCHASE_INVOICE_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Punto de venta</label>
                    <input type="number" min="0" value={fiscalForm.invoicePointOfSale} onChange={(e) => setFiscalForm((f) => ({ ...f, invoicePointOfSale: e.target.value }))} placeholder="0001" style={{ width: '100%' }} />
                  </div>
                </div>
                <div className="grid-responsive" style={{ gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Número de comprobante</label>
                    <input value={fiscalForm.invoiceNumber} onChange={(e) => setFiscalForm((f) => ({ ...f, invoiceNumber: e.target.value }))} placeholder="00000001" style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>CUIT del proveedor</label>
                    <input value={fiscalForm.providerCuit} onChange={(e) => setFiscalForm((f) => ({ ...f, providerCuit: e.target.value }))} placeholder="20123456789" style={{ width: '100%' }} />
                  </div>
                </div>
                <button type="button" onClick={() => setShowFiscalExtra((v) => !v)} className="btn btn-ghost btn-xs" style={{ marginBottom: 10, gap: 4 }}>
                  {showFiscalExtra ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Percepciones / exento / impuestos internos
                </button>
                {showFiscalExtra && (
                  <>
                    <div className="grid-responsive" style={{ gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>No gravado</label>
                        <input type="number" min="0" value={fiscalForm.nonTaxedAmount} onChange={(e) => setFiscalForm((f) => ({ ...f, nonTaxedAmount: e.target.value }))} placeholder="0" style={{ width: '100%' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Exento</label>
                        <input type="number" min="0" value={fiscalForm.exemptAmount} onChange={(e) => setFiscalForm((f) => ({ ...f, exemptAmount: e.target.value }))} placeholder="0" style={{ width: '100%' }} />
                      </div>
                    </div>
                    <div className="grid-responsive" style={{ gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Percepción IVA</label>
                        <input type="number" min="0" value={fiscalForm.ivaPerceptionAmount} onChange={(e) => setFiscalForm((f) => ({ ...f, ivaPerceptionAmount: e.target.value }))} placeholder="0" style={{ width: '100%' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Otras percepciones nacionales</label>
                        <input type="number" min="0" value={fiscalForm.nationalTaxPerceptionAmount} onChange={(e) => setFiscalForm((f) => ({ ...f, nationalTaxPerceptionAmount: e.target.value }))} placeholder="0" style={{ width: '100%' }} />
                      </div>
                    </div>
                    <div className="grid-responsive" style={{ gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Percepción IIBB</label>
                        <input type="number" min="0" value={fiscalForm.iibbPerceptionAmount} onChange={(e) => setFiscalForm((f) => ({ ...f, iibbPerceptionAmount: e.target.value }))} placeholder="0" style={{ width: '100%' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Percepción municipal</label>
                        <input type="number" min="0" value={fiscalForm.municipalPerceptionAmount} onChange={(e) => setFiscalForm((f) => ({ ...f, municipalPerceptionAmount: e.target.value }))} placeholder="0" style={{ width: '100%' }} />
                      </div>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11, color: 'var(--text3)', display: 'block', marginBottom: 4 }}>Impuestos internos</label>
                      <input type="number" min="0" value={fiscalForm.internalTaxAmount} onChange={(e) => setFiscalForm((f) => ({ ...f, internalTaxAmount: e.target.value }))} placeholder="0" style={{ width: '100%' }} />
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setModal(null)}>Cerrar</button>
                  <button className="btn btn-primary btn-sm" onClick={receive} disabled={saving || !receiveForm.businessLocationId} style={{ gap: 6 }}>
                    <CheckCircle size={13} /> {saving ? 'Guardando...' : 'Confirmar recepción completa'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Scanner de SKU (cámara) */}
      {scannerForIndex !== null && (
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
                  Cuando lo detecte, carga el producto y su costo en esta línea.
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
      <ConfirmModal state={confirmState} onClose={() => setConfirmState(null)} />
    </AppLayout>
  );
}
