'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import type { Alert } from '@/types';
import { fmtDate, normalizeArray } from '@/lib/helpers';
import ResponsiveTable, { type ResponsiveTableColumn } from '@/components/mobile/ResponsiveTable';
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
        ) : (
          <ResponsiveTable
            data={alerts}
            keyFor={(a) => a.id}
            emptyIcon={CheckCircle}
            emptyMessage={`Sin alertas ${showResolved ? '' : 'activas'}`}
            columns={[
              { key: 'producto', header: 'Producto', render: (a) => <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>{a.product?.name ?? a.productName ?? '—'}</span> },
              { key: 'mensaje', header: 'Mensaje', render: (a) => <span style={{ fontSize: 12, color: 'var(--text2)' }}>{a.message ?? 'Stock bajo'}</span> },
              { key: 'fecha', header: 'Fecha', render: (a) => <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{fmtDate(a.createdAt)}</span> },
              {
                key: 'estado', header: 'Estado', render: (a) => (
                  <span className={`badge ${a.resolved ? 'badge-green' : 'badge-red'}`}>
                    {a.resolved ? 'Resuelta' : 'Activa'}
                  </span>
                ),
              },
              {
                key: 'acciones', header: '', render: (a) => (
                  !a.resolved ? (
                    <button onClick={() => resolve(a.id)} className="btn btn-ghost btn-xs" style={{ color: 'var(--success)', gap: 4 }}>
                      <CheckCircle size={12} /> Resolver
                    </button>
                  ) : null
                ),
              },
            ] as ResponsiveTableColumn<Alert>[]}
            renderMobileCard={(a) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="mobile-card-head">
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{a.product?.name ?? a.productName ?? '—'}</span>
                  <span className={`badge ${a.resolved ? 'badge-green' : 'badge-red'}`}>
                    {a.resolved ? 'Resuelta' : 'Activa'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{a.message ?? 'Stock bajo'}</div>
                <div className="mobile-card-row">
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{fmtDate(a.createdAt)}</span>
                  {!a.resolved && (
                    <button onClick={() => resolve(a.id)} className="btn btn-ghost btn-xs" style={{ color: 'var(--success)', gap: 4 }}>
                      <CheckCircle size={12} /> Resolver
                    </button>
                  )}
                </div>
              </div>
            )}
          />
        )}
      </div>
    </AppLayout>
  );
}
