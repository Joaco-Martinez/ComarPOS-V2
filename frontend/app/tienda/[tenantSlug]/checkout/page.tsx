/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useStore } from '../StoreContext';
import { useCartContext } from '../CartContext';
import { useAccount } from '../AccountContext';
import { Package, Banknote, Landmark, Wallet, MessageCircle, UserCircle2 } from 'lucide-react';

const money = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0);

export default function TiendaCheckoutPage() {
  const { store, tenantSlug } = useStore();
  const { cart, total, clear } = useCartContext();
  const { account, loading: accountLoading } = useAccount();
  const router = useRouter();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');

  const [paymentMethod, setPaymentMethod] = useState<'EFECTIVO' | 'TRANSFERENCIA' | 'MERCADOPAGO' | 'WHATSAPP'>('EFECTIVO');
  const [submitting, setSubmitting] = useState(false);

  // Cuenta obligatoria: precarga nombre/email de la cuenta apenas se resuelve
  // (no pisa lo que el comprador ya haya tipeado a mano).
  useEffect(() => {
    if (account && !customerName) setCustomerName(account.name);
    if (account && !customerEmail) setCustomerEmail(account.email);
  }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit = cart.length > 0 && !!account && customerName.trim().length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const body: Record<string, any> = {
        items: cart.map((l) => ({
          productId: l.productId,
          quantity: l.saleUnit === 'KG' ? undefined : l.quantity,
          quantityKg: l.saleUnit === 'KG' ? l.quantityKg : undefined,
        })),
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        paymentMethod,
        customerNotes: customerNotes.trim() || undefined,
      };

      const { data } = await api.post(`/tienda/${tenantSlug}/orders`, body);
      clear();
      if (paymentMethod === 'MERCADOPAGO' && data.content.mpInitPoint) {
        window.location.href = data.content.mpInitPoint;
        return;
      }
      if (paymentMethod === 'WHATSAPP' && data.content.whatsappUrl) {
        window.location.href = data.content.whatsappUrl;
        return;
      }
      router.push(`/tienda/${tenantSlug}/pedido/${data.content.publicToken}`);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        router.push(`/tienda/${tenantSlug}/cuenta?next=/tienda/${tenantSlug}/checkout`);
        return;
      }
      toast.error(err?.response?.data?.message ?? 'No se pudo confirmar el pedido');
    } finally {
      setSubmitting(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '60px 0', color: '#98A2B3' }}>
        <Package size={36} />
        <span style={{ fontSize: 14 }}>Tu carrito está vacío</span>
      </div>
    );
  }

  if (!accountLoading && !account) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '60px 0', textAlign: 'center' }}>
        <UserCircle2 size={40} style={{ color: '#98A2B3' }} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#172033', marginBottom: 4 }}>Necesitás una cuenta para comprar</div>
          <p style={{ fontSize: 13, color: '#667085', maxWidth: 320 }}>
            Creá una cuenta o ingresá con la que ya tenés en {store.storeName} para completar tu pedido.
          </p>
        </div>
        <Link
          href={`/tienda/${tenantSlug}/cuenta?next=/tienda/${tenantSlug}/checkout`}
          style={{
            padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--store-accent)',
            color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none',
          }}
        >
          Ingresar o crear cuenta
        </Link>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 8, maxWidth: 560, paddingBottom: 40 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: '#172033', marginBottom: 16 }}>Finalizar compra</h2>

      <section style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: '#667085', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>Tus datos</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Nombre y apellido *"
            style={inputStyle}
          />
          <input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="Teléfono"
            style={inputStyle}
          />
          <input
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="Email (opcional)"
            style={inputStyle}
          />
        </div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: '#667085', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>Entrega</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, border: '1px solid #D0D5DD', fontSize: 13, color: '#344054' }}>
          <Package size={14} style={{ color: 'var(--store-accent)' }} /> Retiro en el local
        </div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: '#667085', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>Forma de pago</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setPaymentMethod('EFECTIVO')} style={segButtonStyle(paymentMethod === 'EFECTIVO')}>
            <Banknote size={14} /> Efectivo
          </button>
          <button onClick={() => setPaymentMethod('TRANSFERENCIA')} style={segButtonStyle(paymentMethod === 'TRANSFERENCIA')}>
            <Landmark size={14} /> Transferencia
          </button>
          {store.mpEnabled && (
            <button onClick={() => setPaymentMethod('MERCADOPAGO')} style={segButtonStyle(paymentMethod === 'MERCADOPAGO')}>
              <Wallet size={14} /> Mercado Pago
            </button>
          )}
          {store.contactPhone && (
            <button onClick={() => setPaymentMethod('WHATSAPP')} style={segButtonStyle(paymentMethod === 'WHATSAPP')}>
              <MessageCircle size={14} /> WhatsApp
            </button>
          )}
        </div>
        {paymentMethod === 'MERCADOPAGO' && (
          <div style={{ marginTop: 10, padding: 12, borderRadius: 8, background: '#F7F8FA', fontSize: 12, color: '#344054' }}>
            Te vamos a redirigir a Mercado Pago para completar el pago de forma segura.
          </div>
        )}
        {paymentMethod === 'TRANSFERENCIA' && store.transferInstructions && (
          <div style={{ marginTop: 10, padding: 12, borderRadius: 8, background: '#F7F8FA', fontSize: 12, color: '#344054', whiteSpace: 'pre-wrap' }}>
            {store.transferInstructions}
          </div>
        )}
        {paymentMethod === 'WHATSAPP' && (
          <div style={{ marginTop: 10, padding: 12, borderRadius: 8, background: '#F7F8FA', fontSize: 12, color: '#344054' }}>
            Dejamos tu pedido como pendiente y te vamos a redirigir al WhatsApp del local con el detalle, para coordinar el pago y la entrega.
          </div>
        )}
      </section>

      <section style={{ marginBottom: 20 }}>
        <textarea
          value={customerNotes}
          onChange={(e) => setCustomerNotes(e.target.value)}
          placeholder="Notas para tu pedido (opcional)"
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16, paddingTop: 12, borderTop: '1px solid #E4E7EC' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#667085' }}>
          <span>Subtotal</span><span>{money(total)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 800, color: '#172033', marginTop: 4 }}>
          <span>Total</span><span>{money(total)}</span>
        </div>
      </div>

      <button
        onClick={submit}
        disabled={!canSubmit}
        style={{
          width: '100%', padding: '13px 16px', borderRadius: 10, border: 'none',
          background: canSubmit ? 'var(--store-accent)' : '#E4E7EC', color: canSubmit ? '#fff' : '#98A2B3',
          fontSize: 14, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed',
        }}
      >
        {submitting ? 'Confirmando...' : 'Confirmar pedido'}
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #D0D5DD', fontSize: 13, outline: 'none',
};

function segButtonStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '10px 12px', borderRadius: 8, border: `1px solid ${active ? 'var(--store-accent)' : '#D0D5DD'}`,
    background: active ? 'var(--store-accent)' : '#fff', color: active ? '#fff' : '#344054',
    fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer',
  };
}
