/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import { fmtDate, fmtMoney, normalizeArray, num } from '@/lib/helpers';
import { DollarSign, ArrowLeftRight, RefreshCw, Plus, X, Clock, Trash2 } from 'lucide-react';

type ExchangeRate = {
  id: string;
  currency: string;
  rate: number;
  source?: string;
  createdAt: string;
};

const CURRENCIES = ['USD', 'ARS', 'EUR', 'BRL'];

const emptyForm = () => ({ currency: 'USD', rate: '', notes: '' });

export default function TipoCambioPage() {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [current, setCurrent] = useState<ExchangeRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  // Converter state
  const [convAmount, setConvAmount] = useState('');
  const [convFrom, setConvFrom] = useState('USD');
  const [convTo, setConvTo] = useState('ARS');
  const [convResult, setConvResult] = useState<number | null>(null);
  const [converting, setConverting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [allRes, curRes] = await Promise.all([
        api.get('/exchange-rates/history').catch(() => api.get('/exchange-rates')),
        api.get('/exchange-rates/current').catch(() => null),
      ]);
      setRates(normalizeArray<ExchangeRate>(allRes.data));
      if (curRes?.data) setCurrent(Array.isArray(curRes.data) ? curRes.data[0] : curRes.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const save = async () => {
    if (!form.rate) return;
    setSaving(true);
    try {
      await api.post('/exchange-rates', { currency: form.currency, rate: Number(form.rate), source: form.notes || undefined });
      showToast('Tipo de cambio registrado');
      setModal(false);
      setForm(emptyForm());
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? 'Error al guardar');
    } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    if (!confirm('¿Eliminar este registro de tipo de cambio?')) return;
    try {
      await api.delete(`/exchange-rates/${id}`);
      showToast('Eliminado');
      load();
    } catch { showToast('Error al eliminar'); }
  };

  const convert = async () => {
    if (!convAmount) return;
    setConverting(true);
    try {
      const { data } = await api.get('/exchange-rates/convert', { params: { amount: Number(convAmount), from: convFrom, to: convTo } });
      setConvResult(num(data?.result ?? data));
    } catch {
      showToast('Error al convertir');
    } finally { setConverting(false); }
  };

  const swapCurrencies = () => { setConvFrom(convTo); setConvTo(convFrom); setConvResult(null); };

  return (
    <AppLayout
      title="Tipo de Cambio"
      subtitle="Tasas de cambio y conversión de divisas"
      actions={
        <button onClick={() => { setForm(emptyForm()); setModal(true); }} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
          <Plus size={13} /> Registrar tasa
        </button>
      }
    >
      {toast && (
        <div style={{ position: 'fixed', top: 70, right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)', animation: 'fadeIn 0.2s ease' }}>{toast}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 16, marginBottom: 20 }}>
        {/* Current rate card */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <DollarSign size={16} style={{ color: 'var(--accent)' }} />
            <span className="section-title">Tasa actual</span>
          </div>
          {loading ? (
            <div className="spinner" style={{ margin: '20px auto' }} />
          ) : current ? (
            <>
              <div style={{ fontSize: 32, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent)', marginBottom: 4 }}>
                {num(current.rate).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                1 {current.currency} → ARS · actualizado {fmtDate(current.createdAt)}
              </div>
              {current.source && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>{current.source}</div>}
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>Sin tasa registrada</div>
          )}
        </div>

        {/* Converter */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <ArrowLeftRight size={16} style={{ color: 'var(--accent2)' }} />
            <span className="section-title">Convertidor</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <input
              type="number"
              min="0"
              step="any"
              value={convAmount}
              onChange={(e) => { setConvAmount(e.target.value); setConvResult(null); }}
              placeholder="Monto"
              style={{ flex: 2 }}
            />
            <select value={convFrom} onChange={(e) => { setConvFrom(e.target.value); setConvResult(null); }} style={{ flex: 1 }}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={swapCurrencies} className="btn btn-ghost btn-xs" title="Intercambiar"><ArrowLeftRight size={13} /></button>
            <select value={convTo} onChange={(e) => { setConvTo(e.target.value); setConvResult(null); }} style={{ flex: 1 }}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button onClick={convert} disabled={converting || !convAmount} className="btn btn-secondary btn-sm" style={{ width: '100%', gap: 6 }}>
            {converting ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <RefreshCw size={13} />}
            Convertir
          </button>
          {convResult !== null && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--accent-dim)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{convAmount} {convFrom} =</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
                {convResult.toLocaleString('es-AR', { minimumFractionDigits: 2 })} <span style={{ fontSize: 14 }}>{convTo}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* History table */}
      <div className="card">
        <div style={{ padding: '14px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={14} style={{ color: 'var(--text3)' }} />
          <span className="section-title">Historial de tasas</span>
        </div>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160 }}><div className="spinner" /></div>
        ) : rates.length === 0 ? (
          <div className="empty-state"><DollarSign size={32} /><p>Sin tasas registradas</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Moneda</th>
                  <th style={{ textAlign: 'right' }}>Tasa (→ ARS)</th>
                  <th>Notas</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{fmtDate(r.createdAt)}</td>
                    <td><span className="badge badge-cyan">{r.currency}</span></td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13 }}>
                      {num(r.rate).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{r.source ?? '—'}</td>
                    <td>
                      <button onClick={() => del(r.id)} className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }}><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 800 }}>Registrar tipo de cambio</span>
              <button onClick={() => setModal(false)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Moneda</label>
                  <select value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))} autoFocus>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tasa (en ARS) *</label>
                  <input type="number" min="0" step="any" value={form.rate} onChange={(e) => setForm((p) => ({ ...p, rate: e.target.value }))} placeholder="Ej: 1150.00" />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Notas</label>
                <input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Opcional" />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(false)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={save} disabled={saving || !form.rate} className="btn btn-primary btn-sm">
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
