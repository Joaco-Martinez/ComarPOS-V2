import crypto from "crypto";
import fs from "fs";
import prisma from "../../prisma";
import cloudinary from "../../config/cloudinary";
import { AppError } from "../../utils/asyncHandler";
import type { PrintboxBoard } from "@prisma/client";

// Catalogo de builds de firmware del PrintBox -- global, no por tenant (el
// mismo firmware sirve a todos los locales). Publicado a mano desde
// platform-admin subiendo el .bin compilado con `pio run` (ver
// printbox/README.md, seccion OTA). El binario en si vive en Cloudinary
// (resource_type "raw", no es una imagen); acá solo se guarda el
// metadata + la URL.
export const printboxFirmwareService = {
  /**
   * Sube un .bin ya compilado y registra la version. Rechaza si ya existe
   * una fila para ese (board, version) -- @@unique en el schema, pero
   * chequeamos antes para no gastar el upload a Cloudinary en vano.
   */
  async publish(params: { board: PrintboxBoard; version: number; filePath: string; notes?: string }) {
    const { board, version, filePath, notes } = params;

    const existing = await prisma.printboxFirmware.findUnique({
      where: { board_version: { board, version } },
    });
    if (existing) {
      fs.unlink(filePath, () => undefined);
      throw new AppError("FIRMWARE_VERSION_EXISTS", `Ya existe firmware ${board} v${version}.`, 409);
    }

    const fileBuffer = fs.readFileSync(filePath);
    const sha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");

    let result;
    try {
      result = await cloudinary.uploader.upload(filePath, {
        folder: "printbox_firmware",
        resource_type: "raw",
        public_id: `${board.toLowerCase()}_v${version}_${Date.now()}`,
        use_filename: false,
        unique_filename: false,
      });
    } finally {
      fs.unlink(filePath, () => undefined);
    }

    return prisma.printboxFirmware.create({
      data: {
        board,
        version,
        sha256,
        sizeBytes: fileBuffer.length,
        fileUrl: result.secure_url,
        fileId: result.public_id,
        notes,
      },
    });
  },

  async list(board?: PrintboxBoard) {
    return prisma.printboxFirmware.findMany({
      where: board ? { board } : undefined,
      orderBy: [{ board: "asc" }, { version: "desc" }],
    });
  },

  /** Ultima version publicada para ese board, o null si todavia no hay ninguna. */
  async getLatest(board: PrintboxBoard) {
    return prisma.printboxFirmware.findFirst({
      where: { board },
      orderBy: { version: "desc" },
    });
  },

  async remove(id: string) {
    const fw = await prisma.printboxFirmware.findUnique({ where: { id } });
    if (!fw) {
      throw new AppError("FIRMWARE_NOT_FOUND", "Firmware no encontrado.", 404);
    }
    // best-effort: si Cloudinary falla igual borramos la fila, no vale la
    // pena dejar un release fantasma en el catalogo por un asset huerfano.
    await cloudinary.uploader.destroy(fw.fileId, { resource_type: "raw" }).catch(() => undefined);
    await prisma.printboxFirmware.delete({ where: { id } });
  },
};
