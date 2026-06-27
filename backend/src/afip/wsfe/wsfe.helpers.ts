/**
 * Helpers compartidos del WSFE legacy (hardcodeado a produccion/PtoVta 7).
 * Extraidos de wsfe.service.ts (doc seccion 4.3 - modularizacion).
 *
 * Nota: este modulo coexiste con wsfe-base.service.ts (la version configurable
 * por ArcaConfig). No se unifican aca para no tocar logica de facturacion AFIP
 * sin pruebas en homologacion (ver CAMBIOS_AUDITORIA.md seccion 7).
 */
import axios from "axios";
import fs from "fs";

export const WSFE_URL = "https://servicios1.afip.gov.ar/wsfev1/service.asmx";
export const PTO_VTA_REAL = 7;

export function pickCbteResult(result: any) {
  const det = result?.FeDetResp?.FECAEDetResponse;
  const cab = result?.FeCabResp;
  return {
    det,
    cae: det?.CAE ?? null,
    vto: det?.CAEFchVto ?? null,
    resultado: det?.Resultado ?? cab?.Resultado ?? null,
  };
}

export const toArray = (x: any) => (x ? (Array.isArray(x) ? x : [x]) : []);

export function printAfipList(title: string, list: any[]) {
  if (!list?.length) return;
  console.log(`\n================ ${title} (${list.length}) ================`);
  list.forEach((e, i) => {
    const code = e?.Code ?? "N/A";
    const msg = e?.Msg ?? JSON.stringify(e);
    console.log(`${i + 1}. [${code}] ${msg}`);
  });
}

export function logAfipFull(result: any) {
  console.log("🧾 AFIP RESULT RAW:", JSON.stringify(result, null, 2));

  const generalErrors = toArray(result?.Errors?.Err);
  const events = toArray(result?.Events?.Evt);

  const detResp = result?.FeDetResp?.FECAEDetResponse;
  const detErrors = toArray(detResp?.Errors?.Err);
  const detObs = toArray(detResp?.Observaciones?.Obs);

  printAfipList("AFIP ERRORES GENERALES", generalErrors);
  printAfipList("AFIP EVENTS", events);
  printAfipList("AFIP ERRORES POR DETALLE", detErrors);
  printAfipList("AFIP OBSERVACIONES", detObs);

  console.log("\n📌 AFIP CAB:", result?.FeCabResp);
  console.log("📌 AFIP DET:", detResp);

  // Si querés que “explote” y te devuelva todos los mensajes juntos:
  const allMsgs = [
    ...generalErrors.map((e: any) => `[${e.Code}] ${e.Msg}`),
    ...events.map((e: any) => `[${e.Code}] ${e.Msg}`),
    ...detErrors.map((e: any) => `[${e.Code}] ${e.Msg}`),
    ...detObs.map((e: any) => `[${e.Code}] ${e.Msg}`),
  ];

  return allMsgs;
}

export async function enviarAImpresion(pdfPath: string, facturaData: any) {
  const localPOS = process.env.POS_LOCAL_URL; // Ej: http://192.168.0.50:3002 o https://pos-local.ngrok-free.app

  if (!localPOS) {
    console.warn("⚠️ POS_LOCAL_URL no configurado. No se enviará a impresión.");
    return;
  }

  try {
    const pdfBuffer = await fs.promises.readFile(pdfPath);
    console.log("📦 Enviando PDF directamente al POS local...");

    await axios.post(`${localPOS}/print`, {
      pdfBase64: pdfBuffer.toString("base64"),
      factura: facturaData,
    });

    console.log("🖨️ Enviada orden de impresión con PDF embebido.");
  } catch (err: any) {
    console.error("❌ Error al enviar a impresión:", err?.message || err);
  }
}
