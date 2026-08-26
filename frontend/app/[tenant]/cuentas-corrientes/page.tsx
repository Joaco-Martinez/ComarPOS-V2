/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import ClientFormModal from '@/components/ClientFormModal';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { AccountMovement, Client } from '@/types';
import { clientName, fmtDate, fmtMoney, normalizeArray, num, getPlanLockMessage } from '@/lib/helpers';
import { CreditCard, Search, Plus, X, RefreshCcw, Eye, Lock } from 'lucide-react';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';

const typeBadge = (t: string) => {
  if (t === 'DEBT') return 'badge-red';
  if (t === 'PAYMENT') return 'badge-green';
  if (t === 'CREDIT_NOTE') return 'badge-cyan';
  return 'badge-gray';
};

const typeLabel: Record<string, string> = {
  DEBT: 'Deuda', PAYMENT: 'Pago', ADJUSTMENT_POSITIVE: 'Ajuste +',
  ADJUSTMENT_NEGATIVE: 'Ajuste −', CREDIT_NOTE: 'Nota crédito',
};

export default function CuentasCorrientesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [movements, setMovements] = useState<AccountMovement[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientSearch, setClientSearch] = useState('');
  const [newClientQuery, setNewClientQuery] = useState<string | null>(null);
  const [modal, setModal] = useState<'payment' | 'adjustment' | null>(null);
  const [form, setForm] = useState({ amount: '', type: 'PAYMENT' as any, paymentMethod: 'EFECTIVO', description: '' });
  const [adjForm, setAdjForm] = useState({ amount: '', type: 'POSITIVE' as 'POSITIVE' | 'NEGATIVE', description: '' });
  const [saving, setSaving] = useState(false);
  const [lockMessage, setLockMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/clients', { params: { limit: 500, hasAccount: true } });
      setClients(normalizeArray<Client>(data).filter((c) => c.isAccountEnabled));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const loadMovements = async (clientId: string) => {
    setLockMessage(null);
    try {
      const { data } = await api.get(`/accounts/clients/${clientId}`);
      setMovements(normalizeArray<AccountMovement>(data?.movements ?? data));
    } catch (err: any) {
      const lockMsg = getPlanLockMessage(err);
      if (lockMsg) setLockMessage(lockMsg);
      setMovements([]);
    }
  };

  const selectClient = (c: Client) => {
    setSelectedClient(c);
    loadMovements(c.id);
  };


  const savePayment = async () => {
    if (!selectedClient || !form.amount) return;
    setSaving(true);
    try {
      await api.post(`/accounts/clients/${selectedClient.id}/payment`, {
        amount: Number(form.amount),
        method: form.paymentMethod,
        description: form.description || undefined,
      });
      toast.success('Pago registrado');
      setModal(null);
      setForm({ amount: '', type: 'PAYMENT', paymentMethod: 'EFECTIVO', description: '' });
      load();
      loadMovements(selectedClient.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error');
    } finally { setSaving(false); }
  };

  const saveAdjustment = async () => {
    if (!selectedClient || !adjForm.amount) return;
    setSaving(true);
    try {
      await api.post(`/accounts/clients/${selectedClient.id}/adjustment`, {
        amount: Number(adjForm.amount),
        type: adjForm.type,
        description: adjForm.description || undefined,
      });
      toast.success('Ajuste registrado');
      setModal(null);
      setAdjForm({ amount: '', type: 'POSITIVE', description: '' });
      load();
      loadMovements(selectedClient.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error');
    } finally { setSaving(false); }
  };

  const filteredClients = useMemo(() => {
    const q = clientSearch.toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      `${c.nombre} ${c.apellido ?? ''}`.toLowerCase().includes(q) || c.dni?.includes(q)
    );
  }, [clients, clientSearch]);

  return (
    <AppLayout title="Cuentas Corrientes" subtitle="Gestión de crédito y deuda de clientes">
      <div className="grid-responsive cta-cte-layout" style={{ ['--gtc' as any]: '280px 1fr', gap: 16 }}>
        {/* Clients list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Buscar cliente..." style={{ paddingLeft: 30, fontSize: 13 }} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
            ) : filteredClients.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}><CreditCard size={24} /><p>Sin clientes con cta. cte.</p></div>
            ) : (
              filteredClients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectClient(c)}
                  style={{
                    background: selectedClient?.id === c.id ? 'rgba(13,89,231,0.12)' : 'var(--surface)',
                    border: `1px solid ${selectedClient?.id === c.id ? 'rgba(13,89,231,0.3)' : 'var(--border)'}`,
                    borderRadius: 7, padding: '10px 12px', textAlign: 'left', cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.nombre} {c.apellido}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{c.category}</span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: c.currentBalance > 0 ? 'var(--warn)' : c.currentBalance < 0 ? 'var(--success)' : 'var(--text3)' }}>
                      {fmtMoney(c.currentBalance)}
                    </span>
                  </div>
                </button>
              ))
            )}
            {!loading && (
              <button
                onClick={() => setNewClientQuery(clientSearch)}
                className="btn btn-ghost btn-sm"
                style={{ justifyContent: 'flex-start', gap: 6, color: 'var(--accent)', marginTop: 4 }}
              >
                <Plus size={13} />
                {clientSearch.trim() ? `Crear cliente "${clientSearch.trim()}"` : 'Crear cliente nuevo'}
              </button>
            )}
          </div>
        </div>

        {/* Movements panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!selectedClient ? (
            <div className="card empty-state" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CreditCard size={36} />
              <p>Seleccioná un cliente para ver su cuenta corriente</p>
            </div>
          ) : lockMessage ? (
            <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 10, padding: 28 }}>
              <Lock size={28} style={{ color: 'var(--text3)' }} />
              <div style={{ fontWeight: 700, fontSize: 14 }}>No incluido en tu plan</div>
              <p style={{ fontSize: 13, color: 'var(--text3)', maxWidth: 360 }}>{lockMessage}</p>
              <a href="/suscripcion" className="btn btn-primary btn-sm" style={{ marginTop: 6 }}>Ver planes</a>
            </div>
          ) : (
            <>
              <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{clientName(selectedClient)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                    Saldo: <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14, color: selectedClient.currentBalance > 0 ? 'var(--warn)' : selectedClient.currentBalance < 0 ? 'var(--success)' : 'var(--text3)' }}>
                      {fmtMoney(selectedClient.currentBalance)}
                    </span>
                    {selectedClient.creditLimit && (
                      <> · Límite: <span style={{ fontFamily: 'var(--mono)' }}>{fmtMoney(selectedClient.creditLimit)}</span></>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => { setAdjForm({ amount: '', type: 'POSITIVE', description: '' }); setModal('adjustment'); }} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
                    <Plus size={13} /> Ajuste
                  </button>
                  <button onClick={() => setModal('payment')} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
                    <Plus size={13} /> Registrar pago
                  </button>
                </div>
              </div>

              <div className="card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  <ResponsiveTable
                    data={movements}
                    keyFor={(m) => m.id}
                    emptyIcon={CreditCard}
                    emptyMessage="Sin movimientos"
                    columns={[
                      { key: 'fecha', header: 'Fecha', render: (m) => <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{fmtDate(m.date)}</span> },
                      { key: 'tipo', header: 'Tipo', render: (m) => <span className={`badge ${typeBadge(m.type)}`}>{typeLabel[m.type] ?? m.type}</span> },
                      { key: 'metodo', header: 'Método', render: (m) => <span style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>{m.paymentMethod ?? '—'}</span> },
                      { key: 'descripcion', header: 'Descripción', render: (m) => <span style={{ fontSize: 12, color: 'var(--text3)' }}>{m.description ?? (m.sale ? `Venta #${m.saleId?.slice(-6)}` : '—')}</span> },
                      {
                        key: 'monto', header: 'Monto', style: { textAlign: 'right' },
                        render: (m) => (
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: m.type === 'PAYMENT' ? 'var(--success)' : 'var(--danger)', fontSize: 13 }}>
                            {m.type === 'PAYMENT' ? '+' : '−'}{fmtMoney(Math.abs(num(m.amount)))}
                          </span>
                        ),
                      },
                      {
                        key: 'saldo', header: 'Saldo', style: { textAlign: 'right' },
                        render: (m) => (
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: num(m.newBalance) < 0 ? 'var(--danger)' : 'var(--text2)' }}>
                            {fmtMoney(m.newBalance)}
                          </span>
                        ),
                      },
                    ] as ResponsiveTableColumn<AccountMovement>[]}
                    renderMobileCard={(m) => (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div className="mobile-card-head">
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{fmtDate(m.date)}</span>
                          <span className={`badge ${typeBadge(m.type)}`}>{typeLabel[m.type] ?? m.type}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text3)' }}>{m.description ?? (m.sale ? `Venta #${m.saleId?.slice(-6)}` : '—')}</div>
                        <div className="mobile-card-row">
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{m.paymentMethod ?? '—'}</span>
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: m.type === 'PAYMENT' ? 'var(--success)' : 'var(--danger)' }}>
                            {m.type === 'PAYMENT' ? '+' : '−'}{fmtMoney(Math.abs(num(m.amount)))}
                          </span>
                        </div>
                        <div className="mobile-card-row">
                          <span>Saldo</span>
                          <span style={{ fontFamily: 'var(--mono)', color: num(m.newBalance) < 0 ? 'var(--danger)' : 'var(--text2)' }}>{fmtMoney(m.newBalance)}</span>
                        </div>
                      </div>
                    )}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {modal === 'adjustment' && selectedClient && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800 }}>Ajuste de cuenta</span>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                Cliente: <strong style={{ color: 'var(--text)' }}>{clientName(selectedClient)}</strong>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tipo de ajuste</label>
                <select value={adjForm.type} onChange={(e) => setAdjForm((p) => ({ ...p, type: e.target.value as any }))}>
                  <option value="POSITIVE">Positivo (suma al saldo a favor)</option>
                  <option value="NEGATIVE">Negativo (suma a la deuda)</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Monto *</label>
                <input type="number" min="0" step="any" value={adjForm.amount} onChange={(e) => setAdjForm((p) => ({ ...p, amount: e.target.value }))} placeholder="0" autoFocus />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Descripción</label>
                <input value={adjForm.description} onChange={(e) => setAdjForm((p) => ({ ...p, description: e.target.value }))} placeholder="Motivo del ajuste" />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={saveAdjustment} disabled={saving || !adjForm.amount} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Guardar ajuste'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'payment' && selectedClient && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800 }}>Registrar pago</span>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                Saldo actual: <strong style={{ fontFamily: 'var(--mono)', color: selectedClient.currentBalance < 0 ? 'var(--success)' : 'var(--text)' }}>{fmtMoney(selectedClient.currentBalance)}</strong>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Monto a pagar *</label>
                <input type="number" min="0" step="any" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} placeholder="0" autoFocus />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Método de pago</label>
                <select value={form.paymentMethod} onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))}>
                  {['EFECTIVO','TRANSFERENCIA','TARJETA','QR'].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Descripción</label>
                <input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Opcional" />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={savePayment} disabled={saving || !form.amount} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Registrar pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ClientFormModal
        open={newClientQuery !== null}
        onClose={() => setNewClientQuery(null)}
        initialQuery={newClientQuery ?? ''}
        defaultAccountEnabled
        onCreated={(client) => {
          if (client.isAccountEnabled) {
            setClients((prev) => [client, ...prev]);
            selectClient(client);
          }
          setClientSearch('');
          setNewClientQuery(null);
          toast.success('Cliente creado');
        }}
      />
    </AppLayout>
  );
}
