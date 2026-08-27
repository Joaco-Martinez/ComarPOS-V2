/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import SkuScannerModal from '@/components/SkuScannerModal';
import SearchableSelect from '@/components/SearchableSelect';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { BusinessLocation, Product, ProductCategory, StockMovement } from '@/types';
import { categoryName, fmtDate, normalizeArray, num, productStock, productMinStock } from '@/lib/helpers';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
import { BarChart2, Search, ArrowRightLeft, X, AlertTriangle, RefreshCcw, History, ScanBarcode, Package, Pencil } from 'lucide-react';

const MOVEMENT_LABELS: Record<string, string> = {
  TRANSFER: 'Transferencia', INGRESS: 'Ingreso', ADJUSTMENT: 'Ajuste',
  SALE: 'Venta', SALE_CANCEL: 'Cancelación venta',
};

type MoveForm = { type: 'TRANSFER' | 'INGRESS'; fromLocationId: string; toLocationId: string; quantity: string; reason: string };
type MinModal = { product: Product; businessLocationId: string; businessLocationName: string; minQuantity: string; minQuantityKg: string } | null;

export default function StockPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [tab, setTab] = useState<'stock' | 'movements'>('stock');
  const [moveModal, setMoveModal] = useState<Product | null>(null);
  const [moveForm, setMoveForm] = useState<MoveForm>({ type: 'TRANSFER', fromLocationId: '', toLocationId: '', quantity: '', reason: '' });
  const [minModal, setMinModal] = useState<MinModal>(null);
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [movFrom, setMovFrom] = useState('');
  const [movTo, setMovTo] = useState('');
  const [movLoading, setMovLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [pr, cr, loc] = await Promise.all([
        api.get('/products', { params: { limit: 500, isActive: true } }),
        api.get('/categories'),
        api.get('/business-locations', { params: { onlyActive: true } }),
      ]);
      setProducts(normalizeArray<Product>(pr.data));
      setCategories(normalizeArray<ProductCategory>(cr.data).filter((c) => c.isActive));
      setLocations(normalizeArray<BusinessLocation>(loc.data));
    } finally {
      setLoading(false);
    }
  };

  const loadMovements = async () => {
    setMovLoading(true);
    try {
      const { data } = await api.get('/products/movements', {
        params: { fromDate: movFrom || undefined, toDate: movTo || undefined },
      });
      setMovements(normalizeArray<StockMovement>(data));
    } catch {
      // sin toast de error puntual acá -- el resto de la page tampoco lo hace para sus fetches
    } finally {
      setMovLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadMovements(); }, [movFrom, movTo]);

  const filtered = useMemo(() => {
    let p = products.filter((x) => x.isService !== true && x.unlimitedStock !== true);
    if (catFilter) p = p.filter((x) => x.categoryId === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      p = p.filter((x) => x.name.toLowerCase().includes(q) || x.sku?.toLowerCase().includes(q));
    }
    return p;
  }, [products, catFilter, search]);


  const openMoveModal = (p: Product) => {
    setMoveModal(p);
    setMoveForm({
      type: 'TRANSFER',
      fromLocationId: locations[0]?.id ?? '',
      toLocationId: locations[1]?.id ?? locations[0]?.id ?? '',
      quantity: '',
      reason: '',
    });
  };

  const handleScannedSku = (rawSku: string) => {
    const sku = rawSku.trim().toLowerCase();
    const found = products.find((p) => p.sku && p.sku.trim().toLowerCase() === sku);
    if (!found) {
      toast.error(`No encontré ningún producto con SKU: ${rawSku}`);
      return;
    }
    setScannerOpen(false);
    openMoveModal(found);
  };

  const submitMovement = async () => {
    if (!moveModal) return;
    if (moveForm.type === 'TRANSFER' && moveForm.fromLocationId === moveForm.toLocationId) {
      toast.error('El origen y el destino tienen que ser distintos');
      return;
    }
    setSaving(true);
    try {
      const isKg = moveModal.saleUnit === 'KG';
      const reason = moveForm.reason || undefined;
      if (moveForm.type === 'TRANSFER') {
        if (isKg) {
          await api.post(`/products/${moveModal.id}/transfer-kg`, {
            fromLocationId: moveForm.fromLocationId, toLocationId: moveForm.toLocationId, quantityKg: Number(moveForm.quantity), reason,
          });
        } else {
          await api.post('/products/transfer', {
            productId: moveModal.id, fromLocationId: moveForm.fromLocationId, toLocationId: moveForm.toLocationId, quantity: Number(moveForm.quantity), reason,
          });
        }
      } else {
        if (isKg) {
          await api.post(`/products/${moveModal.id}/add-stock-kg`, { businessLocationId: moveForm.toLocationId, quantityKg: Number(moveForm.quantity), reason });
        } else {
          await api.post('/products/add-stock', { productId: moveModal.id, businessLocationId: moveForm.toLocationId, quantity: Number(moveForm.quantity), reason });
        }
      }
      toast.success('Movimiento registrado');
      setMoveModal(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al registrar movimiento');
    } finally {
      setSaving(false);
    }
  };

  const openMinModal = (p: Product, loc: BusinessLocation) => {
    const row = p.stock?.find((s) => s.businessLocationId === loc.id);
    setMinModal({
      product: p,
      businessLocationId: loc.id,
      businessLocationName: loc.name,
      minQuantity: String(row?.minQuantity ?? ''),
      minQuantityKg: String(row?.minQuantityKg ?? ''),
    });
  };

  const submitMin = async () => {
    if (!minModal) return;
    setSaving(true);
    try {
      await api.put(`/products/${minModal.product.id}/stock-min/${minModal.businessLocationId}`, {
        minQuantity: minModal.minQuantity === '' ? null : Number(minModal.minQuantity),
        minQuantityKg: minModal.minQuantityKg === '' ? null : Number(minModal.minQuantityKg),
      });
      toast.success('Mínimo actualizado');
      setMinModal(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al actualizar el mínimo');
    } finally {
      setSaving(false);
    }
  };

  const lowStockCount = products.filter((p) => {
    const s = productStock(p);
    const m = productMinStock(p);
    return m > 0 && s <= m;
  }).length;

  return (
    <AppLayout
      title="Stock"
      subtitle={`${filtered.length} productos · ${lowStockCount > 0 ? `⚠ ${lowStockCount} con stock bajo` : 'todo en orden'}`}
      actions={
        <button onClick={load} className="btn btn-ghost btn-sm"><RefreshCcw size={13} /></button>
      }
    >
      {!loading && locations.length === 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: 'var(--warn)' }}>
          <div style={{ fontSize: 13, color: 'var(--text)' }}>
            Todavía no configuraste ninguna ubicación de stock. Creá al menos una desde <b>Configuración → Sucursales</b> para poder cargar y vender stock.
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {[['stock', 'Stock actual'], ['movements', 'Movimientos']].map(([t, l]) => (
          <button key={t} onClick={() => setTab(t as any)} className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-secondary'}`}>
            {t === 'stock' ? <BarChart2 size={13} /> : <History size={13} />}
            {l}
          </button>
        ))}
      </div>

      {tab === 'stock' && (
        <>
          <div className="filter-bar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ position: 'relative', flex: '0 0 240px' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto..." style={{ paddingLeft: 30 }} />
            </div>
            <SearchableSelect
              value={catFilter}
              onChange={setCatFilter}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Todas las categorías"
              style={{ width: 220 }}
            />
            <button onClick={() => setScannerOpen(true)} className="btn btn-secondary btn-sm" style={{ gap: 6 }} title="Escanear SKU con la cámara">
              <ScanBarcode size={13} /> Escanear
            </button>
          </div>

          <div className="card">
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
            ) : (
              <ResponsiveTable
                data={filtered}
                keyFor={(p) => p.id}
                emptyIcon={Package}
                emptyMessage="Sin productos para mostrar"
                columns={[
                  {
                    key: 'producto', header: 'Producto', render: (p) => (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                        {p.sku && <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{p.sku}</div>}
                      </>
                    ),
                  },
                  { key: 'categoria', header: 'Categoría', render: (p) => <span style={{ fontSize: 12 }}>{categoryName(p)}</span> },
                  { key: 'unidad', header: 'Unidad', render: (p) => <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{p.saleUnit}</span> },
                  ...locations.map((loc) => ({
                    key: `loc_${loc.id}`,
                    header: loc.name,
                    render: (p: Product) => {
                      const row = p.stock?.find((s) => s.businessLocationId === loc.id);
                      const isKg = p.saleUnit === 'KG';
                      const qty = num(isKg ? row?.quantityKg : row?.quantity);
                      const min = num(isKg ? row?.minQuantityKg : row?.minQuantity);
                      const low = min > 0 && qty <= min;
                      const critical = qty <= 0;
                      const unit = isKg ? 'kg' : 'un';
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: critical ? 'var(--danger)' : low ? 'var(--warn)' : 'var(--text2)' }}>
                            {low && <AlertTriangle size={10} style={{ display: 'inline', marginRight: 3 }} />}
                            {qty} {unit}
                          </span>
                          <button
                            onClick={() => openMinModal(p, loc)}
                            className="btn btn-ghost btn-xs"
                            title={`Editar mínimo en ${loc.name}`}
                            style={{ padding: 3, color: 'var(--text3)' }}
                          >
                            <Pencil size={10} />
                          </button>
                        </div>
                      );
                    },
                  })),
                  {
                    key: 'estado', header: 'Estado', render: (p) => {
                      const s = productStock(p);
                      const m = productMinStock(p);
                      const low = m > 0 && s <= m;
                      const critical = s <= 0;
                      return critical ? (
                        <span className="badge badge-red">Sin stock</span>
                      ) : low ? (
                        <span className="badge badge-amber">Stock bajo</span>
                      ) : (
                        <span className="badge badge-green">OK</span>
                      );
                    },
                  },
                  {
                    key: 'acciones', header: '', render: (p) => (
                      <button
                        onClick={() => openMoveModal(p)}
                        className="btn btn-ghost"
                        title="Transferir stock"
                        style={{ gap: 4, padding: 10 }}
                        disabled={locations.length === 0}
                      >
                        <ArrowRightLeft size={20} />
                      </button>
                    ),
                  },
                ] as ResponsiveTableColumn<Product>[]}
                renderMobileCard={(p) => {
                  const s = productStock(p);
                  const m = productMinStock(p);
                  const low = m > 0 && s <= m;
                  const critical = s <= 0;
                  const unit = p.saleUnit === 'KG' ? 'kg' : 'un';
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div className="mobile-card-head">
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                          {p.sku && <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{p.sku}</div>}
                        </div>
                        {critical ? (
                          <span className="badge badge-red">Sin stock</span>
                        ) : low ? (
                          <span className="badge badge-amber">Stock bajo</span>
                        ) : (
                          <span className="badge badge-green">OK</span>
                        )}
                      </div>
                      <div className="mobile-card-row">
                        <span>Categoría</span>
                        <span>{categoryName(p)} · {p.saleUnit}</span>
                      </div>
                      {locations.map((loc) => {
                        const row = p.stock?.find((s2) => s2.businessLocationId === loc.id);
                        const isKg = p.saleUnit === 'KG';
                        const qty = num(isKg ? row?.quantityKg : row?.quantity);
                        return (
                          <div className="mobile-card-row" key={loc.id}>
                            <span>{loc.name}</span>
                            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{qty} {unit}</span>
                          </div>
                        );
                      })}
                      <div className="mobile-card-row">
                        <span>Mínimo (total)</span>
                        <span style={{ fontFamily: 'var(--mono)' }}>{m} {unit}</span>
                      </div>
                      <button
                        onClick={() => openMoveModal(p)}
                        className="btn btn-secondary btn-sm"
                        style={{ marginTop: 4, gap: 6 }}
                        disabled={locations.length === 0}
                      >
                        <ArrowRightLeft size={13} /> Transferir stock
                      </button>
                    </div>
                  );
                }}
              />
            )}
          </div>
        </>
      )}

      {tab === 'movements' && (
        <>
          <div className="filter-bar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
            <input type="date" value={movFrom} onChange={(e) => setMovFrom(e.target.value)} style={{ width: 150 }} />
            <input type="date" value={movTo} onChange={(e) => setMovTo(e.target.value)} style={{ width: 150 }} />
            {(movFrom || movTo) && (
              <button onClick={() => { setMovFrom(''); setMovTo(''); }} className="btn btn-ghost btn-sm" style={{ color: 'var(--text3)' }}>
                <X size={13} /> Limpiar
              </button>
            )}
            <button onClick={loadMovements} className="btn btn-ghost btn-sm" title="Refrescar"><RefreshCcw size={13} /></button>
          </div>

          <div className="card">
            {movLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
            ) : (
          <ResponsiveTable
            data={movements}
            keyFor={(m) => m.id}
            emptyIcon={History}
            emptyMessage="Sin movimientos registrados"
            columns={[
              { key: 'fecha', header: 'Fecha', render: (m) => <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{fmtDate(m.createdAt)}</span> },
              { key: 'producto', header: 'Producto', render: (m) => <span style={{ color: 'var(--text)', fontSize: 13 }}>{m.product?.name ?? '—'}</span> },
              { key: 'tipo', header: 'Tipo', render: (m) => <span className="badge badge-slate">{MOVEMENT_LABELS[m.type] ?? m.type}</span> },
              { key: 'desde', header: 'Desde', render: (m) => <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{m.fromLocation?.name ?? '—'}</span> },
              { key: 'hacia', header: 'Hacia', render: (m) => <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{m.toLocation?.name ?? '—'}</span> },
              { key: 'cantidad', header: 'Cantidad', render: (m) => <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{m.quantityKg != null ? `${m.quantityKg}kg` : m.quantity ?? '—'}</span> },
              { key: 'usuario', header: 'Usuario', render: (m) => <span style={{ fontSize: 12, color: 'var(--text2)' }}>{m.user?.name ?? '—'}</span> },
              { key: 'motivo', header: 'Motivo', render: (m) => <span style={{ fontSize: 12, color: 'var(--text3)' }}>{m.reason ?? '—'}</span> },
            ] as ResponsiveTableColumn<StockMovement>[]}
            renderMobileCard={(m) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="mobile-card-head">
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{fmtDate(m.createdAt)}</span>
                  <span className="badge badge-slate">{MOVEMENT_LABELS[m.type] ?? m.type}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{m.product?.name ?? '—'}</div>
                <div className="mobile-card-row">
                  <span>Movimiento</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{m.fromLocation?.name ?? '—'} → {m.toLocation?.name ?? '—'}</span>
                </div>
                <div className="mobile-card-row">
                  <span>Cantidad</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{m.quantityKg != null ? `${m.quantityKg}kg` : m.quantity ?? '—'}</span>
                </div>
                <div className="mobile-card-row">
                  <span>Usuario</span>
                  <span>{m.user?.name ?? '—'}</span>
                </div>
                {m.reason && (
                  <div className="mobile-card-row">
                    <span>Motivo</span>
                    <span>{m.reason}</span>
                  </div>
                )}
              </div>
            )}
          />
            )}
          </div>
        </>
      )}

      <SkuScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleScannedSku}
        hint="Cuando lo detecte, abre el movimiento de stock para ese producto."
      />

      {/* Movement modal */}
      {moveModal && (
        <div className="modal-overlay" onClick={() => setMoveModal(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Movimiento de stock</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{moveModal.name}</div>
              </div>
              <button onClick={() => setMoveModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tipo</label>
                <select value={moveForm.type} onChange={(e) => setMoveForm((p) => ({ ...p, type: e.target.value as 'TRANSFER' | 'INGRESS' }))}>
                  <option value="TRANSFER">Transferencia</option>
                  <option value="INGRESS">Ingreso</option>
                </select>
              </div>
              {moveForm.type === 'TRANSFER' ? (
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Desde</label>
                    <select value={moveForm.fromLocationId} onChange={(e) => setMoveForm((p) => ({ ...p, fromLocationId: e.target.value }))}>
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Hacia</label>
                    <select value={moveForm.toLocationId} onChange={(e) => setMoveForm((p) => ({ ...p, toLocationId: e.target.value }))}>
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Hacia</label>
                  <select value={moveForm.toLocationId} onChange={(e) => setMoveForm((p) => ({ ...p, toLocationId: e.target.value }))}>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Cantidad {moveModal.saleUnit === 'KG' ? '(kg)' : ''}</label>
                <input type="number" min="0.01" step="any" value={moveForm.quantity} onChange={(e) => setMoveForm((p) => ({ ...p, quantity: e.target.value }))} placeholder="0" autoFocus />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Motivo</label>
                <input value={moveForm.reason} onChange={(e) => setMoveForm((p) => ({ ...p, reason: e.target.value }))} placeholder="Opcional" />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setMoveModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={submitMovement} disabled={saving || !moveForm.quantity} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Min stock modal */}
      {minModal && (
        <div className="modal-overlay" onClick={() => setMinModal(null)}>
          <div className="modal" style={{ maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Mínimo de stock</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{minModal.product.name} · {minModal.businessLocationName}</div>
              </div>
              <button onClick={() => setMinModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Mínimo {minModal.product.saleUnit === 'KG' ? '(kg)' : ''}</label>
                <input
                  type="number" min="0" step="any" autoFocus
                  value={minModal.product.saleUnit === 'KG' ? minModal.minQuantityKg : minModal.minQuantity}
                  onChange={(e) => setMinModal((p) => p && ({
                    ...p,
                    ...(p.product.saleUnit === 'KG' ? { minQuantityKg: e.target.value } : { minQuantity: e.target.value }),
                  }))}
                  placeholder="Sin mínimo"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setMinModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={submitMin} disabled={saving} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
