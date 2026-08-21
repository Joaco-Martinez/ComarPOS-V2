/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import SkuScannerModal from '@/components/SkuScannerModal';
import api from '@/lib/api';
import type { Product, ProductCategory, StockMovement } from '@/types';
import { categoryName, fmtDate, fmtMoney, normalizeArray, num } from '@/lib/helpers';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
import { BarChart2, Search, ArrowRightLeft, Plus, X, AlertTriangle, RefreshCcw, History, ScanBarcode, Package } from 'lucide-react';

const MOVEMENT_LABELS: Record<string, string> = {
  TRANSFER: 'Transferencia', INGRESS: 'Ingreso', ADJUSTMENT: 'Ajuste',
  SALE: 'Venta', SALE_CANCEL: 'Cancelación venta',
};

export default function StockPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [tab, setTab] = useState<'stock' | 'movements'>('stock');
  const [moveModal, setMoveModal] = useState<Product | null>(null);
  const [moveForm, setMoveForm] = useState({ type: 'TRANSFER' as 'TRANSFER' | 'INGRESS', from: 'LOCAL', to: 'DEPOSITO', quantity: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [pr, cr, mr] = await Promise.all([
        api.get('/products', { params: { limit: 500, isActive: true } }),
        api.get('/categories'),
        api.get('/products/movements', { params: { limit: 100 } }).catch(() => null),
      ]);
      setProducts(normalizeArray<Product>(pr.data));
      setCategories(normalizeArray<ProductCategory>(cr.data).filter((c) => c.isActive));
      if (mr) setMovements(normalizeArray<StockMovement>(mr.data));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let p = products.filter((x) => x.isService !== true);
    if (catFilter) p = p.filter((x) => x.categoryId === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      p = p.filter((x) => x.name.toLowerCase().includes(q) || x.sku?.toLowerCase().includes(q));
    }
    return p;
  }, [products, catFilter, search]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const handleScannedSku = (rawSku: string) => {
    const sku = rawSku.trim().toLowerCase();
    const found = products.find((p) => p.sku && p.sku.trim().toLowerCase() === sku);
    if (!found) {
      showToast(`No encontré ningún producto con SKU: ${rawSku}`);
      return;
    }
    setScannerOpen(false);
    setMoveModal(found);
    setMoveForm({ type: 'TRANSFER', from: 'LOCAL', to: 'DEPOSITO', quantity: '', reason: '' });
  };

  const submitMovement = async () => {
    if (!moveModal) return;
    setSaving(true);
    try {
      const isKg = moveModal.saleUnit === 'KG';
      const reason = moveForm.reason || undefined;
      if (moveForm.type === 'TRANSFER') {
        if (isKg) {
          await api.post(`/products/${moveModal.id}/transfer-kg`, { from: moveForm.from, quantityKg: Number(moveForm.quantity), reason });
        } else {
          await api.post('/products/transfer', { productId: moveModal.id, from: moveForm.from, quantity: Number(moveForm.quantity), reason });
        }
      } else {
        if (isKg) {
          await api.post(`/products/${moveModal.id}/add-stock-kg`, { to: moveForm.to, quantityKg: Number(moveForm.quantity), reason });
        } else {
          await api.post('/products/add-stock', { productId: moveModal.id, to: moveForm.to, quantity: Number(moveForm.quantity), reason });
        }
      }
      showToast('Movimiento registrado');
      setMoveModal(null);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al registrar movimiento');
    } finally {
      setSaving(false);
    }
  };

  const lowStockCount = products.filter((p) => {
    const s = p.saleUnit === 'KG' ? num(p.stockLocalKg) : num(p.stockLocal);
    const m = p.saleUnit === 'KG' ? num(p.minStockKg) : num(p.minStock);
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
      {toast && (
        <div style={{ position: 'fixed', top: 70, right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)', animation: 'fadeIn 0.2s ease' }}>
          {toast}
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
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ position: 'relative', flex: '0 0 240px' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto..." style={{ paddingLeft: 30, fontSize: 13 }} />
            </div>
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ fontSize: 13, width: 180 }}>
              <option value="">Todas las categorías</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
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
                  {
                    key: 'local', header: 'Stock local', render: (p) => {
                      const local = p.saleUnit === 'KG' ? num(p.stockLocalKg) : num(p.stockLocal);
                      const min = p.saleUnit === 'KG' ? num(p.minStockKg) : num(p.minStock);
                      const low = min > 0 && local <= min;
                      const critical = local <= 0 && !p.isService;
                      const unit = p.saleUnit === 'KG' ? 'kg' : 'un';
                      return (
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: critical ? 'var(--danger)' : low ? 'var(--warn)' : 'var(--success)' }}>
                          {critical && <AlertTriangle size={11} style={{ display: 'inline', marginRight: 4 }} />}
                          {local} {unit}
                        </span>
                      );
                    },
                  },
                  {
                    key: 'deposito', header: 'Stock depósito', render: (p) => {
                      const dep = p.saleUnit === 'KG' ? num(p.stockDepositoKg) : num(p.stockDeposito);
                      const unit = p.saleUnit === 'KG' ? 'kg' : 'un';
                      return <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text2)' }}>{dep} {unit}</span>;
                    },
                  },
                  {
                    key: 'minimo', header: 'Mínimo', render: (p) => {
                      const min = p.saleUnit === 'KG' ? num(p.minStockKg) : num(p.minStock);
                      const unit = p.saleUnit === 'KG' ? 'kg' : 'un';
                      return <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>{min} {unit}</span>;
                    },
                  },
                  {
                    key: 'estado', header: 'Estado', render: (p) => {
                      const local = p.saleUnit === 'KG' ? num(p.stockLocalKg) : num(p.stockLocal);
                      const min = p.saleUnit === 'KG' ? num(p.minStockKg) : num(p.minStock);
                      const low = min > 0 && local <= min;
                      const critical = local <= 0 && !p.isService;
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
                        onClick={() => { setMoveModal(p); setMoveForm({ type: 'TRANSFER', from: 'LOCAL', to: 'DEPOSITO', quantity: '', reason: '' }); }}
                        className="btn btn-ghost"
                        title="Transferir stock"
                        style={{ gap: 4, padding: 10 }}
                      >
                        <ArrowRightLeft size={20} />
                      </button>
                    ),
                  },
                ] as ResponsiveTableColumn<Product>[]}
                renderMobileCard={(p) => {
                  const local = p.saleUnit === 'KG' ? num(p.stockLocalKg) : num(p.stockLocal);
                  const dep = p.saleUnit === 'KG' ? num(p.stockDepositoKg) : num(p.stockDeposito);
                  const min = p.saleUnit === 'KG' ? num(p.minStockKg) : num(p.minStock);
                  const low = min > 0 && local <= min;
                  const critical = local <= 0 && !p.isService;
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
                      <div className="mobile-card-row">
                        <span>Stock local</span>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: critical ? 'var(--danger)' : low ? 'var(--warn)' : 'var(--success)' }}>{local} {unit}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span>Stock depósito</span>
                        <span style={{ fontFamily: 'var(--mono)' }}>{dep} {unit}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span>Mínimo</span>
                        <span style={{ fontFamily: 'var(--mono)' }}>{min} {unit}</span>
                      </div>
                      <button
                        onClick={() => { setMoveModal(p); setMoveForm({ type: 'TRANSFER', from: 'LOCAL', to: 'DEPOSITO', quantity: '', reason: '' }); }}
                        className="btn btn-secondary btn-sm"
                        style={{ marginTop: 4, gap: 6 }}
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
        <div className="card">
          <ResponsiveTable
            data={movements}
            keyFor={(m) => m.id}
            emptyIcon={History}
            emptyMessage="Sin movimientos registrados"
            columns={[
              { key: 'fecha', header: 'Fecha', render: (m) => <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{fmtDate(m.createdAt)}</span> },
              { key: 'producto', header: 'Producto', render: (m) => <span style={{ color: 'var(--text)', fontSize: 13 }}>{m.product?.name ?? '—'}</span> },
              { key: 'tipo', header: 'Tipo', render: (m) => <span className="badge badge-slate">{MOVEMENT_LABELS[m.type] ?? m.type}</span> },
              { key: 'desde', header: 'Desde', render: (m) => <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{m.from ?? '—'}</span> },
              { key: 'hacia', header: 'Hacia', render: (m) => <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{m.to ?? '—'}</span> },
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
                  <span style={{ fontFamily: 'var(--mono)' }}>{m.from ?? '—'} → {m.to ?? '—'}</span>
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
        </div>
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
                    <select value={moveForm.from} onChange={(e) => setMoveForm((p) => ({ ...p, from: e.target.value }))}>
                      <option value="LOCAL">Local</option>
                      <option value="DEPOSITO">Depósito</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Hacia</label>
                    <select value={moveForm.to} onChange={(e) => setMoveForm((p) => ({ ...p, to: e.target.value }))}>
                      <option value="LOCAL">Local</option>
                      <option value="DEPOSITO">Depósito</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Hacia</label>
                  <select value={moveForm.to} onChange={(e) => setMoveForm((p) => ({ ...p, to: e.target.value }))}>
                    <option value="LOCAL">Local</option>
                    <option value="DEPOSITO">Depósito</option>
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
    </AppLayout>
  );
}
