/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { Supplier, Product } from '@/types';
import { normalizeArray, fmtMoney, num } from '@/lib/helpers';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
import FilterBar from '@/components/mobile/FilterBar';
import { Truck, Plus, Edit2, Trash2, X, CreditCard, Package, Search } from 'lucide-react';

const emptyForm = { name: '', cuit: '', contactName: '', phone: '', email: '', address: '', notes: '' };

export default function ProveedoresPage() {
  const { tenant } = useParams<{ tenant: string }>();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Supplier | null>(null);

  const [detail, setDetail] = useState<Supplier | null>(null);
  const [detailSearch, setDetailSearch] = useState('');
  const [bulkPct, setBulkPct] = useState('');
  const [applyingBulk, setApplyingBulk] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [sr, pr] = await Promise.all([
        api.get('/suppliers'),
        api.get('/products', { params: { limit: 500 } }).catch(() => null),
      ]);
      setSuppliers(normalizeArray<Supplier>(sr.data));
      if (pr) setProducts(normalizeArray<Product>(pr.data));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openDetail = (s: Supplier) => { setDetail(s); setDetailSearch(''); setBulkPct(''); };

  const linkedProducts = products.filter((p) => p.supplierId === detail?.id);
  const searchResults = detailSearch.trim()
    ? products
        .filter((p) => p.supplierId !== detail?.id)
        .filter((p) => p.name.toLowerCase().includes(detailSearch.toLowerCase()) || p.sku?.toLowerCase().includes(detailSearch.toLowerCase()))
        .slice(0, 20)
    : [];

  const linkProduct = async (p: Product) => {
    if (!detail) return;
    setLinking(p.id);
    try {
      await api.put(`/products/${p.id}`, { supplierId: detail.id });
      setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, supplierId: detail.id } : x)));
      toast.success(`"${p.name}" vinculado a ${detail.name}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo vincular el producto');
    } finally { setLinking(null); }
  };

  const unlinkProduct = async (p: Product) => {
    setLinking(p.id);
    try {
      await api.put(`/products/${p.id}`, { supplierId: '' });
      setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, supplierId: null } : x)));
    } catch {
      toast.error('No se pudo quitar el producto');
    } finally { setLinking(null); }
  };

  const applyBulk = async () => {
    if (!detail || bulkPct === '') return;
    setApplyingBulk(true);
    try {
      const { data } = await api.post(`/suppliers/${detail.id}/bulk-price-update`, { percentage: num(bulkPct) });
      toast.success(`${data.count} productos actualizados con ${num(bulkPct) >= 0 ? '+' : ''}${bulkPct}%`);
      const { data: pr } = await api.get('/products', { params: { limit: 500 } });
      setProducts(normalizeArray<Product>(pr));
      setBulkPct('');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo aplicar el aumento');
    } finally { setApplyingBulk(false); }
  };


  const openCreate = () => { setForm(emptyForm); setEditing(null); setModal('create'); };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name: s.name, cuit: s.cuit ?? '', contactName: s.contactName ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '', notes: s.notes ?? '' });
    setModal('edit');
  };

  const f = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
      if (modal === 'create') {
        await api.post('/suppliers', body);
        toast.success('Proveedor creado');
      } else if (editing) {
        await api.put(`/suppliers/${editing.id}`, body);
        toast.success('Proveedor actualizado');
      }
      setModal(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error al guardar');
    } finally { setSaving(false); }
  };

  const del = async (s: Supplier) => {
    try {
      await api.delete(`/suppliers/${s.id}`);
      toast.success('Proveedor eliminado');
      load();
    } catch { toast.error('Error al eliminar'); }
    setConfirmDelete(null);
  };

  const filtered = search.trim()
    ? suppliers.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.cuit?.includes(search))
    : suppliers;

  return (
    <AppLayout
      title="Proveedores"
      subtitle={`${suppliers.length} proveedores`}
      actions={
        <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
          <Plus size={13} /> Nuevo proveedor
        </button>
      }
    >
      <div style={{ marginBottom: 14 }}>
        <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Buscar proveedor..." />
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : (
          <ResponsiveTable
            data={filtered}
            keyFor={(s) => s.id}
            emptyIcon={Truck}
            emptyMessage="Sin proveedores"
            columns={[
              { key: 'nombre', header: 'Nombre', render: (s) => <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>{s.name}</span> },
              { key: 'cuit', header: 'CUIT', render: (s) => <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{s.cuit ?? '—'}</span> },
              { key: 'contacto', header: 'Contacto', render: (s) => <span style={{ fontSize: 12 }}>{s.contactName ?? '—'}</span> },
              { key: 'telefono', header: 'Teléfono', render: (s) => <span style={{ fontSize: 12 }}>{s.phone ?? '—'}</span> },
              { key: 'email', header: 'Email', render: (s) => <span style={{ fontSize: 12, color: 'var(--text3)' }}>{s.email ?? '—'}</span> },
              { key: 'estado', header: 'Estado', render: (s) => <span className={`badge ${s.isActive ? 'badge-green' : 'badge-gray'}`}>{s.isActive ? 'Activo' : 'Inactivo'}</span> },
              {
                key: 'deuda', header: 'Deuda', style: { textAlign: 'right' },
                render: (s) => (
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12, color: s.currentBalance > 0 ? 'var(--warn)' : 'var(--text3)' }}>
                    {fmtMoney(s.currentBalance)}
                  </span>
                ),
              },
              {
                key: 'acciones', header: '', render: (s) => (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => openDetail(s)} className="btn btn-ghost btn-xs" title="Productos y aumento de precios"><Package size={12} /></button>
                    <a href={`/${tenant}/cuentas-corrientes`} className="btn btn-ghost btn-xs" title="Cuenta corriente"><CreditCard size={12} /></a>
                    <button onClick={() => openEdit(s)} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                    <button onClick={() => setConfirmDelete(s)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
                  </div>
                ),
              },
            ] as ResponsiveTableColumn<Supplier>[]}
            renderMobileCard={(s) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="mobile-card-head">
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.name}</span>
                  <span className={`badge ${s.isActive ? 'badge-green' : 'badge-gray'}`}>{s.isActive ? 'Activo' : 'Inactivo'}</span>
                </div>
                <div className="mobile-card-row">
                  <span>CUIT</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{s.cuit ?? '—'}</span>
                </div>
                <div className="mobile-card-row">
                  <span>Contacto</span>
                  <span>{s.contactName ?? '—'}</span>
                </div>
                <div className="mobile-card-row">
                  <span>Teléfono</span>
                  <span>{s.phone ?? '—'}</span>
                </div>
                <div className="mobile-card-row">
                  <span>Email</span>
                  <span>{s.email ?? '—'}</span>
                </div>
                <div className="mobile-card-row">
                  <span>Deuda</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: s.currentBalance > 0 ? 'var(--warn)' : 'var(--text3)' }}>{fmtMoney(s.currentBalance)}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button onClick={(e) => { e.stopPropagation(); openDetail(s); }} className="btn btn-ghost btn-xs" style={{ gap: 4 }}>
                    <Package size={12} /> Productos
                  </button>
                  <a href={`/${tenant}/cuentas-corrientes`} onClick={(e) => e.stopPropagation()} className="btn btn-ghost btn-xs" style={{ gap: 4 }}>
                    <CreditCard size={12} /> Cta. cte.
                  </a>
                  <button onClick={(e) => { e.stopPropagation(); openEdit(s); }} className="btn btn-ghost btn-xs" style={{ gap: 4 }}>
                    <Edit2 size={12} /> Editar
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(s); }} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)', gap: 4 }}>
                    <Trash2 size={12} /> Eliminar
                  </button>
                </div>
              </div>
            )}
          />
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800, fontSize: 15 }}>{modal === 'create' ? 'Nuevo proveedor' : 'Editar proveedor'}</span>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Nombre *</label>
                  <input value={form.name} onChange={f('name')} placeholder="Razón social" autoFocus />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">CUIT</label>
                  <input value={form.cuit} onChange={f('cuit')} placeholder="20-12345678-9" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Contacto</label>
                  <input value={form.contactName} onChange={f('contactName')} placeholder="Nombre del contacto" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Teléfono</label>
                  <input value={form.phone} onChange={f('phone')} placeholder="+54 351 000-0000" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Email</label>
                  <input type="email" value={form.email} onChange={f('email')} placeholder="proveedor@empresa.com" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Dirección</label>
                  <input value={form.address} onChange={f('address')} placeholder="Av. Colón 1234, Córdoba" />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Notas</label>
                <textarea value={form.notes} onChange={f('notes')} rows={2} placeholder="Notas internas" style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={save} disabled={saving || !form.name.trim()} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : modal === 'create' ? 'Crear' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800, fontSize: 15 }}>{detail.name} — Productos</span>
              <button onClick={() => setDetail(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body">
              <div style={{ padding: 10, background: 'var(--bg2)', borderRadius: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Aumentar (o bajar) precios en bloque</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
                  Aplica el % sobre el precio de venta actual de los {linkedProducts.length} productos de este proveedor.
                  Positivo = aumento (ej. 10), negativo = descuento (ej. -10). No toca el costo de compra.
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="number" step="any"
                    value={bulkPct}
                    onChange={(e) => setBulkPct(e.target.value)}
                    placeholder="Ej: 10"
                    style={{ width: 100 }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>%</span>
                  <button
                    onClick={applyBulk}
                    disabled={applyingBulk || bulkPct === '' || linkedProducts.length === 0}
                    className="btn btn-primary btn-xs"
                  >
                    {applyingBulk ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Aplicar a todos'}
                  </button>
                </div>
              </div>

              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Productos vinculados ({linkedProducts.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto', marginBottom: 14 }}>
                {linkedProducts.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text3)', padding: '10px 0' }}>Todavía no hay productos vinculados a este proveedor.</div>
                )}
                {linkedProducts.map((p) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtMoney(p.saleUnit === 'KG' ? (p.pricePerKg ?? 0) : p.price)}{p.saleUnit === 'KG' ? '/kg' : ''}</div>
                    </div>
                    <button onClick={() => unlinkProduct(p)} disabled={linking === p.id} className="btn btn-ghost btn-xs" title="Quitar del proveedor"><X size={12} /></button>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Vincular otro producto</div>
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text3)' }} />
                <input
                  value={detailSearch}
                  onChange={(e) => setDetailSearch(e.target.value)}
                  placeholder="Buscar producto por nombre o SKU..."
                  style={{ paddingLeft: 30 }}
                />
              </div>
              {searchResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {searchResults.map((p) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        {p.supplier && <div style={{ fontSize: 11, color: 'var(--text3)' }}>Actualmente: {p.supplier.name}</div>}
                      </div>
                      <button onClick={() => linkProduct(p)} disabled={linking === p.id} className="btn btn-secondary btn-xs">Vincular</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 340 }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700 }}>Eliminar proveedor</span>
              <button onClick={() => setConfirmDelete(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: 'var(--text2)' }}>¿Eliminar <strong style={{ color: 'var(--text)' }}>{confirmDelete.name}</strong>?</p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setConfirmDelete(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={() => del(confirmDelete)} className="btn btn-danger btn-sm">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
