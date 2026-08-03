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
      const { name, printerIp } = req.body ?? {};

      const device = await prisma.printboxDevice.findFirst({ where: { id, tenantId } });
      if (!device) {
        throw new AppError("DEVICE_NOT_FOUND", "PrintBox no encontrado", 404);
      }

      const updated = await prisma.printboxDevice.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name: String(name).trim() } : {}),
          ...(printerIp !== undefined ? { printerIp: String(printerIp).trim() || null } : {}),
        },
      });

      res.json({ ok: true, device: updated });
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

      const updated = await prisma.printboxDevice.update({
        where: { id },
        data: { status: "REVOKED" },
      });

      res.json({ ok: true, device: updated });
    } catch (err) {
      next(err);
    }
  },

  // Público — lo llama el ESP32 directamente, sin sesión de usuario. La
  // única prueba de pertenencia es el pairingCode de un solo uso (ver
  // printbox.pairing.ts).
  async pair(req: Request, res: Response, next: any) {
    try {
      const pairingCode = String(req.body?.pairingCode || "").trim();
      const hardwareId = String(req.body?.hardwareId || "").trim();

      if (!pairingCode || !hardwareId) {
        throw new AppError("MISSING_FIELDS", "pairingCode y hardwareId son requeridos.", 400);
      }

      const result = await printboxPairingService.redeemPairingCode(pairingCode, hardwareId);

      res.json({ ok: true, ...result });
    } catch (err) {
      next(err);
    }
  },
};
