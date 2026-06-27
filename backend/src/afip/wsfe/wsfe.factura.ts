/**
 * Emision de factura WSFE legacy (hardcodeado a produccion/PtoVta 7).
 * Extraido de wsfe.service.ts (doc seccion 4.3 - modularizacion).
 */
import axios from "axios";
import xml2js from "xml2js";
import prisma from "../../prisma";
import { getValidToken } from "../wsaa.service";
import { cbteCounterService } from "../cbteCounter.service";
import { generarQR } from "../qrAfip.service";
import { afipFechaAR } from "../utils/fecha";
import { WSFE_URL, PTO_VTA_REAL, pickCbteResult, toArray, logAfipFull } from "./wsfe.helpers";
import { currentTenantId } from "../../context/tenantContext";
import { tenantScope } from "../../utils/tenantScope";

export async function obtenerUltimoComprobanteAFIP({
  cuit,
  puntoVenta,
  tipoComprobante,
}: {
  cuit: string;
  puntoVenta: number;
  tipoComprobante: number;
}): Promise<number> {
  const { token, sign } = await getValidToken();

  const soapEnvelope = `
  <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
    <soapenv:Header/>
    <soapenv:Body>
      <ar:FECompUltimoAutorizado>
        <ar:Auth>
          <ar:Token>${token}</ar:Token>
          <ar:Sign>${sign}</ar:Sign>
          <ar:Cuit>${cuit}</ar:Cuit>
        </ar:Auth>
        <ar:PtoVta>${puntoVenta}</ar:PtoVta>
        <ar:CbteTipo>${tipoComprobante}</ar:CbteTipo>
      </ar:FECompUltimoAutorizado>
    </soapenv:Body>
  </soapenv:Envelope>`;

  const { data } = await axios.post(WSFE_URL, soapEnvelope, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado",
    },
    timeout: 15000,
  });

  const parsed = await xml2js.parseStringPromise(data, { explicitArray: false });
  const body = parsed?.["soap:Envelope"]?.["soap:Body"];
  if (!body) throw new Error("Respuesta SOAP inválida (sin Body)");

  if (body["soap:Fault"]) {
    throw new Error(`SOAP Fault: ${body["soap:Fault"]?.faultstring || "sin faultstring"}`);
  }

  const result =
    body["FECompUltimoAutorizadoResponse"]?.["FECompUltimoAutorizadoResult"];

  if (!result) throw new Error("No se encontró FECompUltimoAutorizadoResult");

  console.log("🧾 AFIP FECompUltimoAutorizado RAW:", JSON.stringify(result, null, 2));

  const errs = toArray(result?.Errors?.Err);
  if (errs.length) {
    console.error("🧨 AFIP ERRORS (FECompUltimoAutorizado):");
    errs.forEach((e: any) => console.error(`  ❌ [${e.Code}] ${e.Msg}`));
    throw new Error(errs.map((e: any) => `[${e.Code}] ${e.Msg}`).join(" | "));
  }

  const cbteNro = Number(result?.CbteNro ?? 0);
  console.log(`📄 Último comprobante autorizado (AFIP): ${cbteNro}`);
  return cbteNro;
}

