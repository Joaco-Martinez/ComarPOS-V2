/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import type { Sale } from '@/types';
import { clientName, fmtDate, fmtMoney, normalizeArray, num } from '@/lib/helpers';
import { todayInputAR, firstDayOfMonthAR } from '@/lib/dateAR';
import { Search, Download, RefreshCcw, X, FileText, Eye } from 'lucide-react';

const PAGE_SIZE = 20;

const statusBadge = (s: string) =>
  s === 'COMPLETED' ? 'badge-green' : s === 'PENDING' ? 'badge-amber' : 'badge-red';

const receiptBadge = (r: string) => r === 'FACTURA' ? 'badge-blue' : 'badge-gray';

const paymentLabel: Record<string, string> = {
  EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia', TARJETA: 'Tarjeta',
  DEBITO: 'Débito', CREDITO: 'Crédito', QR: 'QR', QR_MERCADOPAGO: 'MercadoPago',
  QR_NACION: 'QR Nación', CUENTA_CORRIENTE: 'Cta. Cte.',
};

export default function VentasPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState(todayInputAR());
  const [to, setTo] = useState(todayInputAR());
  const [status, setStatus] = useState('');
  const [receiptType, setReceiptType] = useState('');
  const [selected, setSelected] = useState<Sale | null>(null);

  const fetchSales = async (p = 1) => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page: p, limit: PAGE_SIZE };
      if (from) params.from = from;
      if (to) params.to = to;
      if (status) params.status = status;
      if (receiptType) params.receiptType = receiptType;
      const { data } = await api.get('/sales', { params });
      const arr = normalizeArray<Sale>(data);
      setSales(arr);
      setTotal(data?.total ?? data?.pagination?.total ?? arr.length);
      setPage(p);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSales(1); }, [from, to, status, receiptType]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sales;
    const q = search.toLowerCase();
    return sales.filter((s) =>
      s.id.toLowerCase().includes(q) ||
      (s.client && `${s.client.nombre} ${s.client.apellido}`.toLowerCase().includes(q)) ||
      s.paymentMethod.toLowerCase().includes(q)
    );
  }, [sales, search]);

  const totalRevenue = filtered.reduce((a, s) => a + num(s.total), 0);
  const totalProfit = filtered.reduce((a, s) => a + num(s.grossProfit), 0);

  return (
    <AppLayout
      title="Historial de Ventas"
      subtitle={`${total} registros encontrados`}
      actions={
        <button onClick={() => fetchSales(page)} className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
          <RefreshCcw size={13} />
        </button>
      }
    >
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: '0 0 220px' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." style={{ paddingLeft: 30, fontSize: 13 }} />
        </div>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150, fontSize: 13 }} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150, fontSize: 13 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 140, fontSize: 13 }}>
          <option value="">Todos los estados</option>
          <option value="COMPLETED">Completada</option>
          <option value="PENDING">Pendiente</option>
          <option value="CANCELLED">Cancelada</option>
        </select>
        <select value={receiptType} onChange={(e) => setReceiptType(e.target.value)} style={{ width: 140, fontSize: 13 }}>
          <option value="">Ticket y Factura</option>
          <option value="TICKET">Ticket</option>
          <option value="FACTURA">Factura</option>
        </select>
        <button onClick={() => { setFrom(firstDayOfMonthAR()); setTo(todayInputAR()); }} className="btn btn-secondary btn-sm">Este mes</button>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Ingresos', value: fmtMoney(totalRevenue), color: 'var(--accent)' },
          { label: 'Ganancia bruta', value: fmtMoney(totalProfit), color: 'var(--success)' },
          { label: 'Operaciones', value: String(filtered.length), color: 'var(--accent2)' },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)', color: s.color, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
            <div className="spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><FileText size={32} /><p>Sin ventas en el período seleccionado</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Pago</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>AFIP</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtDate(s.createdAt)}</td>
                    <td style={{ color: 'var(--text)', fontWeight: 500 }}>{clientName(s.client)}</td>
                    <td style={{ fontSize: 12 }}>{paymentLabel[s.paymentMethod] ?? s.paymentMethod}</td>
                    <td><span className={`badge ${receiptBadge(s.receiptType)}`}>{s.receiptType}</span></td>
                    <td><span className={`badge ${statusBadge(s.status)}`}>{s.status}</span></td>
                    <td>
                      {s.invoiceAfip?.cae ? (
                        <span className="badge badge-green" title={s.invoiceAfip.cae}>CAE ✓</span>
                      ) : s.receiptType === 'FACTURA' ? (
                        <span className="badge badge-amber">Pendiente</span>
                      ) : (
                        <span className="badge badge-gray">—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>
                      {fmtMoney(s.total)}
                    </td>
                    <td>
                      <button onClick={() => setSelected(s)} className="btn btn-ghost btn-xs" style={{ gap: 4 }}>
                        <Eye size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
            <button onClick={() => fetchSales(page - 1)} disabled={page <= 1} className="btn btn-secondary btn-sm">Anterior</button>
            <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
              Página {page} de {Math.ceil(total / PAGE_SIZE)}
            </span>
            <button onClick={() => fetchSales(page + 1)} disabled={page >= Math.ceil(total / PAGE_SIZE)} className="btn btn-secondary btn-sm">Siguiente</button>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Detalle de venta</div>
                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2 }}>{selected.id}</div>
              </div>
              <button onClick={() => setSelected(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  ['Fecha', fmtDate(selected.createdAt)],
                  ['Cliente', clientName(selected.client)],
                  ['Tipo', selected.receiptType],
                  ['Estado', selected.status],
                  ['Pago', paymentLabel[selected.paymentMethod] ?? selected.paymentMethod],
                  ['Total', fmtMoney(selected.total)],
                  ...(selected.grossProfit != null ? [['Ganancia', fmtMoney(selected.grossProfit)]] : []),
                  ...(selected.invoiceAfip?.cae ? [['CAE', selected.invoiceAfip.cae]] : []),
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: k === 'Total' || k === 'Ganancia' || k === 'CAE' ? 'var(--mono)' : undefined }}>{v}</div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Productos</div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Producto</th><th>Cant.</th><th style={{ textAlign: 'right' }}>Precio</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr></thead>
                    <tbody>
                      {selected.items?.map((item, i) => (
                        <tr key={i}>
                          <td style={{ color: 'var(--text)' }}>{item.product?.name ?? item.productNameSnapshot ?? '—'}</td>
                          <td style={{ fontFamily: 'var(--mono)' }}>{item.quantityKg != null ? `${item.quantityKg}kg` : item.quantity}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtMoney(item.price)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmtMoney(num(item.subtotal, item.price * (item.quantityKg ?? item.quantity)))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {selected.invoiceAfip?.pdfUrl && (
                <a href={selected.invoiceAfip.pdfUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start', gap: 6 }}>
                  <FileText size={13} /> Ver PDF Factura
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
