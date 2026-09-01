/**
 * Credenciales de Mercado Pago del tenant (doc "tienda online por tenant").
 * Carga manual (pegar Access Token + Public Key desde developers.mercadopago.com,
 * sin OAuth) - mismo patron que ArcaConfig: el Access Token se guarda
 * encriptado (tenantMpCrypto.service.ts) y nunca se devuelve en claro al
 * frontend, solo un flag de si esta cargado.
 */
import axios from "axios";
import prisma from "../prisma";
import { currentTenantId } from "../context/tenantContext";
import { tenantMpCryptoService } from "./tenantMpCrypto.service";

const MP_API_BASE = "https://api.mercadopago.com";

async function getRawConfig(tenantId: string) {
  return prisma.tenantMpConfig.findUnique({ where: { tenantId } });
}

export const tenantMpConfigService = {
  /** Para el admin: nunca devuelve el token, solo si hay uno cargado. */
  async getForAdmin() {
    const tenantId = currentTenantId();
    if (!tenantId) return null;

    const config = await getRawConfig(tenantId);

    return {
      hasAccessToken: !!config?.accessTokenEncrypted,
      publicKey: config?.publicKey ?? null,
      status: config?.status ?? "INACTIVE",
      isActive: config?.isActive ?? false,
      lastError: config?.lastError ?? null,
      lastCheckAt: config?.lastCheckAt ?? null,
    };
  },

  /** Para uso interno (crear preferencias, webhook) - acá sí desencripta. */
  async getActiveAccessToken(tenantId: string): Promise<string | null> {
    const config = await getRawConfig(tenantId);
    if (!config?.isActive || !config.accessTokenEncrypted) return null;

    try {
      return tenantMpCryptoService.decrypt(config.accessTokenEncrypted);
    } catch {
      return null;
    }
  },

  /**
   * Guarda las credenciales y las prueba contra /users/me antes de
   * activarlas - así no queda "activo" con un token roto/pegado mal.
   */
  async save(data: { accessToken?: string; publicKey?: string | null }) {
    const tenantId = currentTenantId();
    if (!tenantId) throw new Error("No se pudo resolver el tenant actual");

    if (!data.accessToken?.trim()) {
      throw new Error("Falta el Access Token");
    }

    const accessToken = data.accessToken.trim();

    let status: "ACTIVE" | "ERROR" = "ACTIVE";
    let lastError: string | null = null;
    let isActive = true;

    try {
      await axios.get(`${MP_API_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000,
      });
    } catch (err: any) {
      status = "ERROR";
      isActive = false;
      lastError =
        err?.response?.status === 401 || err?.response?.status === 403
          ? "El Access Token no es válido"
          : err?.message || "No se pudo verificar el Access Token";
    }

    const accessTokenEncrypted = tenantMpCryptoService.encrypt(accessToken);

    const updated = await prisma.tenantMpConfig.upsert({
      where: { tenantId },
      update: {
        accessTokenEncrypted,
        publicKey: data.publicKey?.trim() || null,
        status,
        isActive,
        lastError,
        lastCheckAt: new Date(),
      },
      create: {
        tenantId,
        accessTokenEncrypted,
        publicKey: data.publicKey?.trim() || null,
        status,
        isActive,
        lastError,
        lastCheckAt: new Date(),
      },
    });

    if (status === "ERROR") {
      throw new Error(lastError || "El Access Token no es válido");
    }

    return {
      hasAccessToken: !!updated.accessTokenEncrypted,
      publicKey: updated.publicKey,
      status: updated.status,
      isActive: updated.isActive,
      lastError: updated.lastError,
      lastCheckAt: updated.lastCheckAt,
    };
  },

  async remove() {
    const tenantId = currentTenantId();
    if (!tenantId) throw new Error("No se pudo resolver el tenant actual");

    await prisma.tenantMpConfig.updateMany({
      where: { tenantId },
      data: { accessTokenEncrypted: null, publicKey: null, status: "INACTIVE", isActive: false },
    });

    return { ok: true };
  },
};
