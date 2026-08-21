import { Request, Response } from "express";
import prisma from "../prisma";
import { currentTenantId } from "../context/tenantContext";
import { AppError } from "../utils/asyncHandler";
import { getParamAsString } from "../utils/params";
import { printboxService } from "../services/printbox/printbox.service";
import { printboxPairingService } from "../services/printbox/printbox.pairing";

function requireCurrentTenantId() {
  const tenantId = currentTenantId();
  if (!tenantId) {
    throw new AppError("TENANT_NOT_RESOLVED", "No se pudo resolver la empresa actual", 400);
  }
  return tenantId;
}

// req.ip en Node/Express viene como IPv4 "mapeado a IPv6" (::ffff:1.2.3.4)
// cuando el socket es dual-stack -- eso rompe new URL() mas adelante
// (axios) porque los ":" de esa notacion necesitan corchetes en una URL
// valida. Lo normalizamos acá, una sola vez, en el punto donde entra.
function normalizeIp(ip: string) {
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

export const printboxController = {
  // ADMIN, autenticado — panel del tenant.
  async createDevice(req: Request, res: Response, next: any) {
    try {
      const tenantId = requireCurrentTenantId();
      const name = String(req.body?.name || "").trim();

      if (!name) {
        throw new AppError("NAME_REQUIRED", "El PrintBox necesita un nombre (ej. 'Caja 1').", 400);
      }

      const device = await printboxPairingService.createPendingDevice(tenantId, name);

      res.status(201).json({
        ok: true,
        device: {
          id: device.id,
          name: device.name,
          status: device.status,
          pairingCode: device.pairingCode,
          pairingCodeExpiresAt: device.pairingCodeExpiresAt,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async listDevices(req: Request, res: Response, next: any) {
    try {
      const tenantId = requireCurrentTenantId();
      const devices = await printboxService.listDevices(tenantId);
      res.json({ ok: true, devices });
    } catch (err) {
      next(err);
    }
  },

  async updateDevice(req: Request, res: Response, next: any) {
    try {
      const tenantId = requireCurrentTenantId();
      const id = getParamAsString(req.params.id, "id");
      const { name, printerIp, remoteHost } = req.body ?? {};

      const device = await prisma.printboxDevice.findFirst({ where: { id, tenantId } });
      if (!device) {
        throw new AppError("DEVICE_NOT_FOUND", "PrintBox no encontrado", 404);
      }

      const updated = await prisma.printboxDevice.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name: String(name).trim() } : {}),
          ...(printerIp !== undefined ? { printerIp: String(printerIp).trim() || null } : {}),
          ...(remoteHost !== undefined ? { remoteHost: String(remoteHost).trim() || null } : {}),
        },
      });

      res.json({ ok: true, device: updated });
    } catch (err) {
      next(err);
    }
  },

  async regenerateCode(req: Request, res: Response, next: any) {
    try {
      const tenantId = requireCurrentTenantId();
      const id = getParamAsString(req.params.id, "id");

      const device = await printboxPairingService.regenerateCode(tenantId, id);

      res.json({
        ok: true,
        device: {
          id: device.id,
          name: device.name,
          status: device.status,
          pairingCode: device.pairingCode,
          pairingCodeExpiresAt: device.pairingCodeExpiresAt,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async revokeDevice(req: Request, res: Response, next: any) {
    try {
      const tenantId = requireCurrentTenantId();
      const id = getParamAsString(req.params.id, "id");

      const device = await prisma.printboxDevice.findFirst({ where: { id, tenantId } });
      if (!device) {
        throw new AppError("DEVICE_NOT_FOUND", "PrintBox no encontrado", 404);
      }

      // hardwareId es @unique -- si no lo liberamos acá, el mismo ESP32
      // físico (mismo hardwareId siempre) nunca podría volver a
      // emparejarse con un device nuevo, ni aunque este quede revocado.
      // deviceIp/tokenEncrypted tambien se limpian: son credenciales de
      // un device que ya no debería poder recibir tickets.
      const updated = await prisma.printboxDevice.update({
        where: { id },
        data: { status: "REVOKED", hardwareId: null, deviceIp: null, tokenEncrypted: null },
      });

      res.json({ ok: true, device: updated });
    } catch (err) {
      next(err);
    }
  },

  // Público — lo llama el ESP32 directamente, sin sesión de usuario. La
  // única prueba de pertenencia es el pairingCode de un solo uso (ver
  // printbox.pairing.ts). deviceIp sale de req.ip (quien realmente abrió
  // la conexión TCP), no de algo que el device auto-reporte -- evita que
  // un payload manipulado registre una IP distinta de la real.
  async pair(req: Request, res: Response, next: any) {
    try {
      const pairingCode = String(req.body?.pairingCode || "").trim();
      const hardwareId = String(req.body?.hardwareId || "").trim();

      if (!pairingCode || !hardwareId) {
        throw new AppError("MISSING_FIELDS", "pairingCode y hardwareId son requeridos.", 400);
      }

      const result = await printboxPairingService.redeemPairingCode(pairingCode, hardwareId, normalizeIp(req.ip || ""));

      res.json({ ok: true, ...result });
    } catch (err) {
      next(err);
    }
  },

  // Público — heartbeat periodico del ESP32 (auth por firma HMAC, no
  // sesión de usuario, ver printbox.pairing.ts#heartbeat / printbox.hmac.ts).
  async heartbeat(req: Request, res: Response, next: any) {
    try {
      const id = getParamAsString(req.params.id, "id");
      const timestamp = String(req.headers["x-pos-timestamp"] || "");
      const signature = String(req.headers["x-pos-signature"] || "");

      if (!timestamp || !signature) {
        throw new AppError("MISSING_SIGNATURE", "Faltan los headers X-Pos-Timestamp/X-Pos-Signature.", 401);
      }

      await printboxPairingService.heartbeat(id, timestamp, signature, normalizeIp(req.ip || ""));

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
};
