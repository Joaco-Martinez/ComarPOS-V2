/**
 * Servicio de ventas.
 * Toda la logica fue extraida a sub-modulos para reducir la superficie de cambio:
 *   - sale/sale.types.ts        → tipos e interfaces
 *   - sale/sale.pricing.ts      → resolucion de precios, items y descuentos
 *   - sale/sale.stock.ts        → operaciones de stock
 *   - sale/sale.payment.ts      → pagos y cuenta corriente
 *   - sale/sale.query.ts        → filtros, include, estadisticas, pdf queue
 *   - sale/sale.crud.ts         → listado/lectura + accion masiva sobre pendientes
 *   - sale/sale.create.ts       → alta de venta
 *   - sale/sale.update.ts       → edicion de items de venta pendiente
 *   - sale/sale.lifecycle.ts    → confirmar/cancelar venta, expiracion de cotizaciones
 *   - sale/sale.documents.ts    → PDFs no fiscales (nota de pedido, cotizacion)
 *   - sale/sale.payments-api.ts → actualizar metodo de pago / pagos
 *
 * Este archivo es el unico punto de entrada al exterior (doc seccion 4.1).
 */
import { getAll, getPending, getById, bulkUpdatePending } from "./sale/sale.crud";
import { create } from "./sale/sale.create";
import { updateItems } from "./sale/sale.update";
import { updateStatus, expirePendingQuotations } from "./sale/sale.lifecycle";
import { generarNotaPedido, generarCotizacion } from "./sale/sale.documents";
import { updatePaymentMethod, updatePayments } from "./sale/sale.payments-api";
import { ensureDeliveryProduct } from "./sale/sale.stock";

export const saleService = {
  getAll,
  getPending,
  getById,
  bulkUpdatePending,
  create,
  updateItems,
  updateStatus,
  generarNotaPedido,
  generarCotizacion,
  expirePendingQuotations,
  updatePaymentMethod,
  updatePayments,
  ensureDeliveryProduct,
};
