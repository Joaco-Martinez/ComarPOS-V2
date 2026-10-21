import axios from "axios";
import https from "https";
import crypto from "crypto";
import xml2js from "xml2js";
import prisma from "../prisma";
import { getValidToken } from "./wsaa.service";
import { cbteCounterService } from "./cbteCounter.service";
import { generarQR } from "./qrAfip.service";
import { afipFechaAR } from "./utils/fecha";
import { calcularIvaPorAlicuota, ivaXml, type IvaAlicuota, type IvaDesglose } from "./utils/ivaAlicuotas";
import { arcaConfigService } from "../services/arcaConfig.service";
import { currentTenantId } from "../context/tenantContext";
import { tenantScope } from "../utils/tenantScope";

function getWsfeUrl(environment: "HOMOLOGACION" | "PRODUCCION") {
  return environment === "HOMOLOGACION"
    ? process.env.ARCA_WSFE_HOMO_URL ||
        "https://wswhomo.afip.gov.ar/wsfev1/service.asmx"
    : process.env.ARCA_WSFE_PROD_URL ||
        "https://servicios1.afip.gov.ar/wsfev1/service.asmx";
}

/**
 * AFIP / ARCA usa servicios SOAP viejos.
 * En algunas versiones modernas de Node/OpenSSL puede fallar con:
 * "dh key too small".
 *
 * Este agent baja el security level SOLO para la conexión contra WSFE.
 */
const arcaHttpsAgent = new https.Agent({
  keepAlive: true,
  rejectUnauthorized: true,
  ciphers: "DEFAULT@SECLEVEL=0",
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
});

// Tipos de comprobante C (no discriminan IVA): Factura C y Nota de Credito C.
const TIPOS_SIN_IVA = [11, 13];

type EmitirFacturaBaseParams = {
  saleId: string;
  // Que ArcaConfig (dueno/CUIT) usar para firmar/emitir -- si no viene, cae
  // al comportamiento historico (config unica/activa del tenant). El CUIT
  // emisor SIEMPRE es el de esa config (el del certificado), nunca uno que
  // mande el cliente.
  arcaConfigId?: string;
  tipoComprobante: number;
  tipoDoc: number;
  nroDoc: number;
  condicionIVAReceptor?: number;
  puntoVenta?: number;
};

type ArcaConfigWithPoints = {
  id: string;
  cuit: string;
  environment: "HOMOLOGACION" | "PRODUCCION";
  pointsOfSale: {
    number: number;
    isDefault: boolean;
    enabled?: boolean;
  }[];
};

const toArray = (x: any) => {
  return x ? (Array.isArray(x) ? x : [x]) : [];
};

const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function resolvePuntoVenta(
  arcaConfig: ArcaConfigWithPoints,
  puntoVenta?: number
) {
  if (puntoVenta && Number.isFinite(Number(puntoVenta))) {
    return Number(puntoVenta);
  }

  const enabledPoints = arcaConfig.pointsOfSale.filter(
    (p) => p.enabled !== false
  );

  const defaultPoint =
    enabledPoints.find((p) => p.isDefault)?.number ||
    enabledPoints[0]?.number ||
    arcaConfig.pointsOfSale.find((p) => p.isDefault)?.number ||
    arcaConfig.pointsOfSale[0]?.number;

  if (!defaultPoint) {
    throw new Error("No hay punto de venta ARCA configurado.");
  }

  return defaultPoint;
}

function pickCbteResult(result: any) {
  const det = result?.FeDetResp?.FECAEDetResponse;
  const cab = result?.FeCabResp;

  return {
    det,
    cae: det?.CAE ?? null,
    vto: det?.CAEFchVto ?? null,
    resultado: det?.Resultado ?? cab?.Resultado ?? null,
  };
}

function printAfipList(title: string, list: any[]) {
  if (!list?.length) return;

  console.log(`\n================ ${title} (${list.length}) ================`);

  list.forEach((e, i) => {
    const code = e?.Code ?? "N/A";
    const msg = e?.Msg ?? JSON.stringify(e);
    console.log(`${i + 1}. [${code}] ${msg}`);
  });
}

function logAfipFull(result: any) {
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

  return [
    ...generalErrors.map((e: any) => `[${e.Code}] ${e.Msg}`),
    ...events.map((e: any) => `[${e.Code}] ${e.Msg}`),
    ...detErrors.map((e: any) => `[${e.Code}] ${e.Msg}`),
    ...detObs.map((e: any) => `[${e.Code}] ${e.Msg}`),
  ];
}

