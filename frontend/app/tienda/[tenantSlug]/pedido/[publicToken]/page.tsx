/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { CheckCircle2, Clock, XCircle, Package, UploadCloud } from 'lucide-react';

const money = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0);

type OrderItem = {
  id: string;
  productId: string;
  quantity: number | null;
  quantityKg: number | null;
  unitPrice: number;
  subtotal: number;
  productNameSnapshot: string | null;
  product?: { name: string; imageUrl: string | null; saleUnit: string } | null;
};

type PublicOrder = {
  id: string;
  publicToken: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: number;
  total: number;
  customerName: string;
  transferProofUrl: string | null;
  items: OrderItem[];
  createdAt: string;
};

const STATUS_LABEL: Record<string, { label: string; icon: any; color: string }> = {
  PENDING: { label: 'Esperando el comprobante de pago', icon: Clock, color: '#F79009' },
  PAYMENT_PENDING_REVIEW: { label: 'Verificando tu pago', icon: Clock, color: '#F79009' },
  CONFIRMED: { label: 'Pedido confirmado', icon: CheckCircle2, color: '#12B76A' },
  CONVERTED: { label: 'Pedido confirmado', icon: CheckCircle2, color: '#12B76A' },
  CANCELLED: { label: 'Pedido cancelado', icon: XCircle, color: '#F04438' },
  EXPIRED: { label: 'Pedido vencido', icon: XCircle, color: '#F04438' },
};

export default function TiendaPedidoPage() {
  const { tenantSlug, publicToken } = useParams<{ tenantSlug: string; publicToken: string }>();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const { data } = await api.get(`/tienda/${tenantSlug}/orders/${publicToken}`);
      setOrder(data.content);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'No pudimos encontrar este pedido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (tenantSlug && publicToken) load(); }, [tenantSlug, publicToken]);

  // El pedido pasa de PENDING a CONFIRMED/CANCELLED via el webhook de MP,
  // asincronico respecto de esta pantalla - refresca sola para que el
  // cliente no tenga que recargar a mano.
  useEffect(() => {
    if (!(order?.paymentMethod === 'MERCADOPAGO' && order?.status === 'PENDING')) return;
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [order?.paymentMethod, order?.status, tenantSlug, publicToken]);

  const uploadProof = async (file: File) => {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('proof', file);
      await api.post(`/tienda/${tenantSlug}/orders/${publicToken}/transfer-proof`, body);
      toast.success('Comprobante enviado, gracias!');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'No se pudo subir el comprobante');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div style={{ width: 24, height: 24, border: '3px solid #E4E7EC', borderTopColor: 'var(--store-accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '60px 0', color: '#98A2B3' }}>
        <Package size={36} />
        <span style={{ fontSize: 14 }}>{error || 'Pedido no encontrado'}</span>
      </div>
    );
  }

  const isMpPending = order.paymentMethod === 'MERCADOPAGO' && order.status === 'PENDING';
  const isWhatsappPending = order.paymentMethod === 'WHATSAPP' && order.status === 'PENDING';
  const statusInfo = isMpPending
    ? { label: 'Esperando la confirmación del pago', icon: Clock, color: '#F79009' }
    : isWhatsappPending
      ? { label: 'Pendiente — coordinando por WhatsApp con el local', icon: Clock, color: '#F79009' }
      : STATUS_LABEL[order.status] ?? STATUS_LABEL.PENDING;
  const StatusIcon = statusInfo.icon;
  const needsProof = order.paymentMethod === 'TRANSFERENCIA' && order.status === 'PENDING';

  return (
    <div style={{ paddingTop: 8, maxWidth: 560, paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, borderRadius: 10, background: `${statusInfo.color}14`, marginBottom: 20 }}>
        <StatusIcon size={22} style={{ color: statusInfo.color, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#172033' }}>{statusInfo.label}</div>
          <div style={{ fontSize: 11, color: '#98A2B3' }}>Pedido #{order.id.slice(-8).toUpperCase()}</div>
        </div>
      </div>

      {needsProof && (
        <div style={{ marginBottom: 20, padding: 16, borderRadius: 10, border: '1px dashed #D0D5DD' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#172033', marginBottom: 6 }}>Subí tu comprobante de transferencia</div>
          <div style={{ fontSize: 12, color: '#667085', marginBottom: 12 }}>Foto o PDF del comprobante para que podamos confirmar tu pedido.</div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadProof(f); e.target.value = ''; }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none', background: 'var(--store-accent)',
              color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              cursor: uploading ? 'default' : 'pointer',
            }}
          >
            <UploadCloud size={15} /> {uploading ? 'Subiendo...' : 'Elegir archivo'}
          </button>
        </div>
      )}

      {order.transferProofUrl && order.status !== 'PENDING' && (
        <div style={{ marginBottom: 20, fontSize: 12, color: '#667085', display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle2 size={14} style={{ color: '#12B76A' }} /> Comprobante recibido
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {order.items.map((item) => {
          const qty = item.quantityKg ?? item.quantity ?? 0;
          const name = item.product?.name || item.productNameSnapshot || 'Producto';
          return (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, border: '1px solid #E4E7EC', borderRadius: 10 }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, background: '#F7F8FA', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                {item.product?.imageUrl ? (
                  <img src={item.product.imageUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Package size={16} style={{ color: '#D0D5DD' }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#172033' }}>{name}</div>
                <div style={{ fontSize: 11, color: '#98A2B3' }}>{qty} {item.product?.saleUnit === 'KG' ? 'kg' : 'un.'} × {money(item.unitPrice)}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#172033' }}>{money(item.subtotal)}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 800, color: '#172033', paddingTop: 12, borderTop: '1px solid #E4E7EC' }}>
        <span>Total</span><span>{money(order.total)}</span>
      </div>

      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}
