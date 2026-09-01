/**
 * Backfill uso-unico (doc "listas de precios"): crea la lista "Minorista"
 * default de cada tenant existente (si no la tiene) y una PriceListItem por
 * cada producto activo, espejando su price/pricePerKg actual. Despues de
 * correr esto, product.write.ts mantiene todo sincronizado solo.
 *
 * Uso: npx ts-node src/scripts/backfillDefaultPriceLists.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function run() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

  console.log(`Tenants encontrados: ${tenants.length}`);

  for (const tenant of tenants) {
    let list = await prisma.priceList.findFirst({
      where: { tenantId: tenant.id, isDefault: true },
    });

    if (!list) {
      list = await prisma.priceList.create({
        data: {
          tenantId: tenant.id,
          name: "Minorista",
          description: "Lista principal (venta al público) - se sincroniza con el precio del producto",
          isDefault: true,
          isActive: true,
        },
      });
      console.log(`  [${tenant.name}] lista Minorista creada (${list.id})`);
    }

    const products = await prisma.product.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, price: true, pricePerKg: true },
    });

    let synced = 0;

    for (const product of products) {
      await prisma.priceListItem.upsert({
        where: {
          priceListId_productId: { priceListId: list.id, productId: product.id },
        },
        update: { price: product.price, pricePerKg: product.pricePerKg },
        create: {
          priceListId: list.id,
          productId: product.id,
          price: product.price,
          pricePerKg: product.pricePerKg,
        },
      });
      synced++;
    }

    console.log(`  [${tenant.name}] ${synced} productos sincronizados en Minorista`);
  }

  // Productos sin tenant (tenantId null, datos legacy pre-multitenant) -
  // tambien necesitan una lista Minorista propia (tenantId: null) para no
  // quedar fuera del mecanismo.
  const orphanProducts = await prisma.product.findMany({
    where: { tenantId: null },
    select: { id: true, price: true, pricePerKg: true },
  });

  if (orphanProducts.length > 0) {
    let orphanList = await prisma.priceList.findFirst({
      where: { tenantId: null, isDefault: true },
    });

    if (!orphanList) {
      orphanList = await prisma.priceList.create({
        data: {
          tenantId: null,
          name: "Minorista",
          description: "Lista principal (venta al público) - se sincroniza con el precio del producto",
          isDefault: true,
          isActive: true,
        },
      });
      console.log(`[sin tenant] lista Minorista creada (${orphanList.id})`);
    }

    for (const product of orphanProducts) {
      await prisma.priceListItem.upsert({
        where: {
          priceListId_productId: { priceListId: orphanList.id, productId: product.id },
        },
        update: { price: product.price, pricePerKg: product.pricePerKg },
        create: {
          priceListId: orphanList.id,
          productId: product.id,
          price: product.price,
          pricePerKg: product.pricePerKg,
        },
      });
    }

    console.log(`[sin tenant] ${orphanProducts.length} productos sincronizados en Minorista`);
  }

  console.log("Listo.");
}

run()
  .catch((err) => {
    console.error("Error en backfill:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
