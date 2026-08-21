import crypto from "crypto";
import prisma from "../../prisma";
import { AppError } from "../../utils/asyncHandler";
import { encryptPrintboxSecret, decryptPrintboxSecret } from "./printbox.crypto";
import { verifyRequest } from "./printbox.hmac";

const HEARTBEAT_PATH_PREFIX = "/printbox/devices/";
const HEARTBEAT_PATH_SUFFIX = "/heartbeat";

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
   * Llamado desde el panel (ADMIN) cuando el código de 15 minutos expiró
   * antes de terminar el pairing físico - regenera uno nuevo para el mismo
   * device en vez de tener que revocar y crear uno de cero. Solo tiene
   * sentido mientras sigue PENDING_PAIRING (un device ya ACTIVE necesita el
   * flujo de "reemplazar hardware", no este).
   */
  async regenerateCode(tenantId: string, deviceId: string) {
    const device = await prisma.printboxDevice.findFirst({
      where: { id: deviceId, tenantId },
    });

    if (!device) {
      throw new AppError("DEVICE_NOT_FOUND", "PrintBox no encontrado", 404);
    }

    if (device.status !== "PENDING_PAIRING") {
      throw new AppError(
        "DEVICE_NOT_PENDING",
        "Este PrintBox no está esperando pairing - creá uno nuevo si necesitás emparejar un dispositivo.",
        400
      );
    }

    let pairingCode = generatePairingCode();
    for (let attempts = 0; attempts < 5; attempts++) {
      const clash = await prisma.printboxDevice.findUnique({ where: { pairingCode } });
      if (!clash) break;
      pairingCode = generatePairingCode();
    }

    return prisma.printboxDevice.update({
      where: { id: deviceId },
      data: {
        pairingCode,
        pairingCodeExpiresAt: new Date(Date.now() + PAIRING_CODE_TTL_MS),
      },
    });
  },

  /**
   * Llamado por el ESP32 (sin auth de usuario -- la prueba de pertenencia
   * es el pairingCode de un solo uso, tecleado a mano una vez durante el
   * setup local) para obtener su token permanente. deviceIp es la IP con
   * la que el backend ve llegar la request (req.ip en el controller, no
   * algo que el ESP32 auto-reporte) -- es la que el backend va a usar
   * despues para mandarle los tickets por HTTP directo.
   */
  async redeemPairingCode(pairingCode: string, hardwareId: string, deviceIp: string) {
    const device = await prisma.printboxDevice.findUnique({ where: { pairingCode } });

    if (!device || device.status !== "PENDING_PAIRING") {
      throw new AppError("PAIRING_CODE_INVALID", "Código de pairing inválido.", 400);
    }

    if (!device.pairingCodeExpiresAt || device.pairingCodeExpiresAt < new Date()) {
      throw new AppError("PAIRING_CODE_EXPIRED", "El código de pairing expiró, generá uno nuevo desde el panel.", 400);
    }

    const token = crypto.randomBytes(24).toString("hex");

    const paired = await prisma.$transaction(async (tx) => {
      // hardwareId es @unique GLOBAL (no por tenant, ver schema.prisma) --
      // si este mismo ESP32 físico ya había quedado ACTIVE en otro registro
      // (mismo tenant o, sobre todo, otro negocio de prueba), ese row viejo
      // sigue teniendo el hardwareId puesto y el update de abajo choca
      // contra la constraint, dejando el pairing nuevo sin poder completarse
      // aunque el device haya sido factory-reseteado. Un ESP32 solo puede
      // estar realmente conectado a una cuenta a la vez (llegar hasta acá
      // implica que se reseteó), asi que liberamos el row anterior acá.
      await tx.printboxDevice.updateMany({
        where: { hardwareId, id: { not: device.id } },
        data: { status: "REVOKED", hardwareId: null, deviceIp: null, tokenEncrypted: null },
      });

      return tx.printboxDevice.update({
        where: { id: device.id },
        data: {
          status: "ACTIVE",
          hardwareId,
          deviceIp,
          tokenEncrypted: encryptPrintboxSecret(token),
          pairingCode: null,
          pairingCodeExpiresAt: null,
          lastSeenAt: new Date(),
        },
      });
    });

    return {
      deviceId: paired.id,
      deviceName: paired.name,
      tenantId: paired.tenantId,
      token,
    };
  },

  /**
   * Heartbeat periodico del ESP32 (auth por firma HMAC, ver
   * printbox.hmac.ts -- el ESP32 firma con el mismo token que le dio el
   * pairing, no lo manda en texto plano) -- actualiza deviceIp (por si el
   * DHCP le cambio la IP desde el pairing) y lastSeenAt.
   */
  async heartbeat(deviceId: string, timestamp: string, signature: string, deviceIp: string) {
    const device = await prisma.printboxDevice.findFirst({
      where: { id: deviceId, status: "ACTIVE" },
    });

    if (!device?.tokenEncrypted) {
      throw new AppError("INVALID_TOKEN", "Device no encontrado o sin token.", 401);
    }

    const token = decryptPrintboxSecret(device.tokenEncrypted);
    const path = `${HEARTBEAT_PATH_PREFIX}${deviceId}${HEARTBEAT_PATH_SUFFIX}`;
    const error = verifyRequest(token, "POST", path, timestamp, "", signature);

    if (error) {
      throw new AppError("INVALID_SIGNATURE", `Firma inválida: ${error}`, 401);
    }

    await prisma.printboxDevice.update({
      where: { id: deviceId },
      data: { deviceIp, lastSeenAt: new Date() },
    });
  },
};
