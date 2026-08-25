/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import type { Client, ClientCategory } from '@/types';
import { fmtMoney, normalizeArray } from '@/lib/helpers';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
import FilterBar from '@/components/mobile/FilterBar';
import { Users, Plus, Edit2, X, RefreshCcw, Eye, Phone, Mail } from 'lucide-react';

const CATEGORIES: ClientCategory[] = ['Cliente', 'Mayorista', 'Price'];

const catBadge = (c: ClientCategory) =>
  c === 'Mayorista' ? 'badge-green' : c === 'Price' ? 'badge-blue' : 'badge-gray';

const emptyForm = {
  nombre: '', apellido: '', dni: '', telefono: '', gmail: '',
  category: 'Cliente' as ClientCategory,
  addressStreet: '', addressNumber: '', addressCity: '', addressProvince: '',
  creditLimit: '', isAccountEnabled: 'false',
};

type Form = typeof emptyForm;

export default function ClientesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | 'detail' | null>(null);
  const [selected, setSelected] = useState<Client | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/clients', { params: { limit: 500 } });
      setClients(normalizeArray<Client>(data));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let c = clients;
    if (catFilter) c = c.filter((x) => x.category === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      c = c.filter((x) =>
        x.nombre.toLowerCase().includes(q) ||
        x.apellido?.toLowerCase().includes(q) ||
        x.dni?.includes(q) ||
        x.gmail?.toLowerCase().includes(q) ||
        x.telefono?.includes(q)
      );
    }
    return c;
  }, [clients, catFilter, search]);

  const f = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const openCreate = () => { setForm(emptyForm); setSelected(null); setModal('create'); };
  const openEdit = (c: Client) => {
    setSelected(c);
    setForm({
      nombre: c.nombre, apellido: c.apellido ?? '', dni: c.dni ?? '',
      telefono: c.telefono ?? '', gmail: c.gmail ?? '',
      category: c.category,
      addressStreet: c.addressStreet ?? '', addressNumber: c.addressNumber ?? '',
      addressCity: c.addressCity ?? '', addressProvince: c.addressProvince ?? '',
      creditLimit: String(c.creditLimit ?? ''),
      isAccountEnabled: String(c.isAccountEnabled ?? false),
    });
    setModal('edit');
  };

  const save = async () => {
    if (!form.nombre.trim()) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        creditLimit: form.creditLimit ? Number(form.creditLimit) : undefined,
        isAccountEnabled: form.isAccountEnabled === 'true',
      };
      if (modal === 'create') {
        await api.post('/clients', body);
        showToast('Cliente creado correctamente');
      } else if (selected) {
        await api.put(`/clients/${selected.id}`, body);
        showToast('Cliente actualizado');
      }
      setModal(null);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout
      title="Clientes"
      subtitle={`${filtered.length} de ${clients.length} clientes`}
      actions={
        <button onClick={openCreate} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
          <Plus size={13} /> Nuevo cliente
        </button>
      }
    >
      {toast && (
        <div style={{ position: 'fixed', top: 'calc(var(--app-header-height, 56px) + 14px)', right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)', animation: 'fadeIn 0.2s ease' }}>
          {toast}
        </div>
      )}

      {/* Filters */}
      <div style={{ marginBottom: 16 }}>
        <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Nombre, DNI o email...">
          <div style={{ display: 'flex', gap: 5 }}>
            <button onClick={() => setCatFilter('')} className={`btn btn-sm ${!catFilter ? 'btn-primary' : 'btn-secondary'}`}>Todos</button>
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCatFilter(catFilter === c ? '' : c)} className={`btn btn-sm ${catFilter === c ? 'btn-primary' : 'btn-secondary'}`}>{c}</button>
            ))}
          </div>
          <button onClick={load} className="btn btn-ghost btn-sm"><RefreshCcw size={13} /></button>
        </FilterBar>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : (
          <ResponsiveTable
            data={filtered}
            keyFor={(c) => c.id}
            emptyIcon={Users}
            emptyMessage="Sin clientes"
            columns={[
              {
                key: 'nombre', header: 'Nombre', render: (c) => (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.nombre} {c.apellido}</div>
                    {c.addressCity && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.addressCity}</div>}
                  </>
                ),
              },
              { key: 'dni', header: 'DNI', render: (c) => <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{c.dni || '—'}</span> },
              {
                key: 'contacto', header: 'Contacto', render: (c) => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {c.telefono && <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}><Phone size={10} style={{ color: 'var(--text3)' }} />{c.telefono}</div>}
                    {c.gmail && <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 5 }}><Mail size={10} />{c.gmail}</div>}
                  </div>
                ),
              },
              { key: 'categoria', header: 'Categoría', render: (c) => <span className={`badge ${catBadge(c.category)}`}>{c.category}</span> },
              {
                key: 'saldo', header: 'Saldo Cta. Cte.', render: (c) => (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: c.currentBalance < 0 ? 'var(--danger)' : c.currentBalance > 0 ? 'var(--warn)' : 'var(--text3)' }}>
                    {fmtMoney(c.currentBalance)}
                  </span>
                ),
              },
              {
                key: 'acciones', header: '', render: (c) => (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => { setSelected(c); setModal('detail'); }} className="btn btn-ghost btn-xs"><Eye size={12} /></button>
                    <button onClick={() => openEdit(c)} className="btn btn-ghost btn-xs"><Edit2 size={12} /></button>
                  </div>
                ),
              },
            ] as ResponsiveTableColumn<Client>[]}
            renderMobileCard={(c) => (
              <>
                <div className="mobile-card-head">
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.nombre} {c.apellido}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>DNI {c.dni || '—'}{c.addressCity ? ` · ${c.addressCity}` : ''}</div>
                  </div>
                  <span className={`badge ${catBadge(c.category)}`}>{c.category}</span>
                </div>
                {(c.telefono || c.gmail) && (
                  <div className="mobile-card-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    {c.telefono && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Phone size={10} />{c.telefono}</span>}
                    {c.gmail && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Mail size={10} />{c.gmail}</span>}
                  </div>
                )}
                <div className="mobile-card-row">
                  <span>Saldo Cta. Cte.</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: c.currentBalance < 0 ? 'var(--danger)' : c.currentBalance > 0 ? 'var(--warn)' : 'var(--text2)' }}>
                    {fmtMoney(c.currentBalance)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button onClick={() => { setSelected(c); setModal('detail'); }} className="btn btn-secondary btn-xs" style={{ flex: 1, gap: 4 }}><Eye size={12} /> Ver</button>
                  <button onClick={() => openEdit(c)} className="btn btn-secondary btn-xs" style={{ flex: 1, gap: 4 }}><Edit2 size={12} /> Editar</button>
                </div>
              </>
            )}
          />
        )}
      </div>

      {/* Create/Edit Modal */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800, fontSize: 15 }}>{modal === 'create' ? 'Nuevo cliente' : 'Editar cliente'}</span>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Nombre *</label>
                  <input value={form.nombre} onChange={f('nombre')} placeholder="Nombre" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Apellido</label>
                  <input value={form.apellido} onChange={f('apellido')} placeholder="Apellido" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">DNI</label>
                  <input value={form.dni} onChange={f('dni')} placeholder="DNI" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Categoría</label>
                  <select value={form.category} onChange={f('category')}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Teléfono</label>
                  <input value={form.telefono} onChange={f('telefono')} placeholder="+54 9 11 1234-5678" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Email</label>
                  <input type="email" value={form.gmail} onChange={f('gmail')} placeholder="cliente@email.com" />
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Dirección</div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Calle</label>
                  <input value={form.addressStreet} onChange={f('addressStreet')} placeholder="Av. Siempre Viva" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Número</label>
                  <input value={form.addressNumber} onChange={f('addressNumber')} placeholder="742" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Ciudad</label>
                  <input value={form.addressCity} onChange={f('addressCity')} placeholder="Córdoba" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Provincia</label>
                  <input value={form.addressProvince} onChange={f('addressProvince')} placeholder="Córdoba" />
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Cuenta corriente</div>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Límite de crédito</label>
                  <input type="number" min="0" value={form.creditLimit} onChange={f('creditLimit')} placeholder="0" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Habilitar cuenta corriente</label>
                  <select value={form.isAccountEnabled} onChange={f('isAccountEnabled')}>
                    <option value="false">No</option>
                    <option value="true">Sí</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={save} disabled={saving || !form.nombre.trim()} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : modal === 'create' ? 'Crear cliente' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {modal === 'detail' && selected && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{selected.nombre} {selected.apellido}</div>
                <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2 }}>DNI: {selected.dni || '—'}</div>
              </div>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="grid-responsive" style={{ gap: 10 }}>
                {[
                  ['Categoría', selected.category],
                  ['Teléfono', selected.telefono ?? '—'],
                  ['Email', selected.gmail ?? '—'],
                  ['Ciudad', selected.addressCity ?? '—'],
                  ['Dirección', [selected.addressStreet, selected.addressNumber].filter(Boolean).join(' ') || '—'],
                  ['Saldo Cta. Cte.', fmtMoney(selected.currentBalance)],
                  ['Límite crédito', selected.creditLimit ? fmtMoney(selected.creditLimit) : '—'],
                  ['Cta. Cte. habilitada', selected.isAccountEnabled ? 'Sí' : 'No'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: k === 'Saldo Cta. Cte.' && selected.currentBalance < 0 ? 'var(--danger)' : 'var(--text)' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => openEdit(selected)} className="btn btn-secondary btn-sm"><Edit2 size={13} /> Editar</button>
              <a href={`/cuentas-corrientes?clientId=${selected.id}`} className="btn btn-primary btn-sm">Ver cuenta corriente</a>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
