/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import { fmtMoney, normalizeArray, num } from '@/lib/helpers';
import { Tag, Plus, X, Trash2, Edit2, Users, DollarSign, Search } from 'lucide-react';

interface PriceList {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  items?: PriceListItem[];
}

interface PriceListItem {
  productId: string;
  price: number;
  product?: { id: string; name: string; price: number; sku?: string };
}

interface Product {
  id: string;
  name: string;
  price: number;
  sku?: string;
}

interface Client {
  id: string;
  nombre: string;
  apellido?: string;
}

const emptyForm = { name: '', description: '', isDefault: false };

export default function ListasPreciosPage() {
  const [lists, setLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PriceList | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [modal, setModal] = useState<'create' | 'edit' | 'assign' | 'import' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [editingPrice, setEditingPrice] = useState<{ productId: string; price: string } | null>(null);
  const [assignForm, setAssignForm] = useState({ clientId: '', priceListId: '' });
  const [importPrices, setImportPrices] = useState<Record<string, string>>({});
  const [clientSearch, setClientSearch] = useState('');

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/price-lists');
      setLists(normalizeArray<PriceList>(data));
    } finally { setLoading(false); }
  };

  const loadDetail = async (id: string) => {
    try {
      const { data } = await api.get(`/price-lists/${id}`);
      setSelected(data);
    } catch { showToast('Error al cargar detalle'); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (modal === 'assign' || modal === 'import') {
      api.get('/clients', { params: { limit: 500 } }).then(({ data }) => setClients(normalizeArray<Client>(data))).catch(() => {});
      api.get('/products', { params: { limit: 500, isActive: true } }).then(({ data }) => setProducts(normalizeArray<Product>(data))).catch(() => {});
    }
  }, [modal]);

  const openCreate = () => { setForm(emptyForm); setModal('create'); };
  const openEdit = (pl: PriceList) => { setForm({ name: pl.name, description: pl.description ?? '', isDefault: pl.isDefault }); setModal('edit'); };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (modal === 'create') {
        await api.post('/price-lists', form);
        showToast('Lista creada');
      } else if (selected) {
        await api.put(`/price-lists/${selected.id}`, form);
        showToast('Lista actualizada');
      }
      setModal(null);
      load();
      if (selected) loadDetail(selected.id);
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al guardar');
    } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!confirm('¿Eliminar esta lista de precios?')) return;
    try {
      await api.delete(`/price-lists/${id}`);
      showToast('Lista eliminada');
      if (selected?.id === id) setSelected(null);
      load();
    } catch (err: any) { showToast(err?.response?.data?.message ?? 'Error al eliminar'); }
  };

  const saveItemPrice = async () => {
    if (!editingPrice || !selected) return;
    setSaving(true);
    try {
      await api.post(`/price-lists/${selected.id}/items`, {
        productId: editingPrice.productId,
        price: Number(editingPrice.price),
      });
      showToast('Precio actualizado');
      setEditingPrice(null);
      loadDetail(selected.id);
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al actualizar precio');
    } finally { setSaving(false); }
  };

  const removeItem = async (productId: string) => {
    if (!selected) return;
    try {
      await api.delete(`/price-lists/${selected.id}/items/${productId}`);
      showToast('Producto quitado de la lista');
      loadDetail(selected.id);
    } catch { showToast('Error al quitar producto'); }
  };

  const assign = async () => {
    if (!assignForm.clientId || !assignForm.priceListId) return;
    setSaving(true);
    try {
      await api.put(`/price-lists/clients/${assignForm.clientId}`, { priceListId: assignForm.priceListId });
      showToast('Lista asignada al cliente');
      setModal(null);
      setAssignForm({ clientId: '', priceListId: '' });
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al asignar');
    } finally { setSaving(false); }
  };

  const importAll = async () => {
    if (!selected) return;
    const items = Object.entries(importPrices)
      .filter(([, v]) => v && !isNaN(Number(v)) && Number(v) > 0)
      .map(([productId, price]) => ({ productId, price: Number(price) }));
    if (!items.length) { showToast('Ingresá al menos un precio'); return; }
    setSaving(true);
    try {
      await api.put(`/price-lists/${selected.id}/items`, { items });
      showToast(`${items.length} precios importados`);
      setModal(null);
      setImportPrices({});
      loadDetail(selected.id);
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al importar');
    } finally { setSaving(false); }
  };

  const filteredClients = clientSearch.trim()
    ? clients.filter((c) => `${c.nombre} ${c.apellido ?? ''}`.toLowerCase().includes(clientSearch.toLowerCase()))
    : clients;

  return (
    <AppLayout
      title="Listas de Precios"
      subtitle="Precios especiales por lista o cliente"
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setModal('assign')} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
            <Users size={13} /> Asignar a cliente
          </button>
          <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
            <Plus size={13} /> Nueva lista
          </button>
        </div>
      }
    >
      {toast && (
        <div style={{ position: 'fixed', top: 70, right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)', animation: 'fadeIn 0.2s ease' }}>{toast}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '280px 1fr' : '1fr', gap: 16 }}>
        {/* Lists panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
          ) : lists.length === 0 ? (
            <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              <Tag size={28} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
              No hay listas de precios
            </div>
          ) : lists.map((pl) => (
            <div
              key={pl.id}
              className="card"
              onClick={() => { setSelected(pl); loadDetail(pl.id); }}
              style={{
                padding: '12px 14px', cursor: 'pointer',
                border: selected?.id === pl.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: selected?.id === pl.id ? 'rgba(37,99,235,0.06)' : 'var(--surface2)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tag size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.name}</span>
                    {pl.isDefault && <span className="badge badge-green" style={{ fontSize: 9 }}>Default</span>}
                  </div>
                  {pl.description && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '4px 6px' }}
                    onClick={(e) => { e.stopPropagation(); openEdit(pl); setSelected(pl); }}
                    title="Editar"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '4px 6px', color: 'var(--danger, #ef4444)' }}
                    onClick={(e) => { e.stopPropagation(); del(pl.id); }}
                    title="Eliminar"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="section-title" style={{ fontSize: 14 }}>{selected.name}</div>
                {selected.description && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{selected.description}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ gap: 6 }}
                  onClick={() => { setImportPrices({}); setModal('import'); }}
                >
                  <DollarSign size={13} /> Importar precios
                </button>
                <button className="btn btn-ghost btn-sm" style={{ padding: '4px 6px' }} onClick={() => setSelected(null)}>
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="table-wrap">
              {!selected.items ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
              ) : selected.items.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                  Sin productos en esta lista. Usá "Importar precios" para agregar.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Producto', 'SKU', 'Precio normal', 'Precio lista', ''].map((h) => (
                        <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textAlign: 'left', whiteSpace: 'nowrap', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.items.map((item) => (
                      <tr key={item.productId} style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(37,99,235,0.04)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
                          {item.product?.name ?? item.productId}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                          {item.product?.sku ?? '—'}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text2)' }}>
                          {item.product ? fmtMoney(item.product.price) : '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {editingPrice?.productId === item.productId ? (
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <input
                                type="number"
                                value={editingPrice.price}
                                onChange={(e) => setEditingPrice({ ...editingPrice, price: e.target.value })}
                                style={{ width: 100, fontSize: 13 }}
                                autoFocus
                                onKeyDown={(e) => { if (e.key === 'Enter') saveItemPrice(); if (e.key === 'Escape') setEditingPrice(null); }}
                              />
                              <button className="btn btn-primary btn-sm" onClick={saveItemPrice} disabled={saving} style={{ padding: '4px 8px', fontSize: 11 }}>OK</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setEditingPrice(null)} style={{ padding: '4px 6px' }}><X size={12} /></button>
                            </div>
                          ) : (
                            <span
                              style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--mono)' }}
                              onClick={() => setEditingPrice({ productId: item.productId, price: String(item.price) })}
                              title="Click para editar"
                            >
                              {fmtMoney(item.price)}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 6px', color: 'var(--danger, #ef4444)' }} onClick={() => removeItem(item.productId)}>
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {(modal === 'create' || modal === 'edit') && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 420, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div className="section-title">{modal === 'create' ? 'Nueva lista de precios' : 'Editar lista'}</div>
              <button className="btn btn-ghost btn-sm" style={{ padding: '4px 6px' }} onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Nombre *</label>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ej: Lista mayorista" style={{ width: '100%', fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Descripción</label>
                <input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Descripción opcional" style={{ width: '100%', fontSize: 13 }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))} />
                Lista por defecto
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || !form.name.trim()}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal asignar a cliente */}
      {modal === 'assign' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 440, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div className="section-title">Asignar lista a cliente</div>
              <button className="btn btn-ghost btn-sm" style={{ padding: '4px 6px' }} onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Buscar cliente</label>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                  <input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Nombre del cliente…" style={{ width: '100%', fontSize: 13, paddingLeft: 30 }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Cliente *</label>
                <select value={assignForm.clientId} onChange={(e) => setAssignForm((p) => ({ ...p, clientId: e.target.value }))} style={{ width: '100%', fontSize: 13 }}>
                  <option value="">Seleccionar cliente…</option>
                  {filteredClients.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre} {c.apellido ?? ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Lista de precios *</label>
                <select value={assignForm.priceListId} onChange={(e) => setAssignForm((p) => ({ ...p, priceListId: e.target.value }))} style={{ width: '100%', fontSize: 13 }}>
                  <option value="">Seleccionar lista…</option>
                  {lists.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}{pl.isDefault ? ' (default)' : ''}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={assign} disabled={saving || !assignForm.clientId || !assignForm.priceListId}>
                {saving ? 'Asignando…' : 'Asignar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal importar precios */}
      {modal === 'import' && selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 560, padding: 24, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div className="section-title">Importar precios</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>Dejá en blanco los productos que no querés incluir</div>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ padding: '4px 6px' }} onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {products.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>Precio actual: {fmtMoney(p.price)}</div>
                  </div>
                  <input
                    type="number"
                    placeholder="Precio lista"
                    value={importPrices[p.id] ?? ''}
                    onChange={(e) => setImportPrices((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    style={{ width: 120, fontSize: 13 }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={importAll} disabled={saving}>
                {saving ? 'Importando…' : 'Importar precios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
