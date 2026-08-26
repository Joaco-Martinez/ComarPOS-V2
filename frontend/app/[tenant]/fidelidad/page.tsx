/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { Client, LoyaltyTransaction } from '@/types';
import { clientName, fmtMoney, normalizeArray, num, getPlanLockMessage } from '@/lib/helpers';
import { formatDateAR } from '@/lib/dateAR';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
import { Star, Search, Gift, Plus, X, ArrowLeft, Lock } from 'lucide-react';

const typeBadge: Record<string, string> = { EARN: 'badge-green', REDEEM: 'badge-cyan', EXPIRE: 'badge-red', ADJUSTMENT: 'badge-amber' };
const typeLabel: Record<string, string> = { EARN: 'Ganado', REDEEM: 'Canjeado', EXPIRE: 'Expirado', ADJUSTMENT: 'Ajuste' };

export default function FidelidadPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'redeem' | 'adjust' | null>(null);
  const [form, setForm] = useState({ points: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [lockMessage, setLockMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/clients', { params: { limit: 500, includeLoyalty: true } });
      setClients(normalizeArray<Client>(data).filter((c) => c.loyaltyAccount != null));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const loadTransactions = async (clientId: string) => {
    setLockMessage(null);
    try {
      const { data } = await api.get(`/loyalty/${clientId}`);
      setTransactions(normalizeArray<LoyaltyTransaction>(data?.transactions ?? data?.movements ?? []));
    } catch (err: any) {
      const lockMsg = getPlanLockMessage(err);
      if (lockMsg) setLockMessage(lockMsg);
      setTransactions([]);
    }
  };

  const selectClient = (c: Client) => {
    setSelectedClient(c);
    loadTransactions(c.id);
  };


  const save = async () => {
    if (!selectedClient || !form.points) return;
    setSaving(true);
    try {
      if (modal === 'redeem') {
        await api.post(`/loyalty/${selectedClient.id}/redeem`, { points: Number(form.points) });
        toast.success('Puntos canjeados');
      } else {
        await api.post(`/loyalty/${selectedClient.id}/adjust`, { points: Number(form.points), reason: form.description || 'Ajuste manual' });
        toast.success('Puntos ajustados');
      }
      setModal(null);
      setForm({ points: '', description: '' });
      load();
      loadTransactions(selectedClient.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Error');
    } finally { setSaving(false); }
  };

  const filtered = search
    ? clients.filter((c) => `${c.nombre} ${c.apellido}`.toLowerCase().includes(search.toLowerCase()) || c.dni?.includes(search))
    : clients;

  const totalPoints = clients.reduce((a, c) => a + num(c.loyaltyAccount?.points), 0);
  const clientPoints = (c: Client) => num(c.loyaltyAccount?.points);

  return (
    <AppLayout title="Fidelidad" subtitle="Programa de puntos y recompensas">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Clientes en programa', value: String(clients.length), color: 'var(--accent)' },
          { label: 'Puntos circulando', value: totalPoints.toLocaleString('es-AR'), color: 'var(--accent2)' },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: s.color, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid-responsive fidelidad-split" style={{ ['--gtc' as any]: '280px 1fr', gap: 16 }}>
        {/* Client list */}
        <div className={selectedClient ? 'hidden md:flex' : 'flex'} style={{ flexDirection: 'column', gap: 8, minHeight: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente..." style={{ paddingLeft: 30, fontSize: 13 }} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
            ) : filtered.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}><Star size={24} /><p>Sin clientes en el programa</p></div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectClient(c)}
                  style={{
                    background: selectedClient?.id === c.id ? 'rgba(13,89,231,0.12)' : 'var(--surface)',
                    border: `1px solid ${selectedClient?.id === c.id ? 'rgba(13,89,231,0.3)' : 'var(--border)'}`,
                    borderRadius: 7, padding: '10px 12px', textAlign: 'left', cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{clientName(c)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                    <span className={`badge badge-xs ${c.category === 'Mayorista' ? 'badge-cyan' : 'badge-gray'}`} style={{ fontSize: 9 }}>
                      {c.category}
                    </span>
                    <span style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Star size={10} fill="currentColor" /> {clientPoints(c).toLocaleString('es-AR')} pts
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          {!selectedClient ? (
            <div className="card empty-state" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Star size={36} />
              <p>Seleccioná un cliente para ver sus puntos</p>
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
              <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => setSelectedClient(null)} className="btn btn-ghost btn-xs md:hidden" style={{ padding: 4 }}>
                    <ArrowLeft size={16} />
                  </button>
                  <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{clientName(selectedClient)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                    Puntos disponibles: <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14, color: 'var(--accent2)' }}>
                      {clientPoints(selectedClient).toLocaleString('es-AR')} pts
                    </span>
                    {' · '}Categoría: <span className={`badge badge-xs ${selectedClient.category === 'Mayorista' ? 'badge-cyan' : 'badge-gray'}`}>{selectedClient.category}</span>
                  </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => { setForm({ points: '', description: '' }); setModal('adjust'); }} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
                    <Plus size={13} /> Ajustar puntos
                  </button>
                  <button onClick={() => { setForm({ points: '', description: '' }); setModal('redeem'); }} className="btn btn-cyan btn-sm" style={{ gap: 6 }}>
                    <Gift size={13} /> Canjear
                  </button>
                </div>
              </div>

              <div className="card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 16px 8px', fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Historial de puntos</div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  <ResponsiveTable
                    data={transactions}
                    keyFor={(t) => t.id}
                    emptyIcon={Star}
                    emptyMessage="Sin movimientos"
                    columns={[
                      { key: 'fecha', header: 'Fecha', render: (t) => <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{formatDateAR(t.createdAt)}</span> },
                      { key: 'tipo', header: 'Tipo', render: (t) => <span className={`badge ${typeBadge[t.type] ?? 'badge-gray'}`}>{typeLabel[t.type] ?? t.type}</span> },
                      { key: 'descripcion', header: 'Descripción', render: (t) => <span style={{ fontSize: 12, color: 'var(--text3)' }}>{t.description ?? '—'}</span> },
                      {
                        key: 'puntos', header: 'Puntos', style: { textAlign: 'right' },
                        render: (t) => (
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, color: t.type === 'EARN' || (t.type === 'ADJUSTMENT' && t.points > 0) ? 'var(--success)' : 'var(--danger)' }}>
                            {t.type === 'EARN' || (t.type === 'ADJUSTMENT' && t.points > 0) ? '+' : '−'}{Math.abs(t.points).toLocaleString('es-AR')} pts
                          </span>
                        ),
                      },
                    ] as ResponsiveTableColumn<LoyaltyTransaction>[]}
                    renderMobileCard={(t) => (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div className="mobile-card-head">
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{formatDateAR(t.createdAt)}</span>
                          <span className={`badge ${typeBadge[t.type] ?? 'badge-gray'}`}>{typeLabel[t.type] ?? t.type}</span>
                        </div>
                        <div className="mobile-card-row">
                          <span style={{ color: 'var(--text3)' }}>{t.description ?? '—'}</span>
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: t.type === 'EARN' || (t.type === 'ADJUSTMENT' && t.points > 0) ? 'var(--success)' : 'var(--danger)' }}>
                            {t.type === 'EARN' || (t.type === 'ADJUSTMENT' && t.points > 0) ? '+' : '−'}{Math.abs(t.points).toLocaleString('es-AR')} pts
                          </span>
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

      {modal && selectedClient && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800 }}>{modal === 'redeem' ? 'Canjear puntos' : 'Ajustar puntos'}</span>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                Disponibles: <strong style={{ fontFamily: 'var(--mono)', color: 'var(--accent2)' }}>{clientPoints(selectedClient).toLocaleString('es-AR')} pts</strong>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Puntos {modal === 'redeem' ? 'a canjear' : '(positivo suma, negativo resta)'} *</label>
                <input type="number" step="1" value={form.points} onChange={(e) => setForm((p) => ({ ...p, points: e.target.value }))} placeholder="0" autoFocus />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Descripción</label>
                <input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Opcional" />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={save} disabled={saving || !form.points} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : modal === 'redeem' ? 'Canjear' : 'Ajustar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
