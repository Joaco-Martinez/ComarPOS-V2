import { Request, Response, NextFunction } from "express";
import { printboxFirmwareService } from "../services/printbox/printboxFirmware.service";
import { getParamAsString } from "../utils/params";
import { AppError } from "../utils/asyncHandler";
import type { PrintboxBoard } from "@prisma/client";

function parseBoard(raw: unknown): PrintboxBoard {
  if (raw === "ESP32_S3" || raw === "ESP32_CLASSIC") return raw;
  throw new AppError("INVALID_BOARD", "board tiene que ser ESP32_S3 o ESP32_CLASSIC.", 400);
}

// Solo platform-admin (ver platformAdmin.routes.ts) -- el firmware es
// global, no de un tenant puntual, así que no puede vivir bajo el auth de
// negocio de siempre (ver printbox.routes.ts).
export const printboxFirmwareController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const board = req.query.board ? parseBoard(req.query.board) : undefined;
      const firmwares = await printboxFirmwareService.list(board);
      res.json({ ok: true, firmwares });
    } catch (err) {
      next(err);
    }
  },

  async publish(req: Request, res: Response, next: NextFunction) {
    try {
      const board = parseBoard(req.body?.board);
      const version = Number(req.body?.version);
      const notes = req.body?.notes ? String(req.body.notes).slice(0, 500) : undefined;

      if (!Number.isInteger(version) || version <= 0) {
        throw new AppError("INVALID_VERSION", "version tiene que ser un entero positivo.", 400);
      }
      if (!req.file) {
        throw new AppError("FILE_REQUIRED", "Falta el archivo .bin del firmware.", 400);
      }

      const firmware = await printboxFirmwareService.publish({
        board,
        version,
        filePath: req.file.path,
        notes,
      });

      res.status(201).json({ ok: true, firmware });
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const id = getParamAsString(req.params.id, "id");
      await printboxFirmwareService.remove(id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
};
