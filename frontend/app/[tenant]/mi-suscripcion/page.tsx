'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import SubscriptionPanel from '@/components/SubscriptionPanel';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { fmtDate, fmtMoney } from '@/lib/helpers';
import type { TenantTransferReport } from '@/types';
import { History } from 'lucide-react';

const STATUS_LABEL = { PENDING: 'Pendiente', APPROVED: 'Confirmada', REJECTED: 'Rechazada' } as const;
const STATUS_BADGE = { PENDING: 'badge-amber', APPROVED: 'badge-green', REJECTED: 'badge-red' } as const;

// "Mi suscripción" dentro del sistema: el mismo panel que /suscripcion
// (estado, plan, pagar con MP o transferencia) mas el historial de
// transferencias informadas. AppLayout la deja abierta aunque la cuenta
// este pausada por falta de pago (ver isSubscriptionPage).
export default function MiSuscripcionPage() {
  const user = useAuthStore((s) => s.user);
  const [reports, setReports] = useState<TenantTransferReport[]>([]);

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    api.get('/billing/transfer-reports')
      .then(({ data }) => setReports(data.content ?? data ?? []))
      .catch(() => { /* sin historial: el panel de arriba sigue funcionando */ });
  }, [user?.role]);

  return (
    <AppLayout title="Mi suscripción" subtitle="Plan, vencimiento y pago del servicio">
      {user && user.role !== 'ADMIN' ? (
        <div className="card" style={{ padding: 28, maxWidth: 460 }}>
          <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
            La suscripción la gestiona el administrador del negocio. Si el sistema está bloqueado por falta de pago, avisale para que pueda abonar.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 420px', maxWidth: 520 }}>
            <SubscriptionPanel embedded />
          </div>

          {reports.length > 0 && (
            <div className="card" style={{ padding: 20, flex: '1 1 380px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <History size={15} style={{ color: 'var(--text3)' }} />
                <span style={{ fontWeight: 700, fontSize: 13 }}>Transferencias informadas</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Fecha</th><th>Monto</th><th>Nro. operación</th><th>Estado</th></tr>
                  </thead>
                  <tbody>
                    {reports.map((r) => (
                      <tr key={r.id}>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{fmtDate(r.createdAt)}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtMoney(r.amount)}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{r.reference}</td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                          {r.status === 'REJECTED' && r.reviewNote && (
                            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{r.reviewNote}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}
