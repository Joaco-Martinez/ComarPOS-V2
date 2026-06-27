/**
 * Tipos y constantes del ticket/PDF de factura AFIP (formato ticket POS).
 * Extraidos de generarFacturaAfipPDF.ts (modularizacion, doc seccion 4).
 */
export type Product = {
  name: string;
  quantity: number;
  quantityKg?: number | null;
  price: number;
  subtotal?: number;
};

export type TipoCliente = "Consumidor Final" | "Cliente" | "Mayorista";

export const POS_LOCAL_URL = process.env.POS_LOCAL_URL;
export const POS_LOCAL_TOKEN = process.env.POS_LOCAL_TOKEN;
export const PAGE_WIDTH = 226;