function parseSoapBody(parsed: any) {
  const envelope =
    parsed?.["soap:Envelope"] ||
    parsed?.["SOAP-ENV:Envelope"] ||
    parsed?.["soapenv:Envelope"] ||
    parsed?.["S:Envelope"];

  const body =
    envelope?.["soap:Body"] ||
    envelope?.["SOAP-ENV:Body"] ||
    envelope?.["soapenv:Body"] ||
    envelope?.["S:Body"];

  if (!body) {
    throw new Error("Respuesta SOAP inválida: no se encontró Body.");
  }

  const fault =
    body["soap:Fault"] ||
    body["SOAP-ENV:Fault"] ||
    body["soapenv:Fault"] ||
    body["S:Fault"];

  if (fault) {
    throw new Error(
      `SOAP Fault: ${
        fault?.faultstring || fault?.Reason?.Text || "sin faultstring"
      }`
    );
  }

  return body;
}

async function soapCall(wsfeUrl: string, action: string, envelope: string) {
  const { data } = await axios.post(wsfeUrl, envelope, {
    httpsAgent: arcaHttpsAgent,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `http://ar.gov.afip.dif.FEV1/${action}`,
    },
    timeout: 30000,
  });

  const parsed = await xml2js.parseStringPromise(data, { explicitArray: false });
  const body = parseSoapBody(parsed);
  const result =
    body[`${action}Response`]?.[`${action}Result`] ||
    body[`ns1:${action}Response`]?.[`${action}Result`];

  if (!result) {
    throw new Error(`No se encontró ${action}Result.`);
  }

  return result;
}

