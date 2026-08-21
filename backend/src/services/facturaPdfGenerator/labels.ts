/**
 * Resolucion de etiquetas/labels fiscales (letra de comprobante, condicion IVA, datos de empresa).
 * Extraidos de facturaPdfGenerator.service.ts (modularizacion, doc seccion 4).
 */
import { FacturaPDFData, TipoCliente } from "./types";

export function getEmpresa(data: FacturaPDFData) {
  return {
    name: data.empresa?.name || process.env.BUSINESS_NAME || "Mi Negocio",
    subtitle:
      data.empresa?.subtitle ||
      process.env.BUSINESS_SUBTITLE ||
      "ComarPOS",
    cuit: data.empresa?.cuit || process.env.BUSINESS_CUIT || data.factura.cuit,
    address:
      data.empresa?.address ||
      process.env.BUSINESS_ADDRESS ||
      "",
    phone:
      data.empresa?.phone ||
      process.env.BUSINESS_PHONE ||
      "",
    ivaCondition:
      data.empresa?.ivaCondition ||
      process.env.BUSINESS_IVA_CONDITION ||
      undefined,
  };
}

export function getLetraComprobante(tipoComprobante: number): string {
  switch (tipoComprobante) {
    case 1:
    case 3:
      return "A";
    case 6:
    case 8:
      return "B";
    case 11:
    case 13:
      return "C";
    default:
      return "?";
  }
}

export function getTipoComprobanteLabel(tipoComprobante: number): string {
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

export function getCondicionIVAEmisor(tipoComprobante: number, custom?: string): string {
  if (custom) return custom;

  if ([1, 3, 6, 8].includes(tipoComprobante)) {
    return "IVA RESPONSABLE INSCRIPTO";
  }

  return "IVA RESPONSABLE MONOTRIBUTO";
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

export function getCondicionIVAReceptorLabel(condicionIVAReceptor?: number | null) {
  switch (Number(condicionIVAReceptor)) {
    case 1:
      return "IVA RESPONSABLE INSCRIPTO";
    case 4:
      return "IVA SUJETO EXENTO";
    case 5:
      return "CONSUMIDOR FINAL";
    case 6:
      return "RESPONSABLE MONOTRIBUTO";
    case 7:
      return "SUJETO NO CATEGORIZADO";
    case 8:
      return "PROVEEDOR DEL EXTERIOR";
    case 9:
      return "CLIENTE DEL EXTERIOR";
    case 10:
      return "IVA LIBERADO - LEY 19.640";
    case 13:
      return "MONOTRIBUTISTA SOCIAL";
    case 15:
      return "IVA NO ALCANZADO";
    case 16:
      return "MONOTRIBUTO TRABAJADOR INDEPENDIENTE PROMOVIDO";
    default:
      return "CONSUMIDOR FINAL";
  }
}
