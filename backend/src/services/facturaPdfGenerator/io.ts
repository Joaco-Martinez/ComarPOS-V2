/**
 * I/O auxiliar: filesystem, QR y subida a Cloudinary.
 * Extraidos de facturaPdfGenerator.service.ts (modularizacion, doc seccion 4).
 */
import fs from "fs";
import path from "path";
import cloudinary from "cloudinary";
import QRCode from "qrcode";
import prisma from "../../prisma";

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

/**
 * Descarga el logo del tenant (Cloudinary) a un archivo temporal para que
 * pdfkit pueda dibujarlo via doc.image() (que requiere path/buffer local, no URL).
 * Devuelve undefined si el tenant no tiene logo o falla la descarga, en cuyo
 * caso el caller cae al logo estatico por defecto (sin cambio de comportamiento).
 */
export async function resolveTenantLogoPath(
  tenantId?: string | null
): Promise<string | undefined> {
  if (!tenantId) return undefined;

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { logoUrl: true },
    });

    if (!tenant?.logoUrl) return undefined;

    const response = await fetch(tenant.logoUrl);
    if (!response.ok) return undefined;

    const buffer = Buffer.from(await response.arrayBuffer());
    const ext = path.extname(new URL(tenant.logoUrl).pathname) || ".png";
    const outDir = path.join(process.cwd(), "tmp");
    ensureDir(outDir);

    const outPath = path.join(outDir, `tenant-logo-${tenantId}${ext}`);
    fs.writeFileSync(outPath, buffer);
    return outPath;
  } catch {
    return undefined;
  }
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