function parseCaeVto(vto: string | null) {
  if (!vto) return null;

  const value = String(vto);

  if (value.length !== 8) return null;

  return new Date(
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T12:00:00.000-03:00`
  );
}

function authXml(token: string, sign: string, cuit: string) {
  return `
        <ar:Auth>
          <ar:Token>${token}</ar:Token>
          <ar:Sign>${sign}</ar:Sign>
          <ar:Cuit>${cuit}</ar:Cuit>
        </ar:Auth>`;
}

/**
 * Concepto AFIP segun lo vendido: 1 = productos, 2 = servicios, 3 = ambos.
 * Los servicios (Product.isService: hoteleria, servicios tecnicos, etc.)
 * antes salian siempre como "productos".
 */
export function conceptoFromItems(items: { product?: { isService?: boolean | null } | null }[]): 1 | 2 | 3 {
  const flags = items.map((i) => Boolean(i.product?.isService));
  if (flags.length === 0 || flags.every((f) => !f)) return 1;
  if (flags.every((f) => f)) return 2;
  return 3;
}

// Concepto 2/3 exige el periodo del servicio y el vencimiento del pago: se
// informa el dia de emision (venta de mostrador, se paga en el acto).
function serviceDatesXml(concepto: number, fecha: string) {
  if (concepto === 1) return "";
  return `
              <ar:FchServDesde>${fecha}</ar:FchServDesde>
              <ar:FchServHasta>${fecha}</ar:FchServHasta>
              <ar:FchVtoPago>${fecha}</ar:FchVtoPago>`;
}

// El WSDL de WSFEv1 define FECAEDetRequest como una secuencia: el orden de
// los elementos importa (Imp* -> FchServ* -> Mon* -> CondicionIVAReceptorId
// -> CbtesAsoc -> Iva).
function importesXml(importe: number, desglose: IvaDesglose | null, concepto: number, fecha: string) {
  const neto = desglose ? desglose.neto : importe;
  const iva = desglose ? desglose.iva : 0;
  return `
              <ar:ImpTotal>${importe.toFixed(2)}</ar:ImpTotal>
              <ar:ImpTotConc>0.00</ar:ImpTotConc>
              <ar:ImpNeto>${neto.toFixed(2)}</ar:ImpNeto>
              <ar:ImpOpEx>0.00</ar:ImpOpEx>
              <ar:ImpTrib>0.00</ar:ImpTrib>
              <ar:ImpIVA>${iva.toFixed(2)}</ar:ImpIVA>${serviceDatesXml(concepto, fecha)}
              <ar:MonId>PES</ar:MonId>
              <ar:MonCotiz>1.00</ar:MonCotiz>`;
}

async function resolveArcaConfig(arcaConfigId?: string) {
  return arcaConfigId
    ? await arcaConfigService.getConfigById(arcaConfigId)
    : await arcaConfigService.getActive();
}

export async function obtenerUltimoComprobanteAFIPBase({
  arcaConfigId,
  puntoVenta,
  tipoComprobante,
}: {
  arcaConfigId?: string;
  puntoVenta?: number;
  tipoComprobante: number;
}): Promise<number> {
  const arcaConfig = await resolveArcaConfig(arcaConfigId);
  const puntoVentaFinal = resolvePuntoVenta(arcaConfig, puntoVenta);
  const wsfeUrl = getWsfeUrl(arcaConfig.environment);
  const { token, sign } = await getValidToken(arcaConfig.id);

  const result = await soapCall(
    wsfeUrl,
    "FECompUltimoAutorizado",
    `
  <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
    <soapenv:Header/>
    <soapenv:Body>
      <ar:FECompUltimoAutorizado>${authXml(token, sign, arcaConfig.cuit)}
        <ar:PtoVta>${puntoVentaFinal}</ar:PtoVta>
        <ar:CbteTipo>${tipoComprobante}</ar:CbteTipo>
      </ar:FECompUltimoAutorizado>
    </soapenv:Body>
  </soapenv:Envelope>`
  );

  const errs = toArray(result?.Errors?.Err);

  if (errs.length) {
    throw new Error(errs.map((e: any) => `[${e.Code}] ${e.Msg}`).join(" | "));
  }

  const cbteNro = Number(result?.CbteNro ?? 0);

  console.log(`📄 Último comprobante autorizado AFIP: ${cbteNro}`);

  return cbteNro;
}

/** FECompConsultar: datos de un comprobante ya autorizado (null si no existe). */
async function consultarComprobanteAFIP(params: {
  wsfeUrl: string;
  token: string;
  sign: string;
  cuit: string;
  puntoVenta: number;
  tipoComprobante: number;
  numero: number;
}) {
  const result = await soapCall(
    params.wsfeUrl,
    "FECompConsultar",
    `
  <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
    <soapenv:Header/>
    <soapenv:Body>
      <ar:FECompConsultar>${authXml(params.token, params.sign, params.cuit)}
        <ar:FeCompConsReq>
          <ar:CbteTipo>${params.tipoComprobante}</ar:CbteTipo>
          <ar:CbteNro>${params.numero}</ar:CbteNro>
          <ar:PtoVta>${params.puntoVenta}</ar:PtoVta>
        </ar:FeCompConsReq>
      </ar:FECompConsultar>
    </soapenv:Body>
  </soapenv:Envelope>`
  );

  if (toArray(result?.Errors?.Err).length) return null;
  return result?.ResultGet ?? null;
}

/**
 * Proteccion contra comprobantes duplicados: si una emision anterior llego a
 * AFIP pero la respuesta no volvio (timeout, corte), AFIP ya tiene ese numero
 * autorizado y nosotros no. Antes de pedir un CAE nuevo se mira el ultimo
 * comprobante de AFIP: si no lo tenemos registrado y coincide con lo que se
 * quiere emitir (documento, total, comprobante asociado en NC, fecha
 * reciente), es el nuestro y se recupera en vez de emitir otro.
 */
async function recuperarComprobantePerdido(params: {
  wsfeUrl: string;
  token: string;
  sign: string;
  cuit: string;
  puntoVenta: number;
  tipoComprobante: number;
  ultimoAfip: number;
  nroDoc: number;
  importe: number;
  cbteAsoc?: { tipo: number; puntoVenta: number; numero: number };
}) {
  if (params.ultimoAfip <= 0) return null;

  const known = await prisma.invoiceAfip.findFirst({
    where: {
      cuit: params.cuit,
      puntoVenta: params.puntoVenta,
      tipoComprobante: params.tipoComprobante,
      numero: params.ultimoAfip,
      resultado: "A",
    },
    select: { id: true },
  });
  if (known) return null;

  const cbte = await consultarComprobanteAFIP({ ...params, numero: params.ultimoAfip }).catch(() => null);
  if (!cbte || cbte.Resultado !== "A" || !cbte.CodAutorizacion) return null;

  const sameDoc = Number(cbte.DocNro ?? 0) === Number(params.nroDoc ?? 0);
  const sameTotal = Math.abs(Number(cbte.ImpTotal ?? 0) - params.importe) < 0.01;

  const fch = String(cbte.CbteFch ?? "");
  const cbteDate = fch.length === 8 ? new Date(`${fch.slice(0, 4)}-${fch.slice(4, 6)}-${fch.slice(6, 8)}T12:00:00-03:00`) : null;
  const recent = cbteDate ? Date.now() - cbteDate.getTime() < 10 * 24 * 60 * 60 * 1000 : false;

  let sameAsoc = true;
  if (params.cbteAsoc) {
    const asoc = toArray(cbte?.CbtesAsoc?.CbteAsoc);
    sameAsoc = asoc.some(
      (a: any) =>
        Number(a.Tipo) === params.cbteAsoc!.tipo &&
        Number(a.PtoVta) === params.cbteAsoc!.puntoVenta &&
        Number(a.Nro) === params.cbteAsoc!.numero
    );
  }

  if (!sameDoc || !sameTotal || !recent || !sameAsoc) return null;

  console.warn("♻️ Comprobante ya autorizado en AFIP sin registrar localmente: se recupera en vez de emitir otro", {
    puntoVenta: params.puntoVenta,
    tipoComprobante: params.tipoComprobante,
    numero: params.ultimoAfip,
  });

  return { numero: params.ultimoAfip, cae: String(cbte.CodAutorizacion), vto: cbte.FchVto ?? null, fecha: fch };
}

function desgloseForTipo(
  tipoComprobante: number,
  items: { subtotal: number; ivaRate?: number | null }[],
  importe: number
): IvaDesglose | null {
  if (TIPOS_SIN_IVA.includes(tipoComprobante)) return null;
  return calcularIvaPorAlicuota(items, importe);
}

/**
 * Emite una factura A/B/C para una venta. El importe y el desglose de IVA
 * salen SIEMPRE de la venta guardada (sale.total + items con su alicuota),
 * nunca de lo que mande el frontend.
 */
export async function emitirFacturaAFIPBase({
  saleId,
  arcaConfigId,
  tipoComprobante,
  tipoDoc,
  nroDoc,
  condicionIVAReceptor = 5,
  puntoVenta,
}: EmitirFacturaBaseParams) {
  const arcaConfig = await resolveArcaConfig(arcaConfigId);
  const cuitFinal = arcaConfig.cuit;
  const puntoVentaFinal = resolvePuntoVenta(arcaConfig, puntoVenta);
  const wsfeUrl = getWsfeUrl(arcaConfig.environment);

  const sale = await prisma.sale.findFirst({
    where: { id: saleId, ...tenantScope() },
    select: {
      isInvoiced: true,
      total: true,
      items: { select: { subtotal: true, ivaRate: true, product: { select: { isService: true } } } },
    },
  });

  if (!sale) {
    throw new Error("Venta no encontrada.");
  }

  if (sale.isInvoiced) {
    throw new Error("Esta venta ya fue facturada y no puede repetirse.");
  }

  const importe = round2(sale.total);
  if (!(importe > 0)) {
    throw new Error("La venta no tiene un total válido para facturar.");
  }

  const desglose = desgloseForTipo(tipoComprobante, sale.items, importe);
  const concepto = conceptoFromItems(sale.items);

  console.log("🧾 Emitiendo factura ARCA...", {
    saleId,
    cuit: cuitFinal,
    tipoComprobante,
    tipoDoc,
    nroDoc,
    importe,
    concepto,
    alicuotas: desglose?.alicuotas,
    condicionIVAReceptor,
    puntoVenta: puntoVentaFinal,
    environment: arcaConfig.environment,
  });

  const { token, sign } = await getValidToken(arcaConfig.id);

  const ultimoAfip = await obtenerUltimoComprobanteAFIPBase({
    arcaConfigId: arcaConfig.id,
    puntoVenta: puntoVentaFinal,
    tipoComprobante,
  });

  const recuperado = await recuperarComprobantePerdido({
    wsfeUrl,
    token,
    sign,
    cuit: cuitFinal,
    puntoVenta: puntoVentaFinal,
    tipoComprobante,
    ultimoAfip,
    nroDoc,
    importe,
  });

  let numero: number;
  let fecha: string;
  let cae: string | null;
  let vto: string | null;
  let resultado: string | null;
  let allAfipMessages: string[] = [];

  if (recuperado) {
    ({ numero, cae, vto, fecha } = recuperado);
    resultado = "A";
  } else {
    numero = ultimoAfip + 1;
    fecha = afipFechaAR();

    try {
      await cbteCounterService.commitUsed(puntoVentaFinal, tipoComprobante, ultimoAfip, arcaConfig.id);
    } catch (e: any) {
      console.warn("⚠️ No pude sincronizar contador local:", e?.message || e);
    }

    const result = await soapCall(
      wsfeUrl,
      "FECAESolicitar",
      `
  <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
    <soapenv:Header/>
    <soapenv:Body>
      <ar:FECAESolicitar>${authXml(token, sign, cuitFinal)}
        <ar:FeCAEReq>
          <ar:FeCabReq>
            <ar:CantReg>1</ar:CantReg>
            <ar:PtoVta>${puntoVentaFinal}</ar:PtoVta>
            <ar:CbteTipo>${tipoComprobante}</ar:CbteTipo>
          </ar:FeCabReq>
          <ar:FeDetReq>
            <ar:FECAEDetRequest>
              <ar:Concepto>${concepto}</ar:Concepto>
              <ar:DocTipo>${tipoDoc}</ar:DocTipo>
              <ar:DocNro>${nroDoc}</ar:DocNro>
              <ar:CbteDesde>${numero}</ar:CbteDesde>
              <ar:CbteHasta>${numero}</ar:CbteHasta>
              <ar:CbteFch>${fecha}</ar:CbteFch>${importesXml(importe, desglose, concepto, fecha)}
              <ar:CondicionIVAReceptorId>${condicionIVAReceptor}</ar:CondicionIVAReceptorId>${ivaXml(desglose?.alicuotas ?? [])}
            </ar:FECAEDetRequest>
          </ar:FeDetReq>
        </ar:FeCAEReq>
      </ar:FECAESolicitar>
    </soapenv:Body>
  </soapenv:Envelope>`
    );

    allAfipMessages = logAfipFull(result);
    ({ cae, vto, resultado } = pickCbteResult(result));
  }

  const qr = cae
    ? await generarQR({
        fecha,
        cuit: cuitFinal,
        puntoVenta: puntoVentaFinal,
        tipoComprobante,
        numero,
        total: importe,
        tipoDoc,
        nroDoc,
        cae,
      })
    : { urlQR: null, qrDataURL: null };

  const existingBySale = await prisma.invoiceAfip.findUnique({
    where: { saleId },
  });

  const invoiceData = {
    cuit: cuitFinal,
    arcaConfigId: arcaConfig.id,
    puntoVenta: puntoVentaFinal,
    tipoComprobante,
    tipoDoc,
    nroDoc: BigInt(nroDoc),
    numero,
    fechaEmision: new Date(),
    resultado: resultado ?? "R",
    cae,
    caeVto: parseCaeVto(vto),
    total: importe,
    neto: desglose ? desglose.neto : importe,
    iva: desglose ? desglose.iva : 0,
    ivaDetalle: (desglose?.alicuotas ?? undefined) as any,
    condicionIVAReceptor,
    urlQR: qr.urlQR,
    qrBase64: qr.qrDataURL,
  };

  const factura = existingBySale
    ? await prisma.invoiceAfip.update({ where: { id: existingBySale.id }, data: invoiceData })
    : await prisma.invoiceAfip.create({ data: { saleId, tenantId: currentTenantId(), ...invoiceData } });

  if (resultado === "A" && cae) {
    await cbteCounterService.commitUsed(puntoVentaFinal, tipoComprobante, numero, arcaConfig.id);

    await prisma.sale.update({
      where: { id: saleId },
      data: {
        isInvoiced: true,
        invoiceStatus: "INVOICED",
        afipLastError: null,
      },
    });

    console.log("✅ Factura aprobada AFIP:", { saleId, tipoComprobante, numero, cae });
  } else {
    await prisma.sale.update({
      where: { id: saleId },
      data: {
        invoiceStatus: "ERROR",
        afipLastError: allAfipMessages.slice(0, 1800).join(" | ") || "Rechazado por AFIP",
      },
    });

    console.warn("⚠️ Factura no aprobada por AFIP:", { saleId, tipoComprobante, numero, resultado });
  }

  return factura;
}

/** Nota de credito que corresponde a cada factura: A -> NC A, B -> NC B, C -> NC C. */
function tipoNotaCredito(tipoFactura: number) {
  if (tipoFactura === 1) return 3;
  if (tipoFactura === 6) return 8;
  return 13;
}

/**
 * Desglose de la NC: mismo reparto por alicuota que la factura original
 * (escalado si la NC es parcial). Facturas viejas sin ivaDetalle se
 * declararon todo al 21%, asi que la NC sigue ese mismo criterio.
 */
function desgloseNotaCredito(
  tipoNC: number,
  original: { total: number; ivaDetalle: unknown },
  importe: number
): IvaDesglose | null {
  if (TIPOS_SIN_IVA.includes(tipoNC)) return null;
  const detalle = Array.isArray(original.ivaDetalle) ? (original.ivaDetalle as IvaAlicuota[]) : null;
  const items = detalle?.length
    ? detalle.map((a) => ({ subtotal: a.baseImp + a.importe, ivaRate: a.rate }))
    : [{ subtotal: original.total, ivaRate: 21 }];
  return calcularIvaPorAlicuota(items, importe);
}

/**
 * Emite una Nota de Credito asociada a una factura. Usa la misma config
 * (dueno, certificado, punto de venta, ambiente) que la factura original y
 * el numero lo da AFIP (no un contador local). `saleId` es la venta
 * "espejo" de la NC (ver services/notaCredito.service.ts).
 */
export async function emitirNotaCreditoAFIPBase({
  saleId,
  facturaOriginalId,
  importe: importeRaw,
}: {
  saleId: string;
  facturaOriginalId: string;
  importe: number;
}) {
  const facturaOriginal = await prisma.invoiceAfip.findFirst({
    where: { id: facturaOriginalId, ...tenantScope() },
    include: { creditNotes: { select: { total: true, resultado: true, cae: true } } },
  });
  if (!facturaOriginal) throw new Error("Factura original no encontrada");
  if (facturaOriginal.resultado !== "A" || !facturaOriginal.cae) {
    throw new Error("La factura original no está aprobada por AFIP.");
  }

  const importe = round2(importeRaw);
  if (!(importe > 0)) throw new Error("El importe de la nota de crédito tiene que ser mayor a 0.");

  const yaAcreditado = facturaOriginal.creditNotes
    .filter((nc) => nc.resultado === "A" && nc.cae)
    .reduce((acc, nc) => acc + Number(nc.total || 0), 0);
  const disponible = round2(Number(facturaOriginal.total) - yaAcreditado);
  if (importe > disponible + 0.001) {
    throw new Error(
      `La nota de crédito ($${importe.toFixed(2)}) supera lo que queda por acreditar de la factura ($${disponible.toFixed(2)}).`
    );
  }

  const arcaConfig = await resolveArcaConfig(facturaOriginal.arcaConfigId ?? undefined);
  const cuit = facturaOriginal.cuit;
  const puntoVenta = facturaOriginal.puntoVenta;
  const wsfeUrl = getWsfeUrl(arcaConfig.environment);
  const tipoNC = tipoNotaCredito(facturaOriginal.tipoComprobante);
  const tipoDoc = facturaOriginal.tipoDoc;
  const nroDoc = Number(facturaOriginal.nroDoc);
  const condicionIVAReceptor = facturaOriginal.condicionIVAReceptor;

  const ncSale = await prisma.sale.findFirst({
    where: { id: saleId, ...tenantScope() },
    select: { items: { select: { product: { select: { isService: true } } } } },
  });
  const concepto = conceptoFromItems(ncSale?.items ?? []);
  const desglose = desgloseNotaCredito(tipoNC, facturaOriginal, importe);
  const cbteAsoc = { tipo: facturaOriginal.tipoComprobante, puntoVenta: facturaOriginal.puntoVenta, numero: facturaOriginal.numero };

  const { token, sign } = await getValidToken(arcaConfig.id);
  const ultimoAfip = await obtenerUltimoComprobanteAFIPBase({
    arcaConfigId: arcaConfig.id,
    puntoVenta,
    tipoComprobante: tipoNC,
  });

  const recuperado = await recuperarComprobantePerdido({
    wsfeUrl,
    token,
    sign,
    cuit,
    puntoVenta,
    tipoComprobante: tipoNC,
    ultimoAfip,
    nroDoc,
    importe,
    cbteAsoc,
  });

  let numero: number;
  let fecha: string;
  let cae: string | null;
  let vto: string | null;
  let resultado: string | null;

  if (recuperado) {
    ({ numero, cae, vto, fecha } = recuperado);
    resultado = "A";
  } else {
    numero = ultimoAfip + 1;
    fecha = afipFechaAR();

    const result = await soapCall(
      wsfeUrl,
      "FECAESolicitar",
      `
  <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
    <soapenv:Header/>
    <soapenv:Body>
      <ar:FECAESolicitar>${authXml(token, sign, cuit)}
        <ar:FeCAEReq>
          <ar:FeCabReq>
            <ar:CantReg>1</ar:CantReg>
            <ar:PtoVta>${puntoVenta}</ar:PtoVta>
            <ar:CbteTipo>${tipoNC}</ar:CbteTipo>
          </ar:FeCabReq>
          <ar:FeDetReq>
            <ar:FECAEDetRequest>
              <ar:Concepto>${concepto}</ar:Concepto>
              <ar:DocTipo>${tipoDoc}</ar:DocTipo>
              <ar:DocNro>${nroDoc}</ar:DocNro>
              <ar:CbteDesde>${numero}</ar:CbteDesde>
              <ar:CbteHasta>${numero}</ar:CbteHasta>
              <ar:CbteFch>${fecha}</ar:CbteFch>${importesXml(importe, desglose, concepto, fecha)}
              <ar:CondicionIVAReceptorId>${condicionIVAReceptor}</ar:CondicionIVAReceptorId>
              <ar:CbtesAsoc>
                <ar:CbteAsoc>
                  <ar:Tipo>${cbteAsoc.tipo}</ar:Tipo>
                  <ar:PtoVta>${cbteAsoc.puntoVenta}</ar:PtoVta>
                  <ar:Nro>${cbteAsoc.numero}</ar:Nro>
                </ar:CbteAsoc>
              </ar:CbtesAsoc>${ivaXml(desglose?.alicuotas ?? [])}
            </ar:FECAEDetRequest>
          </ar:FeDetReq>
        </ar:FeCAEReq>
      </ar:FECAESolicitar>
    </soapenv:Body>
  </soapenv:Envelope>`
    );

    logAfipFull(result);
    ({ cae, vto, resultado } = pickCbteResult(result));
  }

  console.log(`✅ Nota de Crédito AFIP (${resultado ?? "?"}) - CAE: ${cae || "N/A"}`);

  const qr = cae
    ? await generarQR({
        fecha,
        cuit,
        puntoVenta,
        tipoComprobante: tipoNC,
        numero,
        total: importe,
        tipoDoc,
        nroDoc,
        cae,
      })
    : { urlQR: null, qrDataURL: null };

  // Se guarda aunque este rechazada, para auditoria.
  const notaCredito = await prisma.invoiceAfip.create({
    data: {
      saleId,
      relatedInvoiceId: facturaOriginalId,
      tenantId: currentTenantId(),
      cuit,
      arcaConfigId: facturaOriginal.arcaConfigId ?? arcaConfig.id,
      puntoVenta,
      tipoComprobante: tipoNC,
      tipoDoc,
      nroDoc: BigInt(nroDoc),
      numero,
      fechaEmision: new Date(),
      resultado: resultado ?? "R",
      cae,
      caeVto: parseCaeVto(vto),
      total: importe,
      neto: desglose ? desglose.neto : importe,
      iva: desglose ? desglose.iva : 0,
      ivaDetalle: (desglose?.alicuotas ?? undefined) as any,
      condicionIVAReceptor,
      urlQR: qr.urlQR,
      qrBase64: qr.qrDataURL,
    },
  });

  if (resultado === "A" && cae) {
    await cbteCounterService.commitUsed(puntoVenta, tipoNC, numero, facturaOriginal.arcaConfigId ?? arcaConfig.id);
  } else {
    console.warn("⚠️ Nota de crédito NO aprobada por AFIP.", { saleId, puntoVenta, tipoNC, numero, resultado });
  }

  return notaCredito;
}
