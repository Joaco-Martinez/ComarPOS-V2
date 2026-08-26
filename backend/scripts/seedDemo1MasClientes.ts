/**
 * Agrega un par de clientes más y ventas a esos clientes en el tenant demo
 * Demo1 (slug demo-qwq), sobre lo ya cargado por seedDemo1Contabilidad.ts.
 *
 * Uso: npx ts-node scripts/seedDemo1MasClientes.ts
 */
import { CategoryClient, DocumentType } from "@prisma/client";
import prisma from "../src/prisma";
import { runWithTenant } from "../src/context/tenantContext";

const TENANT_SLUG = "demo-qwq"; // "Demo1"

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`No existe el tenant "${TENANT_SLUG}"`);

  const admin = await prisma.user.findFirst({ where: { tenantId: tenant.id, role: "ADMIN" } });
  if (!admin) throw new Error("El tenant no tiene un usuario ADMIN");

  const location = await prisma.businessLocation.findFirst({ where: { tenantId: tenant.id } });
  if (!location) throw new Error("El tenant no tiene ninguna sucursal (BusinessLocation)");

  const today = new Date();
  const curYear = today.getFullYear();
  const curMonth = today.getMonth() + 1;

  await runWithTenant(tenant.id, async () => {
    // ─── Clientes nuevos ────────────────────────────────────────────────
    console.log("👥 Clientes nuevos...");
    const clientDefs = [
      { nombre: "Valeria", apellido: "Suárez", dni: "31998877", documentType: DocumentType.DNI, ivaCondition: "CONSUMIDOR FINAL", category: CategoryClient.Price, isAcc: false, cred: 0, tel: "3515556677" },
      { nombre: "Almacén Don Bosco", apellido: "", dni: "30-65544332-8", documentType: DocumentType.CUIT, ivaCondition: "IVA RESPONSABLE INSCRIPTO", category: CategoryClient.Mayorista, isAcc: true, cred: 90000, tel: "3516667788" },
    ];
    const clients: { id: string; category: CategoryClient }[] = [];
    for (const c of clientDefs) {
      let client = await prisma.client.findFirst({ where: { tenantId: tenant.id, dni: c.dni } });
      if (!client) {
        client = await prisma.client.create({
          data: {
            tenantId: tenant.id, nombre: c.nombre, apellido: c.apellido || null,
            dni: c.dni, documentType: c.documentType, ivaCondition: c.ivaCondition,
            category: c.category, telefono: c.tel,
            isAccountEnabled: c.isAcc, creditLimit: c.cred > 0 ? c.cred : null,
          },
        });
        console.log(`  ✓ Creado: ${c.nombre} ${c.apellido}`.trim());
      } else {
        console.log(`  ↺ Ya existía: ${c.nombre} ${c.apellido}`.trim());
      }
      clients.push({ id: client.id, category: client.category });
    }

    // ─── Productos disponibles (ya cargados por el seed anterior) ────────
    const skus = ["FID-500", "ARR-1000", "ACE-900", "YER-1000", "AZU-1000", "CAF-250", "PAP-004", "SHA-350"];
    const products = await prisma.product.findMany({ where: { tenantId: tenant.id, sku: { in: skus } } });
    if (products.length === 0) throw new Error("No se encontraron los productos del seed anterior — correr primero seedDemo1Contabilidad.ts");
    const bySku = Object.fromEntries(products.map(p => [p.sku!, p]));

    // ─── Ventas para estos clientes ───────────────────────────────────────
    console.log("\n🧾 Ventas...");
    type SaleDef = { clientIdx: number; day: number; items: { sku: string; qty: number }[]; payment: "EFECTIVO" | "TARJETA_DEBITO" | "TRANSFERENCIA" | "QR_MERCADOPAGO" | "TARJETA_CREDITO" };
    const saleDefs: SaleDef[] = [
      { clientIdx: 0, day: 3,  items: [{ sku: "CAF-250", qty: 1 }, { sku: "YER-1000", qty: 1 }], payment: "TARJETA_DEBITO" },
      { clientIdx: 0, day: 9,  items: [{ sku: "FID-500", qty: 2 }, { sku: "AZU-1000", qty: 1 }], payment: "EFECTIVO" },
      { clientIdx: 0, day: 16, items: [{ sku: "SHA-350", qty: 1 }],                              payment: "QR_MERCADOPAGO" },
      { clientIdx: 1, day: 5,  items: [{ sku: "ARR-1000", qty: 30 }, { sku: "ACE-900", qty: 20 }], payment: "TRANSFERENCIA" },
      { clientIdx: 1, day: 12, items: [{ sku: "PAP-004", qty: 25 }, { sku: "FID-500", qty: 40 }], payment: "TRANSFERENCIA" },
      { clientIdx: 1, day: 21, items: [{ sku: "YER-1000", qty: 15 }, { sku: "CAF-250", qty: 10 }], payment: "TARJETA_CREDITO" },
    ];

    let created = 0;
    for (const s of saleDefs) {
      const client = clients[s.clientIdx];
      const isMayorista = client.category === CategoryClient.Mayorista;

      let subtotal = 0;
      const saleItems: { productId: string; quantity: number; price: number; subtotal: number; profit: number; purchasePriceSnapshot: number; priceType: "PRICE" | "WHOLESALE_PRICE"; productNameSnapshot: string; ivaRate: number }[] = [];
      for (const it of s.items) {
        const prod = bySku[it.sku];
        if (!prod) continue;
        const unitPrice = isMayorista ? prod.wholesalePrice : prod.price;
        const sub = round2(unitPrice * it.qty);
        subtotal += sub;
        saleItems.push({
          productId: prod.id, quantity: it.qty, price: unitPrice, subtotal: sub,
          profit: round2((unitPrice - prod.purchasePrice) * it.qty),
          purchasePriceSnapshot: prod.purchasePrice,
          priceType: isMayorista ? "WHOLESALE_PRICE" : "PRICE",
          productNameSnapshot: prod.name,
          ivaRate: prod.ivaRate,
        });
      }
      if (saleItems.length === 0) continue;

      const total = round2(subtotal);
      const grossProfit = round2(saleItems.reduce((a, x) => a + x.profit, 0));
      const saleDate = new Date(curYear, curMonth - 1, s.day, 11 + Math.floor(Math.random() * 8));

      await prisma.sale.create({
        data: {
          tenantId: tenant.id, userId: admin.id, clientId: client.id,
          stockLocationId: location.id, stockLocation: "LOCAL",
          subtotal, total, grossProfit,
          paymentMethod: s.payment, receiptType: "TICKET", status: "COMPLETED",
          createdAt: saleDate, updatedAt: saleDate,
          items: { create: saleItems.map(x => ({
            productId: x.productId, quantity: x.quantity, price: x.price, subtotal: x.subtotal,
            profit: x.profit, purchasePriceSnapshot: x.purchasePriceSnapshot, priceType: x.priceType,
            productNameSnapshot: x.productNameSnapshot, ivaRate: x.ivaRate,
          })) },
          payments: { create: [{ method: s.payment, amount: total }] },
        },
      });
      created++;
    }
    console.log(`  ✓ ${created}/${saleDefs.length} ventas creadas`);
  });

  console.log("\n✅ Listo.");
}

main()
  .catch(e => { console.error("❌ Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
