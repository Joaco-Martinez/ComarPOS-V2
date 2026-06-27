/**
 * Tipos y constantes visuales del PDF de factura.
 * Extraidos de facturaPdfGenerator.service.ts (modularizacion, doc seccion 4).
 */
export type Product = {
  name: string;
  quantity: number;
  quantityKg?: number | null;
  price: number;
  subtotal?: number;
};

export type TipoCliente = "Consumidor Final" | "Cliente" | "Mayorista";

export type FacturaPDFData = {
  factura: {
    cuit: string;
    puntoVenta: number;
    tipoComprobante: number;
    tipoDoc: number;
    nroDoc: number;
    numero: number;
    fechaEmision: Date;
    resultado: string;
    cae: string;
    caeVto: Date;
    total: number;
    neto: number;
    iva: number;
    condicionIVAReceptor: number;
    moneda: string;
    urlQR?: string;
    saleId: string;
  };

  empresa?: {
    name?: string;
    subtitle?: string;
    cuit?: string;
    address?: string;
    phone?: string;
    ivaCondition?: string;
  };

  cliente: {
    nombre: string;
    apellido?: string;
    dni: string;
    telefono?: string;
    gmail?: string;
    category?: TipoCliente;
  };

  products: Product[];
  logoPath?: string;
};

export const COLORS = {
  black: "#111111",
  red: "#b91c1c",
  redDark: "#7f1d1d",
  gray900: "#222222",
  gray700: "#4b5563",
  gray500: "#6b7280",
  gray300: "#d1d5db",
  gray200: "#e5e7eb",
  gray100: "#f3f4f6",
  white: "#ffffff",
};
