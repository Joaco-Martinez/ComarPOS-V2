/**
 * Plan unico de ComarPOS (ver services/billing/*.ts). Precio "de
 * lanzamiento": quien se suscribe ahora lo paga de por vida aunque este
 * numero suba mas adelante para nuevos suscriptores - por eso el monto
 * efectivamente cobrado a cada tenant se guarda aparte en
 * Tenant.mpSubscriptionAmount al momento del primer pago acreditado, en vez
 * de leerse siempre de aca. Cambiar PRICE_ARS solo afecta a suscripciones
 * nuevas de ahi en adelante.
 */
export const PLAN = {
  name: "Plan ComarPOS",
  priceArs: 35000,
  currency: "ARS",
  tagline: "Precio de lanzamiento: queda fijo de por vida para quien se suscribe ahora. Por tiempo limitado.",
};
