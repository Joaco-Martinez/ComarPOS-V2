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
import { Package, Banknote, Landmark, Wallet, MessageCircle, UserCircle2, ArrowLeft } from 'lucide-react';

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
      <div className="t-empty">
        <Package size={40} />
        <span style={{ fontSize: 15, fontWeight: 700, color: '#344054' }}>Tu carrito está vacío</span>
        <Link href={`/tienda/${tenantSlug}/productos`} className="t-btn" style={{ width: 'auto', marginTop: 8, paddingInline: 24 }}>
          Ver productos
        </Link>
      </div>
    );
  }

  if (!accountLoading && !account) {
    return (
      <div className="t-empty" style={{ gap: 12 }}>
        <UserCircle2 size={44} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#172033', marginBottom: 6 }}>Necesitás una cuenta para comprar</div>
          <p style={{ fontSize: 14, color: '#667085', maxWidth: 320, lineHeight: 1.5 }}>
            Creá una cuenta o ingresá con la que ya tenés en {store.storeName} para completar tu pedido.
          </p>
        </div>
        <Link
          href={`/tienda/${tenantSlug}/cuenta?next=/tienda/${tenantSlug}/checkout`}
          className="t-btn"
          style={{ width: 'auto', paddingInline: 24 }}
        >
          Ingresar o crear cuenta
        </Link>
      </div>
    );
  }

  const itemsCount = cart.reduce((acc, l) => acc + (l.saleUnit === 'KG' ? 1 : l.quantity), 0);

  return (
    <div className="t-narrow">
      <div className="t-section-head">
        <h2 className="t-h2">Finalizar compra</h2>
        <Link href={`/tienda/${tenantSlug}/carrito`} className="t-link">
          <ArrowLeft size={14} /> Carrito
        </Link>
      </div>

      <section className="t-section">
        <h3 className="t-h3">Tus datos</h3>
        <div className="t-stack">
          <input
            className="t-input"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Nombre y apellido *"
            autoComplete="name"
          />
          <input
            className="t-input"
            type="tel"
            inputMode="tel"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="Teléfono"
            autoComplete="tel"
          />
          <input
            className="t-input"
            type="email"
            inputMode="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="Email (opcional)"
            autoComplete="email"
          />
        </div>
      </section>

      <section className="t-section">
        <h3 className="t-h3">Entrega</h3>
        <div className="t-box">
          <Package size={16} style={{ color: 'var(--store-accent)', flexShrink: 0 }} /> Retiro en el local
        </div>
      </section>

      <section className="t-section">
        <h3 className="t-h3">Forma de pago</h3>
        <div className="t-pay-grid">
          <button onClick={() => setPaymentMethod('EFECTIVO')} className={`t-pay${paymentMethod === 'EFECTIVO' ? ' is-active' : ''}`} aria-pressed={paymentMethod === 'EFECTIVO'}>
            <Banknote size={17} /> Efectivo
          </button>
          <button onClick={() => setPaymentMethod('TRANSFERENCIA')} className={`t-pay${paymentMethod === 'TRANSFERENCIA' ? ' is-active' : ''}`} aria-pressed={paymentMethod === 'TRANSFERENCIA'}>
            <Landmark size={17} /> Transferencia
          </button>
          {store.mpEnabled && (
            <button onClick={() => setPaymentMethod('MERCADOPAGO')} className={`t-pay${paymentMethod === 'MERCADOPAGO' ? ' is-active' : ''}`} aria-pressed={paymentMethod === 'MERCADOPAGO'}>
              <Wallet size={17} /> Mercado Pago
            </button>
          )}
          {store.contactPhone && (
            <button onClick={() => setPaymentMethod('WHATSAPP')} className={`t-pay${paymentMethod === 'WHATSAPP' ? ' is-active' : ''}`} aria-pressed={paymentMethod === 'WHATSAPP'}>
              <MessageCircle size={17} /> WhatsApp
            </button>
          )}
        </div>
        {paymentMethod === 'MERCADOPAGO' && (
          <div className="t-note">Te vamos a redirigir a Mercado Pago para completar el pago de forma segura.</div>
        )}
        {paymentMethod === 'TRANSFERENCIA' && store.transferInstructions && (
          <div className="t-note" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{store.transferInstructions}</div>
        )}
        {paymentMethod === 'WHATSAPP' && (
          <div className="t-note">
            Dejamos tu pedido como pendiente y te vamos a redirigir al WhatsApp del local con el detalle, para coordinar el pago y la entrega.
          </div>
        )}
      </section>

      <section className="t-section">
        <h3 className="t-h3">Notas</h3>
        <textarea
          className="t-input"
          value={customerNotes}
          onChange={(e) => setCustomerNotes(e.target.value)}
          placeholder="Notas para tu pedido (opcional)"
          rows={2}
        />
      </section>

      <section className="t-summary">
        <h3 className="t-h3" style={{ marginBottom: 0 }}>Resumen · {itemsCount} producto{itemsCount === 1 ? '' : 's'}</h3>
        <div className="t-mini-lines">
          {cart.map((l) => {
            const q = l.saleUnit === 'KG' ? l.quantityKg : l.quantity;
            return (
              <div key={l.productId} className="t-mini-line">
                <span>{l.saleUnit === 'KG' ? `${q} kg` : `${q}×`} {l.name}</span>
                <span>{money(l.price * q)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="t-sticky-cta">
        <div className="t-total-row" style={{ marginBottom: 12 }}>
          <span className="label">Total</span>
          <span className="value">{money(total)}</span>
        </div>
        <button onClick={submit} disabled={!canSubmit} className="t-btn">
          {submitting ? 'Confirmando...' : 'Confirmar pedido'}
        </button>
      </div>
    </div>
  );
}
