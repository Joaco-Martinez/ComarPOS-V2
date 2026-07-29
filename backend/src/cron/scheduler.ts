/**
 * Scheduler de tareas periódicas. Se importa desde index.ts al arrancar el servidor.
 * Usa node-cron (ya instalado). Cada job corre en su propio runWithTenant por row,
 * siguiendo el patrón del worker AFIP (doc sección 6 multi-tenant).
 */
import cron from "node-cron";
import prisma from "../prisma";
import { runWithTenant } from "../context/tenantContext";
import { recurringExpenseService } from "../services/recurringExpense.service";
import { notificationService } from "../services/notification.service";
import { loyaltyService } from "../services/loyalty.service";

function safeRun(name: string, fn: () => Promise<any>) {
  return fn().catch((err) => console.error(`[cron:${name}]`, err));
}

export function startScheduler() {
  // ── Gastos recurrentes ──────────────────────────────────────────────────────
  // Corre a las 06:00 AR todos los días
  cron.schedule(
    "0 6 * * *", // 06:00 AR (la opción timezone de abajo ya interpreta la expresión en hora AR)
    async () => {
      console.log("[cron] Procesando gastos recurrentes...");
      const results = await safeRun("recurringExpenses", () =>
        recurringExpenseService.processDueNow()
      );
      if (results?.length) {
        console.log(`[cron] Gastos recurrentes: ${results.length} tenant(s) procesados.`);
      }
    },
    { timezone: "America/Argentina/Buenos_Aires" }
  );

  // ── Notificaciones de stock bajo ────────────────────────────────────────────
  // Corre a las 07:00 AR todos los días
  cron.schedule(
    "0 7 * * *", // 07:00 AR (la opción timezone de abajo ya interpreta la expresión en hora AR)
    async () => {
      console.log("[cron] Revisando stock bajo...");
      const tenants = await prisma.tenant.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      for (const t of tenants) {
        await safeRun("checkLowStock", () =>
          runWithTenant(t.id, () => notificationService.checkLowStock())
        );
      }
    },
    { timezone: "America/Argentina/Buenos_Aires" }
  );

  // ── Expiración de puntos de fidelización ────────────────────────────────────
  // Corre el día 1 de cada mes a las 03:00 AR
  cron.schedule(
    "0 3 1 * *", // 03:00 AR (la opción timezone de abajo ya interpreta la expresión en hora AR)
    async () => {
      console.log("[cron] Expirando puntos de fidelización inactivos...");
      const tenants = await prisma.tenant.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      for (const t of tenants) {
        await safeRun("expireLoyalty", () =>
          runWithTenant(t.id, () => loyaltyService.expireOldPoints(12))
        );
      }
    },
    { timezone: "America/Argentina/Buenos_Aires" }
  );

  console.log("⏰ Scheduler iniciado (gastos recurrentes, stock bajo, loyalty).");
}
