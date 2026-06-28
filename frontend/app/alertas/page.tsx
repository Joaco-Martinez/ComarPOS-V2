'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import type { Alert } from '@/types';
import { fmtDate, normalizeArray } from '@/lib/helpers';
import { AlertTriangle, CheckCircle, RefreshCcw } from 'lucide-react';

export default function AlertasPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/alerts', { params: { resolved: showResolved ? undefined : false } });
      setAlerts(normalizeArray<Alert>(data));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [showResolved]);

  const resolve = async (id: string) => {
    try {
      await api.patch(`/alerts/${id}/resolve`);
      load();
    } catch {}
  };

  const unresolved = alerts.filter((a) => !a.resolved).length;

  return (
    <AppLayout
      title="Alertas de Stock"
      subtitle={unresolved > 0 ? `${unresolved} alertas activas` : 'Sin alertas activas'}
      actions={
        <button onClick={load} className="btn btn-ghost btn-sm"><RefreshCcw size={13} /></button>
      }
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setShowResolved(false)} className={`btn btn-sm ${!showResolved ? 'btn-primary' : 'btn-secondary'}`}>
          Activas
        </button>
        <button onClick={() => setShowResolved(true)} className={`btn btn-sm ${showResolved ? 'btn-primary' : 'btn-secondary'}`}>
          Todas
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}><div className="spinner" /></div>
        ) : alerts.length === 0 ? (
          <div className="empty-state">
            <CheckCircle size={36} style={{ color: 'var(--success)' }} />
            <p>Sin alertas {showResolved ? '' : 'activas'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Producto</th><th>Stock actual</th><th>Mínimo</th><th>Mensaje</th><th>Fecha</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>
                      {a.product?.name ?? a.productName ?? '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--danger)', fontWeight: 700 }}>
                      {a.stockLocal ?? a.product?.stockLocal ?? '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--warn)' }}>
                      {a.minStock ?? a.product?.minStock ?? '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{a.message ?? 'Stock bajo'}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{fmtDate(a.createdAt)}</td>
                    <td>
                      <span className={`badge ${a.resolved ? 'badge-green' : 'badge-red'}`}>
                        {a.resolved ? 'Resuelta' : 'Activa'}
                      </span>
                    </td>
                    <td>
                      {!a.resolved && (
                        <button onClick={() => resolve(a.id)} className="btn btn-ghost btn-xs" style={{ color: 'var(--success)', gap: 4 }}>
                          <CheckCircle size={12} /> Resolver
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
