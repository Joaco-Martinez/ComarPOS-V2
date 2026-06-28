/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import type { Sale } from '@/types';
import { clientName, fmtDate, fmtMoney, normalizeArray } from '@/lib/helpers';
import { todayInputAR, firstDayOfMonthAR } from '@/lib/dateAR';
import { FileText, RefreshCcw, X, ExternalLink, Send, AlertTriangle } from 'lucide-react';

type InvoiceState = 'INVOICED' | 'PENDING_AFIP' | 'ERROR' | 'NOT_REQUIRED';

const invBadge = (s?: string | null) =>
  s === 'INVOICED' ? 'badge-green' : s === 'PENDING_AFIP' ? 'badge-amber' : s === 'ERROR' ? 'badge-red' : 'badge-gray';

export default function FacturacionPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(firstDayOfMonthAR());
  const [to, setTo] = useState(todayInputAR());
  const [statusFilter, setStatusFilter] = useState('');
  const [invoicing, setInvoicing] = useState<string | null>(null);
  const [modal, setModal] = useState<{ sale: Sale; dni: string; invoiceType: number } | null>(null);
  const [toast, setToast] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/sales', { params: { from, to, receiptType: 'FACTURA', limit: 200 } });
      setSales(normalizeArray<Sale>(data));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [from, to]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const retryInvoice = async (sale: Sale) => {
    setInvoicing(sale.id);
    try {
      await api.post('/afip/facturar', { saleId: sale.id });
      showToast('Factura emitida correctamente');
      load();
    } catch (err: any) {
      showToast(`Error AFIP: ${err?.response?.data?.message ?? 'desconocido'}`);
    } finally { setInvoicing(null); }
  };

  const invoiceManual = async () => {
    if (!modal) return;
    setInvoicing(modal.sale.id);
    try {
      await api.post('/afip/facturar', { saleId: modal.sale.id, tipoComprobante: modal.invoiceType, receiverDoc: modal.dni });
      showToast('Factura emitida correctamente');
      setModal(null);
      load();
    } catch (err: any) {
      showToast(`Error AFIP: ${err?.response?.data?.message ?? 'desconocido'}`);
    } finally { setInvoicing(null); }
  };

  const filtered = statusFilter
    ? sales.filter((s) => {
        const inv = s.invoiceAfip;
        if (statusFilter === 'INVOICED') return !!inv?.cae;
        if (statusFilter === 'PENDING') return !inv?.cae;
        if (statusFilter === 'ERROR') return (s as any).invoiceStatus === 'ERROR';
        return true;
      })
    : sales;

  const withCae = sales.filter((s) => s.invoiceAfip?.cae).length;
  const pending = sales.filter((s) => !s.invoiceAfip?.cae).length;

  return (
    <AppLayout
      title="AFIP / Facturación"
      subtitle={`${sales.length} comprobantes en el período`}
      actions={
        <button onClick={load} className="btn btn-ghost btn-sm"><RefreshCcw size={13} /></button>
      }
    >
      {toast && (
        <div style={{ position: 'fixed', top: 70, right: 20, zIndex: 200, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--text)', animation: 'fadeIn 0.2s ease' }}>{toast}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Con CAE', value: withCae, color: 'var(--success)' },
          { label: 'Pendientes', value: pending, color: pending > 0 ? 'var(--warn)' : 'var(--text3)' },
          { label: 'Total', value: sales.length, color: 'var(--accent2)' },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: s.color, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150, fontSize: 13 }} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150, fontSize: 13 }} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ fontSize: 13, width: 160 }}>
          <option value="">Todos los estados</option>
          <option value="INVOICED">Con CAE</option>
          <option value="PENDING">Sin CAE</option>
        </select>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><FileText size={32} /><p>Sin facturas en el período</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Fecha</th><th>Cliente</th><th>CAE</th><th>Estado</th><th style={{ textAlign: 'right' }}>Total</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtDate(s.createdAt)}</td>
                    <td style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>{clientName(s.client)}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: s.invoiceAfip?.cae ? 'var(--success)' : 'var(--text3)' }}>
                      {s.invoiceAfip?.cae ? s.invoiceAfip.cae.slice(0, 12) + '…' : '—'}
                    </td>
                    <td>
                      <span className={`badge ${s.invoiceAfip?.cae ? 'badge-green' : (s as any).invoiceStatus === 'ERROR' ? 'badge-red' : 'badge-amber'}`}>
                        {s.invoiceAfip?.cae ? 'Facturado' : (s as any).invoiceStatus === 'ERROR' ? 'Error' : 'Pendiente'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)' }}>{fmtMoney(s.total)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {s.invoiceAfip?.pdfUrl && (
                          <a href={s.invoiceAfip.pdfUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-xs" title="Ver PDF">
                            <ExternalLink size={12} />
                          </a>
                        )}
                        {!s.invoiceAfip?.cae && (
                          <button
                            onClick={() => setModal({ sale: s, dni: s.client?.dni ?? '', invoiceType: 6 })}
                            disabled={invoicing === s.id}
                            className="btn btn-ghost btn-xs"
                            style={{ color: 'var(--accent)', gap: 4 }}
                          >
                            {invoicing === s.id ? <span className="spinner" style={{ width: 11, height: 11 }} /> : <Send size={12} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ fontWeight: 800 }}>Emitir factura AFIP</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{clientName(modal.sale.client)}</div>
              </div>
              <button onClick={() => setModal(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: 'var(--warn)', display: 'flex', gap: 8 }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                Esta acción emite el comprobante ante AFIP. No se puede revertir.
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tipo de comprobante</label>
                <select value={modal.invoiceType} onChange={(e) => setModal((p) => p && ({ ...p, invoiceType: Number(e.target.value) }))}>
                  <option value={6}>Factura B</option>
                  <option value={1}>Factura A</option>
                  <option value={11}>Factura C</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">DNI / CUIT receptor</label>
                <input value={modal.dni} onChange={(e) => setModal((p) => p && ({ ...p, dni: e.target.value }))} placeholder="DNI o CUIT" />
              </div>
              <div style={{ fontSize: 14, fontFamily: 'var(--mono)', textAlign: 'right', color: 'var(--accent)', fontWeight: 800 }}>
                Total: {fmtMoney(modal.sale.total)}
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary btn-sm">Cancelar</button>
              <button onClick={invoiceManual} disabled={!!invoicing} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
                {invoicing ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <><Send size={13} /> Emitir</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
