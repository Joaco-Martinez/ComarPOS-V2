/**
 * Cliente de Mercado Pago para que un TENANT le cobre a SUS clientes en la
 * tienda online (Checkout Pro: crear una "preference", el comprador paga en
 * el checkout hosteado de MP, y se confirma via webhook). Deliberadamente
 * separado de billing/mercadoPago.service.ts (esa es la cuenta de MP de
 * ComarPOS para cobrar la suscripcion SaaS a los tenants - "preapproval",
 * no "preference" - no se toca ni se reusa acá).
 *
 * El access_token se recibe como parametro explicito en cada llamada (no
 * hay un MP_ACCESS_TOKEN global): cada tenant paga con SU propia cuenta, el
 * token sale de tenantMpConfigService desencriptado recien al momento de
 * usarlo.
 */
import axios from "axios";

const MP_API_BASE = "https://api.mercadopago.com";

function client(accessToken: string) {
  return axios.create({
    baseURL: MP_API_BASE,
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15000,
  });
}

export type MpPreference = {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
};

export type MpPayment = {
  id: number | string;
  status: string; // approved | rejected | pending | in_process | ...
  status_detail?: string;
  external_reference?: string | null;
  transaction_amount?: number;
};

export const storefrontMercadoPagoService = {
  async createPreference(params: {
    accessToken: string;
    orderId: string;
    items: { title: string; quantity: number; unitPrice: number }[];
    payerEmail?: string;
    backUrl: string;
    notificationUrl: string;
  }): Promise<MpPreference> {
    const { data } = await client(params.accessToken).post("/checkout/preferences", {
      items: params.items.map((item) => ({
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        currency_id: "ARS",
      })),
      external_reference: params.orderId,
      payer: params.payerEmail ? { email: params.payerEmail } : undefined,
      back_urls: {
        success: params.backUrl,
        pending: params.backUrl,
        failure: params.backUrl,
      },
      auto_return: "approved",
      notification_url: params.notificationUrl,
    });

    return data;
  },

  async getPayment(accessToken: string, paymentId: string | number): Promise<MpPayment> {
    const { data } = await client(accessToken).get(`/v1/payments/${encodeURIComponent(String(paymentId))}`);
    return data;
  },
};
