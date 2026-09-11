import { emitirFacturaAFIPBase } from "./wsfe-base.service";

export async function emitirFacturaA({
  saleId,
  cuit,
  arcaConfigId,
  nroDoc,
  importe,
  condicionIVAReceptor = 1,
}: {
  saleId: string;
  cuit?: string;
  arcaConfigId?: string;
  nroDoc: number;
  importe: number;
  condicionIVAReceptor?: number;
}) {
  return emitirFacturaAFIPBase({
    saleId,
    cuit,
    arcaConfigId,
    tipoComprobante: 1,
    tipoDoc: 80,
    nroDoc,
    importe,
    condicionIVAReceptor,
  });
}
