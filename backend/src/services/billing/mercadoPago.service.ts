/**
 * Cliente HTTP directo contra la API de Mercado Pago (sin el SDK oficial,
 * la superficie que usamos es chica: crear una "preapproval" - su termino
 * para una suscripcion recurrente con auto-cobro -, consultarla, y
 * consultar un pago puntual generado por ella). Opt-in como Sentry (ver
 * config/sentry.ts): sin MP_ACCESS_TOKEN configurado, cualquier llamada
 * tira un error claro en vez de fallar el boot entero - asi un dev sin
 * credenciales de MP puede seguir levantando el backend para todo lo demas.
 *
 * Doc de referencia: https://www.mercadopago.com.ar/developers/es/reference/subscriptions/_preapproval/post
 */
import axios from "axios";
import crypto from "crypto";
import { Request } from "express";

const MP_API_BASE = "https://api.mercadopago.com";

function accessToken(): string {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "MP_ACCESS_TOKEN no está configurado - no se puede hablar con Mercado Pago (ver .env.example)."
    );
  }
  return token;
}

function client() {
  return axios.create({
    baseURL: MP_API_BASE,
    headers: { Authorization: `Bearer ${accessToken()}` },
    timeout: 15000,
  });
}

export type MpPreapproval = {
  id: string;
  init_point?: string;
  status: string; // pending | authorized | paused | cancelled
  external_reference?: string | null;
  payer_email?: string | null;
};

export type MpPayment = {
  id: number | string;
  status: string; // approved | rejected | pending | ...
  status_detail?: string;
  date_approved?: string | null;
  transaction_amount?: number;
  external_reference?: string | null;
};

export type MpPreapprovalPlan = {
  id: string;
  status: string; // active | ...
  init_point?: string;
};

export const mercadoPagoClient = {
  /**
   * "Plan" del lado de MP (distinto de una preapproval suelta): un objeto
   * reutilizable que se ve en el dashboard de MP con nombre/precio propios.
   * No hace falta para que el cobro funcione -- createPreapproval ya arma
   * todo inline con auto_recurring -- pero registrar los 3 planes de
   * ComarPOS como planes reales de MP le da visibilidad/reportes del lado
   * de Mercado Pago (ver mpPlan.service.ts).
   */
  async createPreapprovalPlan(params: {
    reason: string;
    amount: number;
    backUrl: string;
  }): Promise<MpPreapprovalPlan> {
    const { data } = await client().post("/preapproval_plan", {
      reason: params.reason,
      back_url: params.backUrl,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: params.amount,
        currency_id: "ARS",
      },
    });

    return data;
  },

  async createPreapproval(params: {
    tenantId: string;
    payerEmail: string;
    backUrl: string;
    reason: string;
    amount: number;
  }): Promise<MpPreapproval> {
    const { data } = await client().post("/preapproval", {
      reason: params.reason,
      external_reference: params.tenantId,
      payer_email: params.payerEmail,
      back_url: params.backUrl,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: params.amount,
        currency_id: "ARS",
      },
    });

    return data;
  },

  async getPreapproval(id: string): Promise<MpPreapproval> {
    const { data } = await client().get(`/preapproval/${encodeURIComponent(id)}`);
    return data;
  },

  /**
   * Cancela una preapproval existente (deja de cobrarse) -- usado al
   * cambiar de plan (ver billing.service.ts, changePlan): no tiene sentido
   * dejar la suscripcion vieja autorizada facturando en paralelo con la
   * nueva. PUT status:"cancelled" es el mismo mecanismo que usa el propio
   * MP cuando el usuario cancela desde su cuenta.
   */
  async cancelPreapproval(id: string): Promise<MpPreapproval> {
    const { data } = await client().put(`/preapproval/${encodeURIComponent(id)}`, {
      status: "cancelled",
    });
    return data;
  },

  async getPayment(id: string | number): Promise<MpPayment> {
    const { data } = await client().get(`/v1/payments/${encodeURIComponent(String(id))}`);
    return data;
  },

  /**
   * Valida el header x-signature de un webhook de MP (esquema "v2" con
   * secret configurado en el panel de MP al crear la integracion de
   * webhooks). Sin MP_WEBHOOK_SECRET configurado no podemos validar nada
   * todavia (huevo-gallina: hace falta la URL del webhook - que depende de
   * este deploy - para que MP genere el secret) - en ese caso deja pasar y
   * loguea un warning en vez de rechazar todo, para no trabar el alta
   * inicial de la integracion.
   */
  verifyWebhookSignature(req: Request): boolean {
    const secret = process.env.MP_WEBHOOK_SECRET;
    if (!secret) {
      console.warn(
        "⚠️ MP_WEBHOOK_SECRET no configurado: webhook de Mercado Pago aceptado sin validar firma"
      );
      return true;
    }

    const signatureHeader = req.headers["x-signature"];
    const requestId = req.headers["x-request-id"];
    const dataId = (req.query?.["data.id"] ?? req.query?.id ?? (req.body as any)?.data?.id) as
      | string
      | undefined;

    if (typeof signatureHeader !== "string" || typeof requestId !== "string" || !dataId) {
      return false;
    }

    const parts = Object.fromEntries(
      signatureHeader.split(",").map((p) => {
        const [k, v] = p.split("=");
        return [k?.trim(), v?.trim()];
      })
    );
    const ts = parts.ts;
    const v1 = parts.v1;
    if (!ts || !v1) return false;

    const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`;
    const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

    try {
      return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(v1, "hex"));
    } catch {
      return false;
    }
  },
};
