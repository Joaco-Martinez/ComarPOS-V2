/**
 * Calculo de descuentos multiples de una cotizacion (pantalla de
 * Cotizaciones, doc "listas de precios + descuentos multiples"). Mecanismo
 * nuevo y aditivo: el descuento unico de siempre (Sale.discountType/Value,
 * usado por el POS) sigue funcionando igual y no pasa por acá.
 */
import { round2 } from "./sale.pricing";

export type DiscountInput = {
  label?: string | null;
  type: "PERCENTAGE" | "FIXED";
  value: number;
  applied?: boolean;
};

/**
 * accumulate = true: cada descuento aplicado se aplica en cadena sobre el
 * remanente (10% y despues 5% sobre lo que quedo, no sobre el subtotal
 * original).
 * accumulate = false: solo se aplica UN descuento (el de menor "order", ya
 * ordenado por el caller) - pensado para alternativas tipo "efectivo 15%" vs
 * "tarjeta 12%" que no se suman entre si.
 */
export function calculateDiscountedTotal(
  baseSubtotal: number,
  discounts: DiscountInput[],
  accumulate: boolean
): { discountAmount: number } {
  const applied = discounts.filter((d) => d.applied !== false);

  if (applied.length === 0 || baseSubtotal <= 0) {
    return { discountAmount: 0 };
  }

  const amountOf = (d: DiscountInput, base: number) =>
    d.type === "PERCENTAGE" ? base * (Number(d.value) / 100) : Number(d.value);

  if (!accumulate) {
    const amount = amountOf(applied[0], baseSubtotal);
    return { discountAmount: round2(Math.max(0, Math.min(amount, baseSubtotal))) };
  }

  let remaining = baseSubtotal;

  for (const discount of applied) {
    const amount = amountOf(discount, remaining);
    remaining = Math.max(0, remaining - amount);
  }

  return { discountAmount: round2(baseSubtotal - remaining) };
}
