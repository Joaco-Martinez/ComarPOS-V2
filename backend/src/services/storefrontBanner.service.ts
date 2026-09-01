/**
 * Banner de portada de la tienda online. Mismo patron que
 * tenantLogo.service.ts: sube a Cloudinary, guarda url/publicId, borra el
 * anterior al reemplazarlo.
 */
import fs from "fs";
import prisma from "../prisma";
import cloudinary from "../config/cloudinary";
import { AppError } from "../utils/asyncHandler";
import { storefrontConfigService } from "./storefrontConfig.service";

function safeDeleteLocalFile(path?: string) {
  if (path && fs.existsSync(path)) {
    fs.unlinkSync(path);
  }
}

export const storefrontBannerService = {
  async upload(tenantId: string, file?: Express.Multer.File) {
    if (!file) {
      throw new AppError("FILE_REQUIRED", "Falta el archivo de imagen", 400);
    }

    const config = await storefrontConfigService.ensureConfig(tenantId);

    let newBannerId: string | undefined;

    try {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: "comarpos/storefront-banners",
        resource_type: "image",
      });

      newBannerId = result.public_id;
      safeDeleteLocalFile(file.path);

      if (config.bannerId) {
        await cloudinary.uploader.destroy(config.bannerId).catch(() => undefined);
      }

      return prisma.tenantStorefrontConfig.update({
        where: { tenantId },
        data: { bannerUrl: result.secure_url, bannerId: result.public_id },
      });
    } catch (err) {
      safeDeleteLocalFile(file?.path);

      if (newBannerId) {
        await cloudinary.uploader.destroy(newBannerId).catch(() => undefined);
      }

      throw err;
    }
  },

  async remove(tenantId: string) {
    const config = await storefrontConfigService.ensureConfig(tenantId);

    if (config.bannerId) {
      await cloudinary.uploader.destroy(config.bannerId).catch(() => undefined);
    }

    return prisma.tenantStorefrontConfig.update({
      where: { tenantId },
      data: { bannerUrl: null, bannerId: null },
    });
  },
};
