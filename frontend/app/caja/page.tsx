/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import type { CashSession } from '@/types';
import { fmtDate, fmtMoney, normalizeArray, num } from '@/lib/helpers';
import { Wallet, Plus, X, Eye, Lock, Unlock, ArrowDownCircle, ArrowUpCircle, Banknote } from 'lucide-react';

const MOVEMENT_TYPES = [
  { type: 'EXPENSE', label: 'Gasto', sub: 'Sale de la caja (ej: compra menor, viáticos)', icon: ArrowUpCircle },
  { type: 'WITHDRAWAL', label: 'Retiro', sub: 'Retiro de efectivo de la caja', icon: ArrowUpCircle },
  { type: 'DEPOSIT', label: 'Depósito', sub: 'Ingreso manual de efectivo a la caja', icon: ArrowDownCircle },
];

export default function CajaPage() {
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'open' | 'close' | 'detail' | 'movement' | null>(null);
  const [selected, setSelected] = useState<CashSession | null>(null);
  const [sessionSummary, setSessionSummary] = useState<any>(null);
  const [openForm, setOpenForm] = useState({ openingAmount: '', notes: '' });
  const [closeForm, setCloseForm] = useState({ closingAmount: '', notes: '' });
  const [movementForm, setMovementForm] = useState({ type: 'EXPENSE', amount: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/cash-sessions', { params: { limit: 50 } });
      setSessions(normalizeArray<CashSession>(data));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const openSession = async () => {
    setSaving(true);
    try {
      await api.post('/cash-sessions/open', { openingBalance: Number(openForm.openingAmount), notes: openForm.notes || undefined });
      showToast('Caja abierta');
      setModal(null);
      setOpenForm({ openingAmount: '', notes: '' });
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al abrir caja');
    } finally { setSaving(false); }
  };

  const closeSession = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post(`/cash-sessions/${selected.id}/close`, { actualBalance: Number(closeForm.closingAmount), closeNotes: closeForm.notes || undefined });
      showToast('Caja cerrada');
      setModal(null);
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al cerrar caja');
    } finally { setSaving(false); }
  };

  const addMovement = async () => {
    if (!openSession_) return;
    const amount = Number(movementForm.amount);
    if (!amount || amount <= 0) { showToast('Ingresá un monto válido'); return; }
    setSaving(true);
    try {
      await api.post(`/cash-sessions/${openSession_.id}/movement`, {
        type: movementForm.type,
        amount,
        description: movementForm.description || undefined,
      });
      showToast('Movimiento registrado');
      setModal(null);
      setMovementForm({ type: 'EXPENSE', amount: '', description: '' });
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al registrar el movimiento');
    } finally { setSaving(false); }
  };

  const openSession_ = sessions.find((s) => s.status === 'OPEN');

  return (
    <AppLayout
      title="Caja"
      subtitle={openSession_ ? 'Hay una caja abierta' : 'Sin caja abierta'}
      actions={
        !openSession_ ? (
          <button onClick={() => { setOpenForm({ openingAmount: '', notes: '' }); setModal('open'); }} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
            <Unlock size={13} /> Abrir caja
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setMovementForm({ type: 'EXPENSE', amount: '', description: '' }); setModal('movement'); }} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
              <Banknote size={13} /> Registrar movimiento
            </button>
            <button onClick={() => { setSelected(openSession_); setCloseForm({ closingAmount: '', notes: '' }); setModal('close'); }} className="btn btn-danger btn-sm" style={{ gap: 6 }}>
              <Lock size={13} /> Cerrar caja
            </button>
          </div>
        )
      }
    >
      {toast && (
        <div style={{ position: 'fixed', top: 70, right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)', animation: 'fadeIn 0.2s ease' }}>{toast}</div>
      )}

      {openSession_ && (
        <div style={{ background: 'rgba(24,193,94,0.08)', border: '1px solid rgba(24,193,94,0.25)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Wallet size={18} style={{ color: 'var(--success)' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--success)' }}>Caja abierta</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              Apertura: {fmtMoney(openSession_.openingBalance)} · Abierta el {fmtDate(openSession_.openedAt)}
            </div>
          </div>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : sessions.length === 0 ? (
          <div className="empty-state"><Wallet size={32} /><p>Sin sesiones de caja</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Apertura</th><th>Cierre</th><th>Monto apertura</th><th>Monto cierre</th><th>Usuario</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtDate(s.openedAt)}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{s.closedAt ? fmtDate(s.closedAt) : '—'}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmtMoney(s.openingBalance)}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: s.actualBalance != null ? 'var(--text)' : 'var(--text3)' }}>
                      {s.actualBalance != null ? fmtMoney(s.actualBalance) : '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>{s.user?.name ?? '—'}</td>
                    <td>
                      <span className={`badge ${s.status === 'OPEN' ? 'badge-green' : 'badge-gray'}`}>
                        {s.status === 'OPEN' ? 'Abierta' : 'Cerrada'}
                      </span>
                    </td>
                    <td>
                      <button onClick={async () => {
                        setSelected(s);
                        setSessionSummary(null);
                        setModal('detail');
                        try {
                          const { data } = await api.get(`/cash-sessions/${s.id}/summary`);
                          setSessionSummary(data);
                        } catch {}
                      }} className="btn btn-ghost btn-xs"><Eye size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal === 'open' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800 }}>Abrir caja</span>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Monto de apertura</label>
                <input type="number" min="0" step="any" value={openForm.openingAmount} onChange={(e) => setOpenForm((p) => ({ ...p, openingAmount: e.target.value }))} placeholder="0" autoFocus />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Notas</label>
                <input value={openForm.notes} onChange={(e) => setOpenForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Opcional" />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={openSession} disabled={saving} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Abrir caja'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'detail' && selected && (
        <div className="modal-overlay" onClick={() => { setModal(null); setSessionSummary(null); }}>
          <div className="modal modal-lg" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span style={{ fontWeight: 800 }}>Detalle de caja</span>
                <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 10, fontFamily: 'var(--mono)' }}>{fmtDate(selected.openedAt)}</span>
              </div>
              <button onClick={() => { setModal(null); setSessionSummary(null); }} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {!sessionSummary ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="spinner" /></div>
              ) : (
                <>
                  <div className="grid-responsive" style={{ gap: 10 }}>
                    {[
                      ['Apertura', fmtMoney(sessionSummary.breakdown?.openingBalance)],
                      ['Ventas efectivo', fmtMoney(sessionSummary.breakdown?.cashSales)],
                      ['Cobros cta. cte.', fmtMoney(sessionSummary.breakdown?.accountPaymentsCash)],
                      ['Depósitos manuales', fmtMoney(sessionSummary.breakdown?.manualDeposits)],
                      ['Salidas', fmtMoney(sessionSummary.breakdown?.outflows)],
                      ['Saldo esperado', fmtMoney(sessionSummary.breakdown?.expectedBalance)],
                      ...(sessionSummary.breakdown?.actualBalance != null ? [
                        ['Saldo real', fmtMoney(sessionSummary.breakdown.actualBalance)],
                        ['Diferencia', fmtMoney(sessionSummary.breakdown.difference)],
                      ] : []),
                    ].map(([k, v]) => (
                      <div key={k} style={{ background: 'var(--surface2)', borderRadius: 6, padding: '10px 12px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>{k}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text)', marginTop: 4 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {sessionSummary.movements?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>Movimientos manuales</div>
                      <div className="table-wrap">
                        <table>
                          <thead><tr><th>Tipo</th><th>Descripción</th><th style={{ textAlign: 'right' }}>Monto</th></tr></thead>
                          <tbody>
                            {sessionSummary.movements.map((m: any) => (
                              <tr key={m.id}>
                                <td><span className={`badge ${m.amount >= 0 ? 'badge-green' : 'badge-red'}`}>{m.type}</span></td>
                                <td style={{ fontSize: 12, color: 'var(--text3)' }}>{m.description ?? '—'}</td>
                                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmtMoney(Math.abs(m.amount))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {modal === 'close' && selected && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800 }}>Cerrar caja</span>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>Monto apertura: <strong style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>{fmtMoney(selected.openingBalance)}</strong></div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Monto de cierre</label>
                <input type="number" min="0" step="any" value={closeForm.closingAmount} onChange={(e) => setCloseForm((p) => ({ ...p, closingAmount: e.target.value }))} placeholder="0" autoFocus />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Notas</label>
                <input value={closeForm.notes} onChange={(e) => setCloseForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Opcional" />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={closeSession} disabled={saving} className="btn btn-danger btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Cerrar caja'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'movement' && openSession_ && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800 }}>Registrar movimiento de caja</span>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {MOVEMENT_TYPES.map((mt) => (
                  <button
                    key={mt.type}
                    onClick={() => setMovementForm((p) => ({ ...p, type: mt.type }))}
                    className="btn"
                    style={{
                      justifyContent: 'flex-start', gap: 10, padding: '10px 12px', textAlign: 'left', height: 'auto',
                      background: movementForm.type === mt.type ? 'var(--accent-dim)' : 'var(--surface2)',
                      border: `1px solid ${movementForm.type === mt.type ? 'var(--accent)' : 'var(--border)'}`,
                      color: 'var(--text)',
                    }}
                  >
                    <mt.icon size={16} style={{ color: movementForm.type === mt.type ? 'var(--accent)' : 'var(--text3)', flexShrink: 0 }} />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <b style={{ fontSize: 13 }}>{mt.label}</b>
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>{mt.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Monto</label>
                <input type="number" min="0" step="any" value={movementForm.amount} onChange={(e) => setMovementForm((p) => ({ ...p, amount: e.target.value }))} placeholder="0" autoFocus />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Descripción</label>
                <input value={movementForm.description} onChange={(e) => setMovementForm((p) => ({ ...p, description: e.target.value }))} placeholder="Opcional" />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={addMovement} disabled={saving} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
