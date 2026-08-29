/**
 * Catch-up puntual: scripts/seedDemo1Video.ts salteó en silencio las 3
 * ventas de hoy que usaban SKUs de productos viejos (FID-500, ARR-1000,
 * etc.) porque el mapa sku->id de ese paso solo tenía los 12 productos
 * nuevos -- ya está corregido ahí para la próxima corrida, esto sólo carga
 * las 3 ventas que faltaron en la corrida ya hecha.
 *
 * Uso: npx ts-node scripts/seedDemo1VideoFix.ts
 */
import { PaymentMethod, ReceiptType, SaleStatus } from "@prisma/client";
import prisma from "../src/prisma";
import { runWithTenant } from "../src/context/tenantContext";
import { saleService } from "../src/services/sale.service";

const TENANT_SLUG = "demo-qwq";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`No existe el tenant "${TENANT_SLUG}"`);
  const admin = await prisma.user.findFirst({ where: { tenantId: tenant.id, role: "ADMIN" } });
  if (!admin) throw new Error("El tenant no tiene un usuario ADMIN");
  const location = await prisma.businessLocation.findFirst({ where: { tenantId: tenant.id } });
  if (!location) throw new Error("El tenant no tiene ninguna sucursal (BusinessLocation)");

  await runWithTenant(tenant.id, async () => {
    const products = await prisma.product.findMany({ where: { tenantId: tenant.id, sku: { not: null } }, select: { id: true, sku: true } });
    const productIdBySku: Record<string, string> = {};
    for (const p of products) if (p.sku) productIdBySku[p.sku] = p.id;

    const clients = await prisma.client.findMany({ where: { tenantId: tenant.id } });
    const byName = (n: string) => clients.find((c) => c.nombre === n)?.id;

    type TodaySale = { clientId?: string; items: { sku: string; qty: number }[]; paymentMethod: PaymentMethod };
    const missingSales: TodaySale[] = [
      { items: [{ sku: "FID-500", qty: 3 }, { sku: "ACE-900", qty: 1 }], paymentMethod: PaymentMethod.EFECTIVO, clientId: byName("Mariana") },
      { items: [{ sku: "YER-1000", qty: 2 }, { sku: "AZU-1000", qty: 1 }], paymentMethod: PaymentMethod.TRANSFERENCIA, clientId: byName("Valeria") },
      { items: [{ sku: "ARR-1000", qty: 20 }, { sku: "ACE-900", qty: 10 }], paymentMethod: PaymentMethod.CUENTA_CORRIENTE, clientId: byName("Kiosco Rapidito") },
    ];

    let created = 0;
    for (const s of missingSales) {
      const items = s.items.map((it) => ({ productId: productIdBySku[it.sku], quantity: it.qty })).filter((it) => it.productId);
      if (items.length === 0) { console.log("  ✗ items sin resolver, skip"); continue; }
      try {
        await saleService.create({
          userId: admin.id, clientId: s.clientId, businessLocationId: location.id, stockLocationId: location.id,
          paymentMethod: s.paymentMethod, receiptType: ReceiptType.TICKET, status: SaleStatus.COMPLETED,
          items,
        });
        created++;
      } catch (err) {
        console.error("  ✗ Error en venta:", (err as Error).message);
      }
    }
    console.log(`✓ ${created}/${missingSales.length} ventas faltantes creadas`);
  });
}

main().catch((e) => { console.error("❌ Error:", e); process.exit(1); }).finally(() => prisma.$disconnect());
