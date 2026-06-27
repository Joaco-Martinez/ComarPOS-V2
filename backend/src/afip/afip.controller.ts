/**
 * Controladores de facturacion AFIP.
 * Extraidos a sub-modulos por endpoint para reducir la superficie de cambio:
 *   - controllers/token.controller.ts        → token / prueba
 *   - controllers/facturar.controller.ts      → emision de factura
 *   - controllers/notaCredito.controller.ts   → emision de nota de credito
 *   - controllers/pendingAfip.controller.ts   → ventas pendientes de AFIP
 *   - controllers/facturaBySale.controller.ts → consulta de factura por venta
 *
 * Este archivo es el unico punto de entrada al exterior (doc seccion 4.3).
 */
export { tokenController, pruebaController } from "./controllers/token.controller";
export { facturarController } from "./controllers/facturar.controller";
export { notaCreditoController } from "./controllers/notaCredito.controller";
export { pendingAfipController } from "./controllers/pendingAfip.controller";
export { facturaBySaleController } from "./controllers/facturaBySale.controller";
