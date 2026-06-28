/**
 * Logo de empresa (Tenant). Mismo patron que product.write.ts: sube a
 * Cloudinary, guarda url/publicId en la fila del tenant y borra el logo
 * anterior al reemplazarlo.
 */
import fs from "fs";
import prisma from "../prisma";
import cloudinary from "../config/cloudinary";
import { AppError } from "../utils/asyncHandler";

function safeDeleteLocalFile(path?: string) {
  if (path && fs.existsSync(path)) {
    fs.unlinkSync(path);
  }
}

async function getTenantOrThrow(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new AppError("TENANT_NOT_FOUND", "Empresa no encontrada", 404);
  }
  return tenant;
}

export const tenantLogoService = {
  async getLogo(tenantId: string) {
    const tenant = await getTenantOrThrow(tenantId);
    return { logoUrl: tenant.logoUrl ?? null };
  },

  async uploadLogo(tenantId: string, file?: Express.Multer.File) {
    if (!file) {
      throw new AppError("FILE_REQUIRED", "Falta el archivo de imagen", 400);
    }

    const tenant = await getTenantOrThrow(tenantId);

    let newLogoId: string | undefined;

    try {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: "comarpos/logos",
        resource_type: "image",
      });

      newLogoId = result.public_id;

      safeDeleteLocalFile(file.path);

      if (tenant.logoId) {
        await cloudinary.uploader.destroy(tenant.logoId).catch(() => undefined);
      }

      return prisma.tenant.update({
        where: { id: tenantId },
        data: { logoUrl: result.secure_url, logoId: result.public_id },
      });
    } catch (err) {
      safeDeleteLocalFile(file?.path);

      if (newLogoId) {
        await cloudinary.uploader.destroy(newLogoId).catch(() => undefined);
      }

      throw err;
    }
  },

  async deleteLogo(tenantId: string) {
    const tenant = await getTenantOrThrow(tenantId);

    if (tenant.logoId) {
      await cloudinary.uploader.destroy(tenant.logoId).catch(() => undefined);
    }

    return prisma.tenant.update({
      where: { id: tenantId },
      data: { logoUrl: null, logoId: null },
    });
  },
};
