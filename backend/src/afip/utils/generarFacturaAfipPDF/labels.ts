/**
 * Resolucion de etiquetas fiscales para el ticket/PDF de factura AFIP.
 * Extraidos de generarFacturaAfipPDF.ts (modularizacion, doc seccion 4).
 */
import { TipoCliente } from "./types";

export function getLetraComprobante(tipoComprobante: number): string {
  switch (tipoComprobante) {
    case 1:
      return "A";
    case 6:
      return "B";
    case 11:
      return "C";
    case 3:
      return "A";
    case 8:
      return "B";
    case 13:
      return "C";
    default:
      return "?";
  }
}

export function getReceiptType(tipoComprobante: number): string {
  switch (tipoComprobante) {
    case 1:
      return "FACTURA A";
    case 6:
      return "FACTURA B";
    case 11:
      return "FACTURA C";
    case 3:
      return "NOTA DE CRÉDITO A";
    case 8:
      return "NOTA DE CRÉDITO B";
    case 13:
      return "NOTA DE CRÉDITO C";
    default:
      return "COMPROBANTE";
  }
}

export function getCondicionIVAEmisor(tipoComprobante: number): string {
  if (
    tipoComprobante === 1 ||
    tipoComprobante === 6 ||
    tipoComprobante === 3 ||
    tipoComprobante === 8
  ) {
    return "IVA: RESPONSABLE INSCRIPTO";
  }

  return "IVA: RESPONSABLE MONOTRIBUTO";
}

export function getClienteLabel(tipoCliente?: TipoCliente): string {
  switch (tipoCliente) {
    case "Mayorista":
      return "CLIENTE MAYORISTA";
    case "Cliente":
      return "CLIENTE";
    case "Consumidor Final":
    default:
      return "CONSUMIDOR FINAL";
  }
}

export function getCondicionIVAReceptorLabel(
  tipoComprobante: number,
  tipoCliente?: TipoCliente
) {
  if (tipoComprobante === 11 || tipoComprobante === 13) {
    return "CONDICIÓN IVA RECEPTOR: CONSUMIDOR FINAL";
  }

  if (tipoCliente === "Mayorista" || tipoCliente === "Cliente") {
    return "CONDICIÓN IVA RECEPTOR: RESPONSABLE INSCRIPTO / SEGÚN PADRÓN";
  }

  return "CONDICIÓN IVA RECEPTOR: CONSUMIDOR FINAL";
}