export async function emitirFacturaAFIP({
  saleId,
  cuit,
  // lo dejamos para no romper llamadas existentes, pero NO lo usamos
  puntoVenta: _puntoVenta,
  tipoComprobante,
  tipoDoc,
  nroDoc,
  importe,
  condicionIVAReceptor = 5,
}: {
  saleId: string;
  cuit: string;
  puntoVenta: number;
  tipoComprobante: number;
  tipoDoc: number;
  nroDoc: number;
  importe: number;
  condicionIVAReceptor?: number;
}) {
  const puntoVenta = PTO_VTA_REAL;

  console.log("🧾 Enviando solicitud de factura a AFIP (producción)...", {
    saleId,
    puntoVenta,
    tipoComprobante,
    tipoDoc,
    nroDoc,
    importe,
  });

  // 🚫 Verifica si la venta ya fue facturada
  const existing = await prisma.sale.findFirst({
    where: { id: saleId, ...tenantScope() },
    select: { isInvoiced: true },
  });
  if (!existing) throw new Error("Venta no encontrada");
  if (existing.isInvoiced) throw new Error("⚠️ Esta venta ya fue facturada y no puede repetirse");

  // ✅ 1) SIEMPRE tomar el número desde AFIP para evitar 10016
  const ultimoAfip = await obtenerUltimoComprobanteAFIP({
    cuit,
    puntoVenta,
    tipoComprobante,
  });
  const siguiente = ultimoAfip + 1;

  // ✅ 1b) Sync contador local si quedó atrás (evita que tu cbteCounter te vuelva a dar números viejos)
  try {
    // Si tu servicio no tiene esto, no rompe nada (por eso el try)
    await cbteCounterService.commitUsed(puntoVenta, tipoComprobante, ultimoAfip);
  } catch (e) {
    console.warn("⚠️ No pude sincronizar cbteCounterService con AFIP (no es crítico):", (e as any)?.message || e);
  }

  // 2) Token/sign
  const { token, sign } = await getValidToken();

  // 3) Importes
  let neto = importe;
  let iva21 = 0;
  if (tipoComprobante !== 11) {
    neto = +(importe / 1.21).toFixed(2);
    iva21 = +(importe - neto).toFixed(2);
  }

  const fecha = afipFechaAR();

  // 4) XML
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
            <ar:CbteTipo>${tipoComprobante}</ar:CbteTipo>
          </ar:FeCabReq>
          <ar:FeDetReq>
            <ar:FECAEDetRequest>
              <ar:Concepto>1</ar:Concepto>
              <ar:DocTipo>${tipoDoc}</ar:DocTipo>
              <ar:DocNro>${nroDoc}</ar:DocNro>
              <ar:CbteDesde>${siguiente}</ar:CbteDesde>
              <ar:CbteHasta>${siguiente}</ar:CbteHasta>
              <ar:CbteFch>${fecha}</ar:CbteFch>
              <ar:ImpTotal>${importe.toFixed(2)}</ar:ImpTotal>
              <ar:ImpTotConc>0.00</ar:ImpTotConc>
              <ar:ImpNeto>${neto.toFixed(2)}</ar:ImpNeto>
              <ar:ImpOpEx>0.00</ar:ImpOpEx>
              <ar:ImpTrib>0.00</ar:ImpTrib>
              <ar:ImpIVA>${iva21.toFixed(2)}</ar:ImpIVA>
              <ar:MonId>PES</ar:MonId>
              <ar:MonCotiz>1.00</ar:MonCotiz>
              ${
                tipoComprobante !== 11
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

  // 5) Enviar
  const { data } = await axios.post(WSFE_URL, soapEnvelope, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "http://ar.gov.afip.dif.FEV1/FECAESolicitar",
    },
    timeout: 15000,
  });

  // 6) Parse
  const parsed = await xml2js.parseStringPromise(data, { explicitArray: false });
  const soapBody = parsed?.["soap:Envelope"]?.["soap:Body"];
  if (!soapBody) throw new Error("Respuesta SOAP inválida (sin Body)");

  if (soapBody["soap:Fault"]) {
    throw new Error(`Error SOAP: ${soapBody["soap:Fault"]?.faultstring || "sin faultstring"}`);
  }

  const result = soapBody["FECAESolicitarResponse"]?.["FECAESolicitarResult"];
  if (!result) throw new Error("No se encontró FECAESolicitarResult");

  // ✅ LOG FULL AFIP (TODOS los errores/obs/eventos)
  const allAfipMessages = logAfipFull(result);

  const { cae, vto, resultado } = pickCbteResult(result);
  console.log(`✅ Resultado AFIP: ${resultado ?? "?"} ${cae ? `- CAE ${cae}` : ""}`);

  // Si vino rechazado y AFIP mandó mensajes, los dejamos en sale.afipLastError si querés
  if (resultado !== "A") {
    try {
      await prisma.sale.update({
        where: { id: saleId },
        data: {
          invoiceStatus: "ERROR",
          afipLastError: allAfipMessages?.slice(0, 1800)?.join(" | ") || "Rechazado por AFIP",
        },
      });
    } catch {}
  }

  // 7) QR (solo si hay CAE)
  const qr = cae
    ? await generarQR({
        fecha,
        cuit,
        puntoVenta,
        tipoComprobante,
        numero: siguiente,
        total: importe,
        tipoDoc,
        nroDoc,
        cae,
      })
    : { urlQR: null, qrDataURL: null };

  // 8) Guardar en DB (sin mover schema)
  console.log("🧾 Intento DB save:", {
    saleId,
    puntoVenta,
    tipoComprobante,
    numero: siguiente,
    resultado,
    cae,
  });

  // 8a) Si ya existe factura por esta venta => update
  const existingBySale = await prisma.invoiceAfip.findUnique({
    where: { saleId }, // saleId es @unique (nullable)
  });

  let factura;

  if (existingBySale) {
    factura = await prisma.invoiceAfip.update({
      where: { id: existingBySale.id },
      data: {
        cuit,
        puntoVenta,
        tipoComprobante,
        tipoDoc,
        nroDoc: BigInt(nroDoc),
        numero: siguiente,
        fechaEmision: new Date(),
        resultado: resultado ?? "R",
        cae,
        caeVto: vto
          ? new Date(
              `${String(vto).slice(0, 4)}-${String(vto).slice(4, 6)}-${String(vto).slice(6, 8)}`
            )
          : null,
        total: importe,
        neto,
        iva: iva21,
        condicionIVAReceptor,
        urlQR: qr.urlQR,
        qrBase64: qr.qrDataURL,
      },
    });
  } else {
    // 8b) Si no existe por saleId, puede existir por cbte (puntoVenta+tipoComprobante+numero)
    const existingByCbte = await prisma.invoiceAfip.findFirst({
      where: {
        puntoVenta,
        tipoComprobante,
        numero: siguiente,
        tenantId: currentTenantId(),
      },
    });

    if (existingByCbte) {
      // Si ya está ligado a otra venta => conflicto real, no lo pises
      if (existingByCbte.saleId && existingByCbte.saleId !== saleId) {
        throw new Error(
          `⚠️ Conflicto: el comprobante ${puntoVenta}/${tipoComprobante}/${siguiente} ya está asociado a otra venta (${existingByCbte.saleId}).`
        );
      }

      // Si estaba suelto (saleId null) o es el mismo, actualizás y lo vinculás
      factura = await prisma.invoiceAfip.update({
        where: { id: existingByCbte.id },
        data: {
          sale: { connect: { id: saleId } },
          cuit,
          tipoDoc,
          nroDoc: BigInt(nroDoc),
          fechaEmision: new Date(),
          resultado: resultado ?? "R",
          cae,
          caeVto: vto
            ? new Date(
                `${String(vto).slice(0, 4)}-${String(vto).slice(4, 6)}-${String(vto).slice(6, 8)}`
              )
            : null,
          total: importe,
          neto,
          iva: iva21,
          condicionIVAReceptor,
          urlQR: qr.urlQR,
          qrBase64: qr.qrDataURL,
        },
      });
    } else {
      // 8c) No existe de ninguna forma => create normal
      factura = await prisma.invoiceAfip.create({
        data: {
          saleId,
          tenantId: currentTenantId(),
          cuit,
          puntoVenta,
          tipoComprobante,
          tipoDoc,
          nroDoc: BigInt(nroDoc),
          numero: siguiente,
          fechaEmision: new Date(),
          resultado: resultado ?? "R",
          cae,
          caeVto: vto
            ? new Date(
                `${String(vto).slice(0, 4)}-${String(vto).slice(4, 6)}-${String(vto).slice(6, 8)}`
              )
            : null,
          total: importe,
          neto,
          iva: iva21,
          condicionIVAReceptor,
          urlQR: qr.urlQR,
          qrBase64: qr.qrDataURL,
        },
      });
    }
  }

  // 9) SOLO si aprobó: marcar facturada + confirmar contador
  if (resultado === "A" && cae) {
    await cbteCounterService.commitUsed(puntoVenta, tipoComprobante, siguiente);

    await prisma.sale.update({
      where: { id: saleId },
      data: { isInvoiced: true, invoiceStatus: "INVOICED" },
    });

    console.log("💾 Factura APROBADA. Contador confirmado y venta facturada:", factura.id);
  } else {
    console.warn("⚠️ Factura NO aprobada. NO se actualiza contador ni isInvoiced.", {
      saleId,
      puntoVenta,
      tipoComprobante,
      numero: siguiente,
      resultado,
      mensajes: allAfipMessages,
    });
  }

  return factura;
}
