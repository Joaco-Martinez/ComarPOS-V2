import axios from "axios";
import prisma from "../../prisma";
import { AppError } from "../../utils/asyncHandler";
import { decryptPrintboxSecret } from "./printbox.crypto";
import { signRequest } from "./printbox.hmac";

const PRINT_TICKET_PATH = "/print/ticket";

// Puerto fijo del server HTTP que el ESP32 levanta una vez emparejado (ver
// printbox/src/main.cpp) -- no configurable por env porque es un detalle
// de protocolo entre el backend y el firmware, no algo que varie por
// ambiente.
const PRINTBOX_DEVICE_PORT = 80;
const PRINTBOX_REQUEST_TIMEOUT_MS = 15000;

// Defensa extra por si quedó guardado un deviceIp viejo con el prefijo de
// IPv4-mapeado-a-IPv6 (::ffff:1.2.3.4) -- ver el mismo normalizeIp en
// printbox.controller.ts, que es donde se evita que esto vuelva a pasar
// hacia adelante. new URL() (que usa axios por dentro) explota con eso sin
// corchetes.
function normalizeIp(ip: string) {
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

export const printboxService = {
  /** Dispositivo a usar cuando no se especifica uno: el unico ACTIVE del tenant. */
  async resolveDefaultDevice(tenantId: string) {
    return prisma.printboxDevice.findFirst({
      where: { tenantId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
  },

  async listDevices(tenantId: string) {
    return prisma.printboxDevice.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
    });
  },

  /**
   * Le pega directo por HTTP al PrintBox (POST /print/ticket, mismo
   * contrato que el viejo agente local -- ver ticket.service.ts). Resuelve
   * apenas el job queda PUBLISHED, sin esperar la respuesta del ESP32 (ver
   * comentario más abajo) -- el ACK/FAILED final queda en PrintJob.
   */
  async publishTicket(params: {
    tenantId: string;
    deviceId: string;
    saleId?: string;
    payload: unknown;
  }) {
    const { tenantId, deviceId, saleId, payload } = params;

    const device = await prisma.printboxDevice.findFirst({
      where: { id: deviceId, tenantId },
    });

    // remoteHost (cargado a mano en el panel, ej. "printbox-x.comarpos.com"
    // o "printbox-x.comarpos.com:8080") pisa a deviceIp:80 cuando esta
    // seteado -- es lo que se usa cuando el tenant le puso DNS propio +
    // port-forwarding al PrintBox para poder llegarle desde fuera de su LAN.
    const target = device?.remoteHost || (device?.deviceIp ? `${normalizeIp(device.deviceIp)}:${PRINTBOX_DEVICE_PORT}` : null);

    if (!target || !device?.tokenEncrypted) {
      throw new AppError(
        "DEVICE_NOT_REACHABLE",
        "Este PrintBox todavía no tiene una IP/host registrado (esperá al primer heartbeat después de emparejarlo, o cargale un host remoto en el panel).",
        409
      );
    }

    const job = await prisma.printJob.create({
      data: { tenantId, deviceId, saleId, payload: payload as any, status: "QUEUED" },
    });

    const token = decryptPrintboxSecret(device.tokenEncrypted);
    const url = `http://${target}${PRINT_TICKET_PATH}`;

    // Firmado HMAC en vez de mandar el token plano en un header -- ver
    // printbox.hmac.ts para qué cubre esto y qué no (no reemplaza TLS,
    // pero evita que alguien sin el token pueda fabricar o modificar un
    // print job). bodyStr se manda tal cual (no el objeto payload
    // directo) para que lo que se firma sea BYTE A BYTE lo mismo que lo
    // que efectivamente sale por la red.
    const timestamp = Math.floor(Date.now() / 1000).toString(); // segundos, ver printbox.hmac.ts
    const bodyStr = JSON.stringify(payload);
    const signature = signRequest(token, "POST", PRINT_TICKET_PATH, timestamp, bodyStr);

    await prisma.printJob.update({
      where: { id: job.id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });

    // No se espera la respuesta del ESP32 acá a propósito: el caller (botón
    // "imprimir ticket" en el panel) necesita responder rápido, y la
    // request HTTP al device puede tardar varios segundos (red del local +
    // el tiempo real de impresión ESC/POS) o directamente colgarse hasta
    // PRINTBOX_REQUEST_TIMEOUT_MS si está apagado/inalcanzable. El
    // resultado real (ACKED/FAILED) se resuelve en background y queda en
    // PrintJob para poder revisarlo/reintentar -- ya no hay un ack
    // sincrónico que devolverle al usuario en esta misma respuesta.
    axios
      .post(url, bodyStr, {
        headers: {
          "Content-Type": "application/json",
          "X-Pos-Timestamp": timestamp,
          "X-Pos-Signature": signature,
        },
        timeout: PRINTBOX_REQUEST_TIMEOUT_MS,
      })
      .then(async () => {
        await prisma.printJob.update({
          where: { id: job.id },
          data: { status: "ACKED", ackedAt: new Date() },
        });
        await prisma.printboxDevice.update({
          where: { id: device.id },
          data: { lastSeenAt: new Date() },
        });
      })
      .catch(async (err: any) => {
        await prisma.printJob.update({
          where: { id: job.id },
          data: { status: "FAILED", error: String(err?.message ?? err).slice(0, 500) },
        });
      });

    return job;
  },
};
