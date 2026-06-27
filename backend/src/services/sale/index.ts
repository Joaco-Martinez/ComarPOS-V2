/**
 * Barrel del módulo de ventas.
 * Importar desde aquí para no acoplarse a la estructura interna.
 *
 * Ejemplo:
 *   import { saleService } from "../services/sale";
 */
export { saleService } from "../sale.service";
export * from "./sale.types";
export * from "./sale.pricing";
export * from "./sale.stock";
export * from "./sale.payment";
export * from "./sale.query";
