import { emitirFacturaAFIPBase } from "./wsfe-base.service";

export async function emitirFacturaCConsumidorFinal({
  saleId,
  cuit,
  arcaConfigId,
  importe,
}: {
  saleId: string;
  cuit?: string;
  arcaConfigId?: string;
  importe: number;
}) {
  return emitirFacturaAFIPBase({
    saleId,
    cuit,
    arcaConfigId,
    tipoComprobante: 11,
    tipoDoc: 99,
    nroDoc: 0,
    importe,
    condicionIVAReceptor: 5,
  });
}

export async function emitirFacturaCACliente({
  saleId,
  cuit,
  arcaConfigId,
  tipoDoc,
  nroDoc,
  importe,
  condicionIVAReceptor = 5,
}: {
  saleId: string;
  cuit?: string;
  arcaConfigId?: string;
  tipoDoc: number;
  nroDoc: number;
  importe: number;
  condicionIVAReceptor?: number;
}) {
  return emitirFacturaAFIPBase({
    saleId,
    cuit,
    arcaConfigId,
    tipoComprobante: 11,
    tipoDoc,
    nroDoc,
    importe,
    condicionIVAReceptor,
  });
}
