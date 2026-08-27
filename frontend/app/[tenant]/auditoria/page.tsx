/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import { fmtDate, normalizeArray } from '@/lib/helpers';
import { useAuthStore } from '@/store/auth';
import { Shield, Clock, User, Filter, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { todayInputAR, firstDayOfMonthAR } from '@/lib/dateAR';

interface AuditLog {
  id: string;
  createdAt: string;
  action: string;
  entity: string;
  entityId: string;
  userId?: string;
  user?: { name: string; email: string };
  oldValues?: any;
  newValues?: any;
  changes?: any;
}

const actionBadge = (a: string) =>
  a === 'CREATE' ? 'badge-green' : a === 'DELETE' ? 'badge-red' : a === 'IMPERSONATE_START' ? 'badge-cyan' : 'badge-amber';

const actionLabel: Record<string, string> = {
  CREATE: 'Crear', UPDATE: 'Actualizar', DELETE: 'Eliminar',
  IMPERSONATE_START: 'Acceso de soporte (super-admin)',
};

function diffSummary(oldV: any, newV: any): string {
  if (!oldV && !newV) return '—';
  if (!oldV) return 'Registro creado';
  if (!newV) return 'Registro eliminado';
  const changed = Object.keys({ ...oldV, ...newV }).filter((k) => JSON.stringify(oldV[k]) !== JSON.stringify(newV[k]));
  if (!changed.length) return 'Sin cambios detectados';
  return changed.slice(0, 3).join(', ') + (changed.length > 3 ? ` (+${changed.length - 3} más)` : '');
}

const PAGE_SIZE = 25;

export default function AuditoriaPage() {
  const { user } = useAuthStore();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState(firstDayOfMonthAR());
  const [to, setTo] = useState(todayInputAR());
  const [userFilter, setUserFilter] = useState('');

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page: p, limit: PAGE_SIZE };
      if (entity.trim()) params.entity = entity.trim();
      if (action) params.action = action;
      if (from) params.from = from;
      if (to) params.to = to;
      const { data } = await api.get('/audit-logs', { params });
      const arr = normalizeArray<AuditLog>(data);
      setLogs(arr);
      setTotal(data?.total ?? data?.pagination?.total ?? arr.length);
      setPage(p);
    } catch { setLogs([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(1); }, [entity, action, from, to]);

  const filtered = userFilter.trim()
    ? logs.filter((l) => (l.user?.name ?? '').toLowerCase().includes(userFilter.toLowerCase()) || (l.user?.email ?? '').toLowerCase().includes(userFilter.toLowerCase()))
    : logs;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (user?.role !== 'ADMIN') {
    return (
      <AppLayout title="Auditoría" subtitle="Registro de cambios del sistema">
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
          <Shield size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <div style={{ fontSize: 14 }}>Solo los administradores pueden ver el registro de auditoría.</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Auditoría"
      subtitle={`${total} registros`}
      actions={
        <button onClick={() => load(1)} className="btn btn-ghost btn-sm" title="Actualizar">
          <Filter size={13} />
        </button>
      }
    >
      {/* Filters */}
      <div className="filter-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <input
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          placeholder="Entidad (ej: Sale, Product…)"
          style={{ width: 190 }}
        />
        <select value={action} onChange={(e) => setAction(e.target.value)} style={{ width: 140 }}>
          <option value="">Todas las acciones</option>
          <option value="CREATE">Crear</option>
          <option value="UPDATE">Actualizar</option>
          <option value="DELETE">Eliminar</option>
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          style={{ width: 150 }}
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          style={{ width: 150 }}
        />
        <div style={{ position: 'relative' }}>
          <User size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            placeholder="Filtrar por usuario…"
            style={{ width: 180, paddingLeft: 28 }}
          />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            <Shield size={28} style={{ margin: '0 auto 10px', opacity: 0.35 }} />
            No se encontraron registros de auditoría
          </div>
        ) : (
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Fecha', 'Usuario', 'Acción', 'Entidad', 'ID', 'Cambios', ''].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textAlign: 'left', whiteSpace: 'nowrap', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <>
                    <tr
                      key={log.id}
                      style={{ borderBottom: expanded === log.id ? 'none' : '1px solid var(--border)', cursor: 'pointer' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(13,89,231,0.04)')}
                      onMouseLeave={(e) => { if (expanded !== log.id) e.currentTarget.style.background = ''; }}
                      onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    >
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Clock size={11} />
                          {fmtDate(log.createdAt)}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <User size={11} style={{ color: 'var(--text3)' }} />
                          {log.user?.name ?? log.userId ?? '—'}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span className={`badge ${actionBadge(log.action)}`} style={{ fontSize: 10 }}>
                          {actionLabel[log.action] ?? log.action}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--accent2)' }}>
                        {log.entity}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.entityId}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text2)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {diffSummary(log.oldValues ?? log.changes?.old, log.newValues ?? log.changes?.new)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        {expanded === log.id
                          ? <ChevronUp size={14} style={{ color: 'var(--text3)' }} />
                          : <ChevronDown size={14} style={{ color: 'var(--text3)' }} />}
                      </td>
                    </tr>

                    {expanded === log.id && (
                      <tr key={`${log.id}-detail`} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td colSpan={7} style={{ padding: '0 14px 14px' }}>
                          <div className="grid-responsive" style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 14, gap: 16 }}>
                            <div>
                              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                                Antes
                              </div>
                              <pre style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, maxHeight: 200, overflowY: 'auto' }}>
                                {JSON.stringify(log.oldValues ?? log.changes?.old ?? null, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                                Después
                              </div>
                              <pre style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, maxHeight: 200, overflowY: 'auto' }}>
                                {JSON.stringify(log.newValues ?? log.changes?.new ?? null, null, 2)}
                              </pre>
                            </div>
                          </div>
                          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)' }}>
                            <Eye size={11} style={{ display: 'inline', marginRight: 4 }} />
                            ID del log: <span style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{log.id}</span>
                            {log.user?.email && <> · <User size={11} style={{ display: 'inline', marginRight: 4 }} />{log.user.email}</>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              Página {page} de {totalPages} · {total} registros
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page <= 1 || loading}
                onClick={() => load(page - 1)}
              >
                Anterior
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page >= totalPages || loading}
                onClick={() => load(page + 1)}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
