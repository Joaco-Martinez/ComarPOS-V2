/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { fmtMoney, fmtDate } from '@/lib/helpers';
import { Package, X, Check, Ban, Banknote, Landmark, Wallet, ShoppingBag, MessageCircle } from 'lucide-react';

type OrderListItem = {
  id: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  customerName: string;
  customerPhone: string | null;
  total: number;
  items: { id: string }[];
  createdAt: string;
  client?: { nombre: string; apellido: string } | null;
};

type OrderDetail = Omit<OrderListItem, 'items'> & {
  subtotal: number;
  customerEmail: string | null;
  customerNotes: string | null;
  transferProofUrl: string | null;
  cancelReason: string | null;
  saleId: string | null;
  items: {
    id: string;
    quantity: number | null;
    quantityKg: number | null;
    unitPrice: number;
    subtotal: number;
    productNameSnapshot: string | null;
    product?: { name: string; imageUrl: string | null; saleUnit: string } | null;
  }[];
};

const STATUS_TABS = [
  { key: '', label: 'Todos' },
  { key: 'PENDING', label: 'Pendientes' },
  { key: 'PAYMENT_PENDING_REVIEW', label: 'Por verificar' },
  { key: 'CONFIRMED', label: 'Confirmados' },
  { key: 'CONVERTED', label: 'Convertidos' },
  { key: 'CANCELLED', label: 'Cancelados' },
];

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pendiente', className: 'badge-gray' },
  PAYMENT_PENDING_REVIEW: { label: 'Por verificar', className: 'badge-amber' },
  CONFIRMED: { label: 'Confirmado', className: 'badge-green' },
  CONVERTED: { label: 'Convertido', className: 'badge-blue' },
  CANCELLED: { label: 'Cancelado', className: 'badge-red' },
  EXPIRED: { label: 'Vencido', className: 'badge-red' },
};

const PAYMENT_METHOD_INFO: Record<string, { label: string; icon: any }> = {
  EFECTIVO: { label: 'Efectivo', icon: Banknote },
  TRANSFERENCIA: { label: 'Transferencia', icon: Landmark },
  MERCADOPAGO: { label: 'Mercado Pago', icon: Wallet },
  WHATSAPP: { label: 'WhatsApp', icon: MessageCircle },
};

