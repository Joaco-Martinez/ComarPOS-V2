import crypto from "crypto";
import prisma from "../../prisma";
import { AppError } from "../../utils/asyncHandler";
import { ensureTenantMqttCredentials } from "./printbox.provisioning";

const PAIRING_CODE_TTL_MS = 15 * 60 * 1000;

function generatePairingCode() {
  return crypto.randomInt(100000, 999999).toString();
}

export const printboxPairingService = {
  /** Llamado desde el panel (ADMIN) para dar de alta un PrintBox nuevo. */
  async createPendingDevice(tenantId: string, name: string) {
    let pairingCode = generatePairingCode();

    // pairingCode es @unique: en la practica nunca choca (1 en 900k), pero
    // reintentar es gratis.
    for (let attempts = 0; attempts < 5; attempts++) {
      const clash = await prisma.printboxDevice.findUnique({ where: { pairingCode } });
      if (!clash) break;
      pairingCode = generatePairingCode();
    }

    return prisma.printboxDevice.create({
      data: {
        tenantId,
        name,
        pairingCode,
        pairingCodeExpiresAt: new Date(Date.now() + PAIRING_CODE_TTL_MS),
      },
    });
  },

  /**
   * Llamado por el ESP32 (sin auth de usuario -- la prueba de pertenencia
   * es el pairingCode de un solo uso, tecleado a mano una vez durante el
   * setup local) para obtener sus credenciales MQTT permanentes.
   */
  async redeemPairingCode(pairingCode: string, hardwareId: string) {
    const device = await prisma.printboxDevice.findUnique({ where: { pairingCode } });

    if (!device || device.status !== "PENDING_PAIRING") {
      throw new AppError("PAIRING_CODE_INVALID", "Código de pairing inválido.", 400);
    }

    if (!device.pairingCodeExpiresAt || device.pairingCodeExpiresAt < new Date()) {
      throw new AppError("PAIRING_CODE_EXPIRED", "El código de pairing expiró, generá uno nuevo desde el panel.", 400);
    }

    const { username, password } = await ensureTenantMqttCredentials(device.tenantId);

    const paired = await prisma.printboxDevice.update({
      where: { id: device.id },
      data: {
        status: "ACTIVE",
        hardwareId,
        pairingCode: null,
        pairingCodeExpiresAt: null,
        lastSeenAt: new Date(),
      },
    });

    return {
      deviceId: paired.id,
      deviceName: paired.name,
      tenantId: paired.tenantId,
      mqttUsername: username,
      mqttPassword: password,
      mqttUrl: process.env.MQTT_PUBLIC_URL || process.env.MQTT_URL,
      jobsTopic: `tenants/${paired.tenantId}/devices/${paired.id}/jobs`,
      ackTopic: `tenants/${paired.tenantId}/devices/${paired.id}/jobs/ack`,
    };
  },
};
