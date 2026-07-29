/**
 * Emision de nota de credito WSFE legacy.
 * Extraido de wsfe.service.ts (doc seccion 4.3 - modularizacion).
 */
import axios from "axios";
import xml2js from "xml2js";
import prisma from "../../prisma";
import { getValidToken } from "../wsaa.service";
import { cbteCounterService } from "../cbteCounter.service";
import { generarQR } from "../qrAfip.service";
import { afipFechaAR } from "../utils/fecha";
import { WSFE_URL, pickCbteResult } from "./wsfe.helpers";
import { currentTenantId } from "../../context/tenantContext";
import { tenantScope } from "../../utils/tenantScope";

export async function emitirNotaCreditoAFIP({
  saleId,
  facturaOriginalId,
  motivo = "Devolución o anulación",
  importe,
}: {
  saleId: string;
  facturaOriginalId: string;
  motivo?: string;
  importe: number;
}) {
  console.log("🧾 Enviando solicitud de Nota de Crédito a AFIP...");

  // 1) Buscar la factura original
  const facturaOriginal = await prisma.invoiceAfip.findFirst({
    where: { id: facturaOriginalId, ...tenantScope() },
  });
  if (!facturaOriginal) throw new Error("Factura original no encontrada");

  // 2) Determinar tipo de comprobante de la NC
  let tipoComprobanteNC = 13; // NC C
  if (facturaOriginal.tipoComprobante === 1) tipoComprobanteNC = 3; // NC A
  if (facturaOriginal.tipoComprobante === 6) tipoComprobanteNC = 8; // NC B

  const cuit = facturaOriginal.cuit;
  const puntoVenta = facturaOriginal.puntoVenta; // 👈 importante
  const tipoDoc = facturaOriginal.tipoDoc;
  const nroDoc = Number(facturaOriginal.nroDoc);
  const condicionIVAReceptor = facturaOriginal.condicionIVAReceptor;

  // ✅ 3) Obtener número siguiente SIN incrementar contador
  const siguiente = await cbteCounterService.peekNext(puntoVenta, tipoComprobanteNC);

  // 4) Token/sign
  const { token, sign } = await getValidToken();

  // 5) Calcular neto e IVA
  let neto = importe;
  let iva21 = 0;
  if (tipoComprobanteNC !== 13) {
    neto = +(importe / 1.21).toFixed(2);
    iva21 = +(importe - neto).toFixed(2);
  }

  const fecha = afipFechaAR();

  // 6) XML (PtoVta dinámico, no hardcode 7)
  const soapEnvelope = `
  <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
    <soapenv:Header/>
    <soapenv:Body>
      <ar:FECAESolicitar>
        <ar:Auth>
          <ar:Token>${token}</ar:Token>
          <ar:Sign>${sign}</ar:Sign>
          <ar:Cuit>${cuit}</ar:Cuit>
        </ar:Auth>
        <ar:FeCAEReq>
          <ar:FeCabReq>
            <ar:CantReg>1</ar:CantReg>
            <ar:PtoVta>${puntoVenta}</ar:PtoVta>
            <ar:CbteTipo>${tipoComprobanteNC}</ar:CbteTipo>
          </ar:FeCabReq>
          <ar:FeDetReq>
            <ar:FECAEDetRequest>
              <ar:Concepto>1</ar:Concepto>
              <ar:DocTipo>${tipoDoc}</ar:DocTipo>
              <ar:DocNro>${nroDoc}</ar:DocNro>
              <ar:CbteDesde>${siguiente}</ar:CbteDesde>
              <ar:CbteHasta>${siguiente}</ar:CbteHasta>
              <ar:CbteFch>${fecha}</ar:CbteFch>

              <ar:CbtesAsoc>
                <ar:CbteAsoc>
                  <ar:Tipo>${facturaOriginal.tipoComprobante}</ar:Tipo>
                  <ar:PtoVta>${facturaOriginal.puntoVenta}</ar:PtoVta>
                  <ar:Nro>${facturaOriginal.numero}</ar:Nro>
                </ar:CbteAsoc>
              </ar:CbtesAsoc>

              <ar:ImpTotal>${importe.toFixed(2)}</ar:ImpTotal>
              <ar:ImpTotConc>0.00</ar:ImpTotConc>
              <ar:ImpNeto>${neto.toFixed(2)}</ar:ImpNeto>
              <ar:ImpOpEx>0.00</ar:ImpOpEx>
              <ar:ImpTrib>0.00</ar:ImpTrib>
              <ar:ImpIVA>${iva21.toFixed(2)}</ar:ImpIVA>
              <ar:MonId>PES</ar:MonId>
              <ar:MonCotiz>1.00</ar:MonCotiz>
              ${
                tipoComprobanteNC !== 13
                  ? `
              <ar:Iva>
                <ar:AlicIva>
                  <ar:Id>5</ar:Id>
                  <ar:BaseImp>${neto.toFixed(2)}</ar:BaseImp>
                  <ar:Importe>${iva21.toFixed(2)}</ar:Importe>
                </ar:AlicIva>
              </ar:Iva>`
                  : ""
              }
            </ar:FECAEDetRequest>
          </ar:FeDetReq>
        </ar:FeCAEReq>
      </ar:FECAESolicitar>
    </soapenv:Body>
  </soapenv:Envelope>`;

  // 7) Enviar a AFIP
  const { data } = await axios.post(WSFE_URL, soapEnvelope, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "http://ar.gov.afip.dif.FEV1/FECAESolicitar",
    },
    timeout: 15000,
  });

  // 8) Parse
  const parsed = await xml2js.parseStringPromise(data, { explicitArray: false });
  const body = parsed?.["soap:Envelope"]?.["soap:Body"];
  if (!body) throw new Error("Respuesta SOAP inválida (sin Body)");
  if (body["soap:Fault"]) throw new Error(`Error SOAP: ${body["soap:Fault"].faultstring}`);

  const result = body["FECAESolicitarResponse"]?.["FECAESolicitarResult"];
  // ================== DEBUG AFIP ==================
  console.log("🧾 AFIP RESULT RAW:", JSON.stringify(result, null, 2));

  // ❌ Errores generales
  const afipErrorsRaw = result?.Errors?.Err;
  const afipErrors = afipErrorsRaw
    ? Array.isArray(afipErrorsRaw)
      ? afipErrorsRaw
      : [afipErrorsRaw]
    : [];

  if (afipErrors.length > 0) {
    console.error("🧨 AFIP ERRORS:");
    afipErrors.forEach((e: any) => {
      console.error(`  ❌ Code ${e.Code}: ${e.Msg}`);
    });
  }

  // ⚠️ Observaciones por comprobante
  const obsRaw =
    result?.FeDetResp?.FECAEDetResponse?.Observaciones?.Obs;

  const observaciones = obsRaw
    ? Array.isArray(obsRaw)
      ? obsRaw
      : [obsRaw]
    : [];

  if (observaciones.length > 0) {
    console.warn("👀 AFIP OBSERVACIONES:");
    observaciones.forEach((o: any) => {
      console.warn(`  ⚠️ Code ${o.Code}: ${o.Msg}`);
    });
  }

  // Resultado final
  const det = result?.FeDetResp?.FECAEDetResponse;
  console.log("📄 AFIP DET RESPONSE:", det);
  // =================================================
  if (!result) throw new Error("No se encontró FECAESolicitarResult");

  const { cae, vto, resultado } = pickCbteResult(result);
  console.log(`✅ Nota de Crédito AFIP (${resultado ?? "?"}) - CAE: ${cae || "N/A"}`);

  // 9) QR (solo con CAE)
  const qr = cae
    ? await generarQR({
        fecha,
        cuit,
        puntoVenta,
        tipoComprobante: tipoComprobanteNC,
        numero: siguiente,
        total: importe,
        tipoDoc,
        nroDoc,
        cae,
      })
    : { urlQR: null, qrDataURL: null };

  // 10) Guardar nota de crédito (aunque esté rechazada, para auditoría)
  const notaCredito = await prisma.invoiceAfip.create({
    data: {
      saleId,
      relatedInvoiceId: facturaOriginalId,
      tenantId: currentTenantId(),
      cuit,
      puntoVenta,
      tipoComprobante: tipoComprobanteNC,
      tipoDoc,
      nroDoc: BigInt(nroDoc),
      numero: siguiente,
      fechaEmision: new Date(),
      resultado: resultado ?? "R",
      cae,
      caeVto: vto
        ? new Date(`${String(vto).slice(0, 4)}-${String(vto).slice(4, 6)}-${String(vto).slice(6, 8)}T12:00:00.000-03:00`)
        : null,
      total: importe,
      neto,
      iva: iva21,
      condicionIVAReceptor,
      urlQR: qr.urlQR,
      qrBase64: qr.qrDataURL,
    },
  });

  // ✅ 11) SOLO si AFIP aprobó: confirmar contador y marcar NC emitida
  if (resultado === "A" && cae) {
    await cbteCounterService.commitUsed(puntoVenta, tipoComprobanteNC, siguiente);

    await prisma.sale.update({
      where: { id: saleId },
      data: { isNoteCredit: true },
    });

    console.log("💾 Nota de crédito APROBADA. Contador confirmado y sale actualizada:", notaCredito.id);
  } else {
    console.warn("⚠️ Nota de crédito NO aprobada. NO se actualiza contador ni isNoteCredit.", {
      saleId,
      puntoVenta,
      tipoComprobanteNC,
      numero: siguiente,
      resultado,
    });
  }

  return notaCredito;
}
