/**
 * Tipos y constantes visuales del PDF de cotizacion.
 * Extraidos de generarCotizacionPDF.ts (modularizacion, doc seccion 4).
 */
export type CotizacionPDFSale = {
  id: string;
  subtotal: number;
  total: number;
  discountType?: string | null;
  discountValue?: number | null;
  paymentMethod?: string | null;
  receiptType?: string | null;
  status?: string | null;
  stockLocation?: string | null;
  createdAt: Date;
  quotationExpiresAt?: Date | null;
  tenantId?: string | null;
  logoUrl?: string | null;
  businessName?: string | null;
  businessCuit?: string | null;
  businessAddress?: string | null;
  businessPhone?: string | null;
  businessEmail?: string | null;

  user?: {
    name?: string | null;
  } | null;

  client?: {
    nombre?: string | null;
    apellido?: string | null;
    dni?: string | null;
    telefono?: string | null;
    gmail?: string | null;
    address?: string | null;
    direccion?: string | null;
    category?: string | null;
  } | null;

  items: {
    quantity: number;
    quantityKg?: number | null;
    price: number;
    subtotal: number;
    ivaRate?: number | null;
    productNameSnapshot?: string | null;
    productSkuSnapshot?: string | null;
    product?: {
      name?: string | null;
      sku?: string | null;
      imageUrl?: string | null;
      saleUnit?: string | null;
      ivaRate?: number | null;
    } | null;
  }[];
};

export const PAGE = {
  width: 595.28,
  height: 841.89,
  marginX: 46,
  top: 42,
  bottom: 790,
};

export const C = {
  black: "#111827",
  text: "#172033",
  muted: "#667085",
  lightMuted: "#98A2B3",
  line: "#D0D5DD",
  lightLine: "#EAECF0",
  white: "#FFFFFF",
  soft: "#F8FAFC",
  headerSoft: "#F4F6F8",
  rowSoft: "#FAFBFC",
};