export default function TiendaOnlinePedidosPage() {
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [acting, setActing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/tienda-online/orders', { params: statusFilter ? { status: statusFilter } : {} });
      setOrders(data.content ?? []);
    } catch (err: any) {
      if (err?.response?.status === 403 && err?.response?.data?.code === 'PLAN_FEATURE_LOCKED') {
        toast.error(err.response.data.message ?? 'La tienda online no está incluida en tu plan actual.');
      }
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const openDetail = async (id: string) => {
    try {
      const { data } = await api.get(`/tienda-online/orders/${id}`);
      setDetail(data.content);
    } catch {
      toast.error('No se pudo cargar el pedido');
    }
  };

  const runAction = async (fn: () => Promise<any>, successMsg: string) => {
    setActing(true);
    try {
      await fn();
      toast.success(successMsg);
      setDetail(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo completar la acción');
    } finally {
      setActing(false);
    }
  };

  const confirmTransfer = (id: string) => runAction(() => api.post(`/tienda-online/orders/${id}/confirm-transfer`), 'Transferencia confirmada');
  const rejectTransfer = (id: string) => {
    const reason = prompt('Motivo del rechazo (opcional):') ?? undefined;
    return runAction(() => api.post(`/tienda-online/orders/${id}/reject-transfer`, { reason }), 'Transferencia rechazada');
  };
  const cancelOrder = (id: string) => {
    const reason = prompt('Motivo de la cancelación (opcional):') ?? undefined;
    return runAction(() => api.post(`/tienda-online/orders/${id}/cancel`, { reason }), 'Pedido cancelado');
  };
  const convertToSale = (id: string) => runAction(() => api.post(`/tienda-online/orders/${id}/convert-to-sale`), 'Pedido convertido en venta');

  return (
    <AppLayout title="Tienda Online" subtitle="Pedidos">
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`btn btn-sm ${statusFilter === tab.key ? 'btn-primary' : 'btn-secondary'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
        ) : orders.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 60, color: 'var(--text3)' }}>
            <ShoppingBag size={28} />
            <span style={{ fontSize: 13 }}>Sin pedidos</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {orders.map((o) => {
              const badge = STATUS_BADGE[o.status] ?? STATUS_BADGE.PENDING;
              const payment = PAYMENT_METHOD_INFO[o.paymentMethod] ?? PAYMENT_METHOD_INFO.EFECTIVO;
              const PaymentIcon = payment.icon;
              return (
                <div
                  key={o.id}
                  onClick={() => openDetail(o.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{o.customerName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      {fmtDate(o.createdAt)} · {o.items.length} producto{o.items.length === 1 ? '' : 's'}
                      · <PaymentIcon size={11} /> {payment.label}
                    </div>
                  </div>
                  <span className={`badge ${badge.className}`}>{badge.label}</span>
                  <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 13, width: 90, textAlign: 'right' }}>{fmtMoney(o.total)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{detail.customerName}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Pedido #{detail.id.slice(-8).toUpperCase()} · {fmtDate(detail.createdAt)}</div>
              </div>
              <button onClick={() => setDetail(null)} className="btn btn-ghost btn-xs"><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text3)' }}>
                {detail.customerPhone && <span>📞 {detail.customerPhone}</span>}
                {detail.customerEmail && <span>✉️ {detail.customerEmail}</span>}
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {(() => {
                    const payment = PAYMENT_METHOD_INFO[detail.paymentMethod] ?? PAYMENT_METHOD_INFO.EFECTIVO;
                    const PaymentIcon = payment.icon;
                    return <><PaymentIcon size={12} /> {payment.label}</>;
                  })()}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Package size={12} /> Retiro en local
                </span>
              </div>

              {detail.customerNotes && (
                <div style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic' }}>&quot;{detail.customerNotes}&quot;</div>
              )}

              {detail.transferProofUrl && (
                <a href={detail.transferProofUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-xs" style={{ alignSelf: 'flex-start' }}>
                  Ver comprobante
                </a>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {detail.items.map((item) => {
                  const qty = item.quantityKg ?? item.quantity ?? 0;
                  const name = item.product?.name || item.productNameSnapshot || 'Producto';
                  return (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                        {item.product?.imageUrl ? <img src={item.product.imageUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Package size={14} style={{ color: 'var(--text3)' }} />}
                      </div>
                      <div style={{ flex: 1, fontSize: 12 }}>{name} × {qty}</div>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{fmtMoney(item.subtotal)}</div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800 }}>
                <span>Total</span><span>{fmtMoney(detail.total)}</span>
              </div>

              {detail.cancelReason && (
                <div style={{ fontSize: 12, color: 'var(--danger)' }}>Motivo: {detail.cancelReason}</div>
              )}
            </div>
            <div className="modal-footer" style={{ flexWrap: 'wrap', gap: 8 }}>
              {detail.status === 'PENDING' && detail.paymentMethod === 'TRANSFERENCIA' && (
                <>
                  <button onClick={() => rejectTransfer(detail.id)} disabled={acting} className="btn btn-secondary btn-sm" style={{ gap: 4, color: 'var(--danger)' }}>
                    <Ban size={13} /> Rechazar
                  </button>
                  <button onClick={() => confirmTransfer(detail.id)} disabled={acting} className="btn btn-primary btn-sm" style={{ gap: 4 }}>
                    <Check size={13} /> Confirmar pago
                  </button>
                </>
              )}
              {detail.status === 'PAYMENT_PENDING_REVIEW' && (
                <>
                  <button onClick={() => rejectTransfer(detail.id)} disabled={acting} className="btn btn-secondary btn-sm" style={{ gap: 4, color: 'var(--danger)' }}>
                    <Ban size={13} /> Rechazar
                  </button>
                  <button onClick={() => confirmTransfer(detail.id)} disabled={acting} className="btn btn-primary btn-sm" style={{ gap: 4 }}>
                    <Check size={13} /> Confirmar pago
                  </button>
                </>
              )}
              {detail.status === 'CONFIRMED' && (
                <>
                  <button onClick={() => cancelOrder(detail.id)} disabled={acting} className="btn btn-secondary btn-sm" style={{ gap: 4, color: 'var(--danger)' }}>
                    <Ban size={13} /> Cancelar
                  </button>
                  <button onClick={() => convertToSale(detail.id)} disabled={acting} className="btn btn-primary btn-sm" style={{ gap: 4 }}>
                    <Check size={13} /> Convertir en venta
                  </button>
                </>
              )}
              {detail.status === 'PENDING' && detail.paymentMethod === 'MERCADOPAGO' && (
                <>
                  <span style={{ fontSize: 12, color: 'var(--text3)', marginRight: 'auto' }}>
                    Se confirma solo cuando Mercado Pago aprueba el pago.
                  </span>
                  <button onClick={() => cancelOrder(detail.id)} disabled={acting} className="btn btn-secondary btn-sm" style={{ gap: 4, color: 'var(--danger)' }}>
                    <Ban size={13} /> Cancelar
                  </button>
                </>
              )}
              {detail.status === 'CONVERTED' && (
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>Ya convertido en una venta.</span>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
