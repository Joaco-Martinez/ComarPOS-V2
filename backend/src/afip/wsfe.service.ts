/**
 * WSFE legacy (hardcodeado a produccion/PtoVta 7).
 * Logica extraida a sub-modulos para reducir la superficie de cambio:
 *   - wsfe/wsfe.helpers.ts     → helpers compartidos (parsing, logging, impresion)
 *   - wsfe/wsfe.factura.ts     → ultimo comprobante + emision de factura
 *   - wsfe/wsfe.notaCredito.ts → emision de nota de credito
 *
 * Nota: coexiste con wsfe-base.service.ts (version configurable por ArcaConfig)
 * y wsfe-A/B/C.service.ts. No se unifican aca (ver doc seccion 7: "Es la parte
 * mas sensible del sistema... hacerlo en una rama aparte contra homologacion").
 *
 * Este archivo es el unico punto de entrada al exterior (doc seccion 4.3).
 */
export { obtenerUltimoComprobanteAFIP, emitirFacturaAFIP } from "./wsfe/wsfe.factura";
export { emitirNotaCreditoAFIP } from "./wsfe/wsfe.notaCredito";
