/**
 * Corrige un problema de scripts/seedDemo1Video.ts: las ventas de hoy se
 * crearon sin pasar `payments` a saleService.create(), asi que ninguna generó
 * su fila de SalePayment (sale.paymentMethod sí quedó bien seteado en la
 * Sale, pero sin SalePayment no hay nada que sumar). El resumen de caja en
 * vivo (cashSessionService.getSessionSummary) agrega justamente
 * SalePayment con method EFECTIVO -- por eso mostraba cashSales: 0 a pesar
 * de haber ventas en efectivo hoy.
 *
 * Este script busca las ventas de hoy sin ningún SalePayment (y que no sean
 * de cuenta corriente) y les crea la fila de pago que les falta, por el
 * total de la venta.
 *
 * Uso: npx ts-node scripts/seedDemo1FixPayments.ts
 */
import prisma from "../src/prisma";

const TENANT_SLUG = "demo-qwq";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`No existe el tenant "${TENANT_SLUG}"`);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const sales = await prisma.sale.findMany({
    where: {
      tenantId: tenant.id,
      createdAt: { gte: todayStart },
      paymentMethod: { not: "CUENTA_CORRIENTE" },
      payments: { none: {} },
    },
    select: { id: true, paymentMethod: true, total: true },
  });

  console.log(`Ventas de hoy sin SalePayment: ${sales.length}`);

  let created = 0;
  for (const sale of sales) {
    await prisma.salePayment.create({
      data: { saleId: sale.id, method: sale.paymentMethod, amount: sale.total },
    });
    created++;
  }
  console.log(`✓ ${created} filas de SalePayment creadas`);
}

main().catch((e) => { console.error("❌ Error:", e); process.exit(1); }).finally(() => prisma.$disconnect());
