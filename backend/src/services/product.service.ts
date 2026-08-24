/**
 * Servicio de productos.
 * Toda la logica fue extraida a sub-modulos para reducir la superficie de cambio:
 *   - product/product.helpers.ts → validaciones y normalizacion compartida
 *   - product/product.read.ts    → listado/lectura + movimientos de stock
 *   - product/product.write.ts   → alta, edicion, imagen y componentes
 *   - product/product.stock.ts   → transferencias e ingresos de stock
 *
 * Este archivo es el unico punto de entrada al exterior (doc seccion 4.1).
 */
import { getAll, getBySku, getById, getMovements } from "./product/product.read";
import { create, updateImage, update, updateComponents, deleteProduct } from "./product/product.write";
import { transferStock, transferStockKg, addStockKg, addStock, setStockMin } from "./product/product.stock";

export const productService = {
  getAll,
  getBySku,
  getById,
  create,
  updateImage,
  update,
  updateComponents,
  delete: deleteProduct,
  transferStock,
  transferStockKg,
  addStockKg,
  addStock,
  setStockMin,
  getMovements,
};
