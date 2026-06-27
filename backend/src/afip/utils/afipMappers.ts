/**
 * Helpers de transformacion de datos para facturacion AFIP.
 * Extraidos de afip.routes.ts (doc seccion 4.3: modularizar AFIP).
 * Ninguno de estos tiene efectos secundarios ni accede a la DB: son
 * funciones puras de mapeo, faciles de testear de forma unitaria.
 */

export function normalizarDocumento(valor: unknown): string {
  if (valor == null) return "";
  return String(valor).replace(/\D/g, "").trim();
}

export function detectarTipoDocumento(valor: unknown): {
  tipoDoc: number;
  nroDoc: number;
  label: "DNI" | "CUIT" | "CUIL";
} | null {
  const raw = normalizarDocumento(valor);
  if (!raw) return null;

  const n = parseInt(raw, 10);
  if (isNaN(n)) return null;

  // CUIT/CUIL: 11 digitos que empiezan con 20, 23, 24, 27, 30, 33, 34
  if (raw.length === 11 && /^(20|23|24|27|30|33|34)/.test(raw)) {
    const label = raw.startsWith("30") || raw.startsWith("33") || raw.startsWith("34")
      ? "CUIT"
      : "CUIL";
    return { tipoDoc: 80, nroDoc: n, label };
  }

  // DNI: 7-8 digitos
  if (raw.length >= 7 && raw.length <= 8) {
    return { tipoDoc: 96, nroDoc: n, label: "DNI" };
  }

  // Fallback: tratar como CUIT
  return { tipoDoc: 80, nroDoc: n, label: "CUIT" };
}

export function mapTipoCliente(
  clientCategory?: string
): "Consumidor Final" | "Cliente" | "Mayorista" {
  if (clientCategory === "MAYORISTA") return "Mayorista";
  if (clientCategory === "MINORISTA") return "Cliente";
  return "Consumidor Final";
}

export function getNombreCliente(
  client: any,
  facturaData: any
): string {
  if (facturaData?.nombreCliente) return String(facturaData.nombreCliente).trim();
  if (client?.name) return String(client.name).trim();
  if (client?.businessName) return String(client.businessName).trim();
  return "Consumidor Final";
}

export function getDocumentoCliente(
  client: any,
  facturaData: any
): { tipoDoc: number; nroDoc: number } {
  const raw = facturaData?.cuit || facturaData?.dni || client?.cuit || client?.dni;
  const detected = detectarTipoDocumento(raw);
  if (detected) return { tipoDoc: detected.tipoDoc, nroDoc: detected.nroDoc };
  return { tipoDoc: 99, nroDoc: 0 }; // consumidor final sin documento identificado
}

export function getDomicilioCliente(client: any): string {
  if (!client) return "";
  const parts = [client.address, client.city, client.province].filter(Boolean);
  return parts.join(", ").trim();
}

export function numberOrZero(value: unknown): number {
  const n = Number(value);
  return isFinite(n) ? n : 0;
}

/**
 * Mapea los productos de una venta o del body de la request al formato
 * requerido por los servicios de emision AFIP.
 */
export function mapProductsFromSaleOrBody(
  reqBody: any,
  sale: any
): {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}[] {
  // Si el body trae productos explicitamente, usarlos (override manual)
  if (Array.isArray(reqBody?.productos) && reqBody.productos.length > 0) {
    return reqBody.productos.map((p: any) => ({
      descripcion: String(p.descripcion || p.description || "Producto").trim(),
      cantidad: numberOrZero(p.cantidad ?? p.quantity ?? 1),
      precioUnitario: numberOrZero(p.precioUnitario ?? p.price ?? 0),
      subtotal: numberOrZero(p.subtotal ?? 0),
    }));
  }

  // Construir desde los items de la venta
  const items: any[] = sale?.items ?? [];
  return items
    .filter((item: any) => !item.isDelivery)
    .map((item: any) => {
      const cantidad = numberOrZero(item.quantityKg ?? item.quantity ?? 1);
      const precioUnitario = numberOrZero(item.price ?? 0);
      return {
        descripcion: String(item.productName || item.product?.name || "Producto").trim(),
        cantidad,
        precioUnitario,
        subtotal: Math.round(cantidad * precioUnitario * 100) / 100,
      };
    });
}

/**
 * Detecta el metodo de pago consolidado para el comprobante AFIP
 * (AFIP solo acepta un metodo por comprobante — usamos el de mayor monto).
 */
export function getMetodoPago(reqBody: any, sale: any): string {
  // Override explicito desde el body
  if (reqBody?.metodoPago) return String(reqBody.metodoPago);

  const payments: any[] = sale?.payments ?? [];
  if (payments.length === 0) return sale?.paymentMethod ?? "EFECTIVO";

  // Metodo con mayor monto parcial
  const dominant = payments.reduce((best: any, cur: any) =>
    (cur.amount ?? 0) > (best.amount ?? 0) ? cur : best
  );
  return dominant.method ?? "EFECTIVO";
}

export function getFacturaQrUrl(factura: any): string | undefined {
  return factura?.qrUrl ?? factura?.qr ?? undefined;
}
