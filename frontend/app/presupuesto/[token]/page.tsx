/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import { fmtMoney, fmtDate } from '@/lib/helpers';
import { CheckCircle2, XCircle, Wrench, AlertTriangle, Download } from 'lucide-react';

type PublicRepairOrder = {
  id: string;
  status: string;
  deviceType: string;
  deviceBrand?: string | null;
  deviceModel?: string | null;
  reportedIssue: string;
  diagnosis?: string | null;
  totalAmount: number;
  rejectionReason?: string | null;
  createdAt: string;
  client?: { nombre: string; apellido: string } | null;
  items: { id: string; description: string; quantity: number; unitPrice: number; subtotal: number; ivaRate: number }[];
};

const STATUS_LABEL: Record<string, string> = {
  BUDGETED: 'Pendiente de tu aprobación', APPROVED: 'Aprobado', REJECTED: 'Rechazado',
  IN_PROGRESS: 'En reparación', READY: 'Listo para retirar', DELIVERED: 'Entregado', CANCELLED: 'Cancelado',
};

const fmtIvaRate = (rate: number) => (rate <= 0 ? 'Exento' : `${rate}%`);

function buildIvaBreakdown(items: { subtotal: number; ivaRate: number }[]) {
  const ivaByRate: Record<number, number> = {};
  let netoSum = 0;
  for (const item of items) {
    const rate = item.ivaRate ?? 21;
    const neto = (item.subtotal || 0) / (1 + rate / 100);
    ivaByRate[rate] = (ivaByRate[rate] ?? 0) + ((item.subtotal || 0) - neto);
    netoSum += neto;
  }
  const breakdown = Object.entries(ivaByRate)
    .filter(([, amount]) => amount > 0.01)
    .map(([rate, amount]) => ({ rate: Number(rate), amount }))
    .sort((a, b) => b.rate - a.rate);
  return { netoSum, breakdown };
}

export default function PresupuestoPublicoPage() {
  const { token } = useParams<{ token: string }>();
  const [order, setOrder] = useState<PublicRepairOrder | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState<'approved' | 'rejected' | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/repair-orders/public/${token}`);
      setOrder(data);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'No pudimos encontrar este presupuesto.');
    } finally { setLoading(false); }
  };

  useEffect(() => { if (token) load(); }, [token]);

  const approve = async () => {
    setActing(true);
    try {
      await api.post(`/repair-orders/public/${token}/approve`);
      setDone('approved');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'No pudimos registrar la aprobación.');
    } finally { setActing(false); }
  };

  const downloadPdf = async () => {
    try {
      const res = await api.get(`/repair-orders/public/${token}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'presupuesto-reparacion.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('No se pudo descargar el PDF.');
    }
  };

  const reject = async () => {
    setActing(true);
    try {
      await api.post(`/repair-orders/public/${token}/reject`, { reason: reason || undefined });
      setDone('rejected');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'No pudimos registrar el rechazo.');
    } finally { setActing(false); }
  };

  const shell = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 18 }}>
          <Wrench size={18} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>ComarPOS · Presupuesto de reparación</span>
        </div>
        <div className="card" style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );

  if (loading) return shell(<div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><div className="spinner" /></div>);

  if (error || !order) {
    return shell(
      <div style={{ textAlign: 'center', padding: 10 }}>
        <AlertTriangle size={28} style={{ color: 'var(--danger)', marginBottom: 10 }} />
        <div style={{ fontSize: 14, color: 'var(--text)' }}>{error || 'Presupuesto no encontrado.'}</div>
      </div>
    );
  }

  if (done) {
    return shell(
      <div style={{ textAlign: 'center', padding: 10 }}>
        {done === 'approved' ? (
          <>
            <CheckCircle2 size={32} style={{ color: 'var(--success, #18C15E)', marginBottom: 10 }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>¡Presupuesto aprobado!</div>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>Ya avisamos al taller. Te contactarán para coordinar la reparación.</div>
          </>
        ) : (
          <>
            <XCircle size={32} style={{ color: 'var(--danger)', marginBottom: 10 }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Presupuesto rechazado</div>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>Avisamos al taller que no querés seguir con la reparación.</div>
          </>
        )}
      </div>
    );
  }

  const deviceLabel = [order.deviceBrand, order.deviceModel].filter(Boolean).join(' ') || order.deviceType;
  const pending = order.status === 'BUDGETED';

  return shell(
    <>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>{order.deviceType}</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>{deviceLabel}</div>
        {order.client && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Para {order.client.nombre} {order.client.apellido} · {fmtDate(order.createdAt)}</div>}
      </div>

      <div style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px', marginBottom: 12 }}>
        <strong>Falla reportada:</strong> {order.reportedIssue}
      </div>

      {order.diagnosis && (
        <div style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px', marginBottom: 14 }}>
          <strong>Diagnóstico:</strong> {order.diagnosis}
        </div>
      )}

      <div className="table-wrap" style={{ marginBottom: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, color: 'var(--text3)' }}>Ítem</th>
              <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, color: 'var(--text3)' }}>IVA</th>
              <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, color: 'var(--text3)' }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => (
              <tr key={it.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{it.description} {it.quantity > 1 ? `x${it.quantity}` : ''}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: 12, color: 'var(--text3)' }}>{fmtIvaRate(it.ivaRate ?? 21)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(it.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(() => {
        const { netoSum, breakdown } = buildIvaBreakdown(order.items);
        return (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)', padding: '2px 0' }}>
              <span>Subtotal (sin IVA)</span><span style={{ fontFamily: 'var(--mono)' }}>{fmtMoney(netoSum)}</span>
            </div>
            {breakdown.map((line) => (
              <div key={line.rate} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)', padding: '2px 0' }}>
                <span>IVA {fmtIvaRate(line.rate)}</span><span style={{ fontFamily: 'var(--mono)' }}>{fmtMoney(line.amount)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>Total</span>
              <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{fmtMoney(order.totalAmount)}</span>
            </div>
          </div>
        );
      })()}

      <button className="btn btn-secondary" style={{ width: '100%', gap: 6, marginBottom: 18 }} onClick={downloadPdf}>
        <Download size={15} /> Descargar en PDF
      </button>

      {pending ? (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button className="btn btn-primary" style={{ flex: 1, gap: 6 }} onClick={approve} disabled={acting}>
              <CheckCircle2 size={15} /> Aprobar presupuesto
            </button>
            <button className="btn btn-danger" style={{ flex: 1, gap: 6 }} onClick={() => setRejecting((v) => !v)} disabled={acting}>
              <XCircle size={15} /> Rechazar
            </button>
          </div>
          {rejecting && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contanos por qué (opcional)" rows={2} style={{ width: '100%', resize: 'vertical' }} />
              <button className="btn btn-danger btn-sm" onClick={reject} disabled={acting}>Confirmar rechazo</button>
            </div>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text2)', padding: '8px 0' }}>
          Estado actual: <strong>{STATUS_LABEL[order.status] ?? order.status}</strong>
          {order.status === 'REJECTED' && order.rejectionReason && (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Motivo: {order.rejectionReason}</div>
          )}
        </div>
      )}
    </>
  );
}
