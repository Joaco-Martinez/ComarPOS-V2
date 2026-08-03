import prisma from "../../prisma";
import { publishPrintboxMessage, printboxMqttConfigured, subscribeRaw } from "./mqttAdmin.client";

/**
 * Escucha tenants/+/devices/+/jobs/ack (el printbox publica ahi cuando
 * termina de imprimir) y marca el PrintJob correspondiente como ACKED.
 * No-op si no hay broker configurado (opt-in, igual que Sentry) -- se
 * puede llamar sin condicionar desde src/index.ts.
 */
export function startPrintboxAckListener() {
  if (!printboxMqttConfigured()) return;

  subscribeRaw("tenants/+/devices/+/jobs/ack", async (topic, message) => {
    if (!topic.endsWith("/jobs/ack")) return;

    try {
      const body = JSON.parse(message.toString());
      if (body?.jobId) {
        await printboxService.ackJob(body.jobId);
      }
    } catch (err) {
      console.error("❌ Error procesando ack de printbox:", err);
    }
  });
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
   * Encola + publica un PrintJob por MQTT. Publica primero, marca PUBLISHED
   * recien si el broker confirmo el ack de QoS 1 (mqtt.js espera eso antes
   * de resolver la promesa) -- si el broker esta caido, queda FAILED y
   * quien llamo decide si reintentar o avisar al usuario.
   */
  async publishTicket(params: {
    tenantId: string;
    deviceId: string;
    saleId?: string;
    payload: unknown;
  }) {
    const { tenantId, deviceId, saleId, payload } = params;

    const job = await prisma.printJob.create({
      data: { tenantId, deviceId, saleId, payload: payload as any, status: "QUEUED" },
    });

    const topic = `tenants/${tenantId}/devices/${deviceId}/jobs`;

    try {
      await publishPrintboxMessage(topic, { jobId: job.id, ...(payload as object) }, 1);

      await prisma.printJob.update({
        where: { id: job.id },
        data: { status: "PUBLISHED", publishedAt: new Date() },
      });
    } catch (err: any) {
      await prisma.printJob.update({
        where: { id: job.id },
        data: { status: "FAILED", error: String(err?.message ?? err).slice(0, 500) },
      });
      throw err;
    }

    return job;
  },

  async ackJob(jobId: string) {
    return prisma.printJob.update({
      where: { id: jobId },
      data: { status: "ACKED", ackedAt: new Date() },
    });
  },
};
