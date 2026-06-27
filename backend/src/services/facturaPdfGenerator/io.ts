/**
 * I/O auxiliar: filesystem, QR y subida a Cloudinary.
 * Extraidos de facturaPdfGenerator.service.ts (modularizacion, doc seccion 4).
 */
import fs from "fs";
import path from "path";
import cloudinary from "cloudinary";
import QRCode from "qrcode";

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export async function uploadPDFtoCloudinary(
  filePath: string,
  numero: number
): Promise<string> {
  const res = await cloudinary.v2.uploader.upload(filePath, {
    resource_type: "raw",
    folder: "facturas-afip",
    public_id: `factura-${numero}`,
    overwrite: true,
  });

  return res.secure_url;
}

export async function generarQRPNGDesdeURL(url: string, outputPath: string) {
  await QRCode.toFile(outputPath, url, {
    type: "png",
    width: 240,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}

export function getDefaultLogoPath(basePath: string, custom?: string) {
  if (custom && fs.existsSync(custom)) return custom;

  const logoVj = path.join(basePath, "assets/logo-vj.png");
  if (fs.existsSync(logoVj)) return logoVj;

  const logoVjJpg = path.join(basePath, "assets/logo-vj.jpg");
  if (fs.existsSync(logoVjJpg)) return logoVjJpg;

  const oldLogo = path.join(basePath, "assets/logo-von-konig-png-1.png");
  if (fs.existsSync(oldLogo)) return oldLogo;

  return undefined;
}
