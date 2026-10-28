import type { PaymentMethod } from '@/types';

// Descuento/recargo automatico por medio de pago (Configuracion > Medios de
// pago, Tenant.paymentMethodAdjustments en el backend). El POS lo aplica
// como descuento/recargo de la venta al elegir el metodo.
export type PaymentAdjustment = {
  method: PaymentMethod;
  type: 'DISCOUNT' | 'SURCHARGE';
  percent: number;
};

// Mismos metodos que ofrece el POS (ver ALL_METHODS en pos/page.tsx).
export const ADJUSTABLE_PAYMENT_METHODS: { method: PaymentMethod; label: string }[] = [
  { method: 'EFECTIVO', label: 'Efectivo' },
  { method: 'TRANSFERENCIA', label: 'Transferencia' },
  { method: 'TARJETA', label: 'Tarjeta' },
  { method: 'QR_MERCADOPAGO', label: 'MercadoPago' },
  { method: 'QR_NACION', label: 'QR Nación' },
  { method: 'CUENTA_CORRIENTE', label: 'Cuenta corriente' },
];

export const paymentMethodLabel = (method: PaymentMethod) =>
  ADJUSTABLE_PAYMENT_METHODS.find((m) => m.method === method)?.label ?? method;

export const describeAdjustment = (adj: PaymentAdjustment) =>
  `${adj.type === 'DISCOUNT' ? 'Descuento' : 'Recargo'} ${paymentMethodLabel(adj.method)} (${adj.percent}%)`;
