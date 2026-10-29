/**
 * Ajustes globales de la plataforma editables desde /platform-admin (tabla
 * PlatformSetting, clave/valor JSON). Cross-tenant por diseno, igual que
 * platformTenant.service.ts -- no son datos de ningun negocio.
 */
import prisma from "../prisma";
import type { TransferInfo } from "../config/billing";

const TRANSFER_ACCOUNT_KEY = "transferAccount";
const BILLING_REMINDERS_KEY = "billingReminders";

// Cuantos dias antes del vencimiento sale cada cartel de pago (ver frontend
// components/PaymentDueModal.tsx): payWindowDays = "ya podes pagar",
// urgentDays = "se esta por pausar por falta de pago".
export type BillingReminders = { payWindowDays: number; urgentDays: number };

const DEFAULT_BILLING_REMINDERS: BillingReminders = { payWindowDays: 7, urgentDays: 3 };

const EMPTY_TRANSFER_ACCOUNT: TransferInfo = {
  enabled: false,
  holder: null,
  cuit: null,
  bank: null,
  cbu: null,
  alias: null,
};

function cleanField(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

export const platformSettingsService = {
  /** Lo que se edita en /platform-admin/cobros, tal cual quedo guardado. */
  async getTransferAccount(): Promise<TransferInfo> {
    const row = await prisma.platformSetting.findUnique({ where: { key: TRANSFER_ACCOUNT_KEY } });
    return { ...EMPTY_TRANSFER_ACCOUNT, ...((row?.value as Partial<TransferInfo> | null) ?? {}) };
  },

  /**
   * Lo que ve el tenant en /suscripcion: "enabled" solo si el super-admin
   * la prendio Y hay al menos CBU o alias -- sin eso no hay a donde
   * transferir, asi que la opcion directamente no se ofrece.
   */
  async getPublicTransferInfo(): Promise<TransferInfo> {
    const account = await this.getTransferAccount();
    if (!account.enabled || !(account.cbu || account.alias)) return EMPTY_TRANSFER_ACCOUNT;
    return account;
  },

  async getBillingReminders(): Promise<BillingReminders> {
    const row = await prisma.platformSetting.findUnique({ where: { key: BILLING_REMINDERS_KEY } });
    return { ...DEFAULT_BILLING_REMINDERS, ...((row?.value as Partial<BillingReminders> | null) ?? {}) };
  },

  async setBillingReminders(data: Record<string, unknown>): Promise<BillingReminders> {
    const payWindowDays = Number(data.payWindowDays);
    const urgentDays = Number(data.urgentDays);
    const valid = (n: number) => Number.isInteger(n) && n >= 0 && n <= 60;

    if (!valid(payWindowDays) || !valid(urgentDays)) {
      throw Object.assign(new Error("Los días tienen que ser números enteros entre 0 y 60"), { status: 400 });
    }
    if (urgentDays > payWindowDays) {
      throw Object.assign(new Error("El aviso de \"se pausa\" no puede empezar antes que el de \"ya podés pagar\""), { status: 400 });
    }

    const value: BillingReminders = { payWindowDays, urgentDays };
    await prisma.platformSetting.upsert({
      where: { key: BILLING_REMINDERS_KEY },
      create: { key: BILLING_REMINDERS_KEY, value },
      update: { value },
    });
    return value;
  },

  async setTransferAccount(data: Record<string, unknown>): Promise<TransferInfo> {
    const cbu = cleanField(data.cbu, 30)?.replace(/\s+/g, "") ?? null;
    if (cbu && !/^\d{22}$/.test(cbu)) {
      throw Object.assign(new Error("El CBU/CVU tiene que tener 22 dígitos"), { status: 400 });
    }

    const value: TransferInfo = {
      enabled: data.enabled === true,
      holder: cleanField(data.holder, 120),
      cuit: cleanField(data.cuit, 20),
      bank: cleanField(data.bank, 80),
      cbu,
      alias: cleanField(data.alias, 40),
    };

    if (value.enabled && !value.cbu && !value.alias) {
      throw Object.assign(new Error("Para habilitar el pago por transferencia cargá al menos el CBU o el alias"), { status: 400 });
    }

    await prisma.platformSetting.upsert({
      where: { key: TRANSFER_ACCOUNT_KEY },
      create: { key: TRANSFER_ACCOUNT_KEY, value },
      update: { value },
    });

    return value;
  },
};
