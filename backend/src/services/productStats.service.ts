/**
 * Servicio de estadisticas de productos.
 * Logica extraida a sub-modulos para reducir la superficie de cambio:
 *   - productStats/productStats.helpers.ts  → tipos + reparto de deuda en cuenta corriente
 *   - productStats/productStats.report.ts   → reporte base agregado por producto
 *   - productStats/productStats.rankings.ts → top/peor productos, por rango, por mes
 *   - productStats/productStats.totals.ts   → totales globales y por rango
 *
 * Nota: este archivo antes instanciaba su propio `new PrismaClient()` en vez de
 * usar el singleton de src/prisma.ts, abriendo un segundo pool de conexiones a
 * la DB en paralelo. Se corrigio para que todos los sub-modulos usen el mismo
 * cliente compartido (mismo comportamiento, sin el pool duplicado).
 *
 * Este archivo es el unico punto de entrada al exterior (doc seccion 4).
 */
import { createStatsFromSale, attachProducts, groupAll, buildProductReport } from "./productStats/productStats.report";
import {
  getTopProducts,
  getWorstProducts,
  getTopProductsByRange,
  getWorstProductsByRange,
  getBestProductByMonth,
  getWorstProductByMonth,
} from "./productStats/productStats.rankings";
import { getTotals, getTotalsByRange } from "./productStats/productStats.totals";

export const productStatsService = {
  createStatsFromSale,
  attachProducts,
  groupAll,
  buildProductReport,
  getTopProducts,
  getWorstProducts,
  getTopProductsByRange,
  getWorstProductsByRange,
  getBestProductByMonth,
  getWorstProductByMonth,
  getTotals,
  getTotalsByRange,
};
