/**
 * Carga datos de ejemplo "de una vez" en el tenant demo Demo1 (slug
 * demo-qwq) para poder grabar un video mostrando el sistema poblado:
 * categorías + productos nuevos, stock con alertas de stock bajo, ventas de
 * hoy (efectivo/tarjeta/transferencia/QR/cuenta corriente), una caja abierta
 * con movimiento real, órdenes de servicio en distintos estados (incluida
 * una entregada/cobrada), y un par de promociones activas.
 *
 * Complementa (no reemplaza) scripts/seedDemo1Contabilidad.ts y
 * scripts/seedDemo1MasClientes.ts, que ya cargaron productos base, clientes,
 * proveedores, compras y ventas fiscales de meses anteriores.
 *
 * Uso: npx ts-node scripts/seedDemo1Video.ts
 *
 * Pensado para correr UNA vez -- ventas, órdenes de servicio y la sesión de
 * caja no son idempotentes (correrlo dos veces las duplica). Productos y
 * categorías sí se buscan por sku/slug antes de crear.
 */
import { PaymentMethod, ReceiptType, SaleStatus, DiscountType, PromotionType } from "@prisma/client";
import prisma from "../src/prisma";
import { runWithTenant } from "../src/context/tenantContext";
import { saleService } from "../src/services/sale.service";
import { cashSessionService } from "../src/services/cashSession.service";
import { repairOrderService } from "../src/services/repairOrder.service";
import { promotionService } from "../src/services/promotion.service";
import alertService from "../src/services/alert.service";

const TENANT_SLUG = "demo-qwq"; // "Demo1"
const CAT_PREFIX = "demo1"; // slug de ProductCategory es global-unico, se namespacea para no chocar con otro tenant

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

  console.log(`Tenant: ${tenant.name} (${tenant.id}) — sucursal: ${location.name}`);

  await runWithTenant(tenant.id, async () => {
    // ─── 1) Categorías ──────────────────────────────────────────────────────
    console.log("\n🗂️  Categorías...");
    const categoryDefs = [
      { name: "Almacén", slug: `${CAT_PREFIX}-almacen`, description: "Comida seca, condimentos y despensa" },
      { name: "Bebidas", slug: `${CAT_PREFIX}-bebidas`, description: "Gaseosas, aguas y cervezas" },
      { name: "Limpieza", slug: `${CAT_PREFIX}-limpieza`, description: "Productos de limpieza para el hogar" },
      { name: "Kiosco y golosinas", slug: `${CAT_PREFIX}-kiosco`, description: "Golosinas, alfajores y chicles" },
      { name: "Perfumería e higiene", slug: `${CAT_PREFIX}-perfumeria`, description: "Higiene personal y perfumería" },
    ];
    const categories: Record<string, string> = {};
    for (const c of categoryDefs) {
      let cat = await prisma.productCategory.findUnique({ where: { slug: c.slug } });
      if (!cat) {
        cat = await prisma.productCategory.create({
          data: { tenantId: tenant.id, name: c.name, slug: c.slug, description: c.description, isActive: true },
        });
      }
      categories[c.name] = cat.id;
    }
    console.log(`  ✓ ${Object.keys(categories).length} categorías disponibles`);

    // ─── 2) Asignar categoría a los productos ya cargados ──────────────────
    const existingCategoryBySku: Record<string, string> = {
      "FID-500": "Almacén", "ARR-1000": "Almacén", "ACE-900": "Almacén",
      "YER-1000": "Almacén", "AZU-1000": "Almacén", "CAF-250": "Almacén",
      "PAP-004": "Limpieza", "SHA-350": "Perfumería e higiene",
    };
    for (const [sku, catName] of Object.entries(existingCategoryBySku)) {
      await prisma.product.updateMany({
        where: { tenantId: tenant.id, sku, categoryId: null },
        data: { categoryId: categories[catName] },
      });
    }

    // ─── 3) Productos nuevos ────────────────────────────────────────────────
    console.log("\n📦 Productos nuevos...");
    type ProdDef = { name: string; sku: string; price: number; category: string; stock: number; minStock: number };
    const prodDefs: ProdDef[] = [
      { name: "Coca-Cola 2.25L",            sku: "COC-225", price: 3200, category: "Bebidas", stock: 120, minStock: 10 },
      { name: "Agua Villavicencio 2L",       sku: "AGU-2L",  price: 1400, category: "Bebidas", stock: 150, minStock: 15 },
      { name: "Cerveza Quilmes 1L",          sku: "CER-1L",  price: 2200, category: "Bebidas", stock: 90,  minStock: 10 },
      { name: "Detergente Magistral 750ml",  sku: "DET-750", price: 1800, category: "Limpieza", stock: 100, minStock: 10 },
      { name: "Lavandina Ayudín 1L",         sku: "LAV-1L",  price: 1100, category: "Limpieza", stock: 2,   minStock: 10 }, // stock bajo a propósito (alerta)
      { name: "Jabón en Polvo Skip 800g",    sku: "JAB-800", price: 3400, category: "Limpieza", stock: 80,  minStock: 10 },
      { name: "Alfajor Jorgito",             sku: "ALF-001", price: 850,  category: "Kiosco y golosinas", stock: 200, minStock: 20 },
      { name: "Chocolate Águila 150g",       sku: "CHO-150", price: 2100, category: "Kiosco y golosinas", stock: 110, minStock: 10 },
      { name: "Chicles Beldent",             sku: "CHI-001", price: 600,  category: "Kiosco y golosinas", stock: 250, minStock: 20 },
      { name: "Jabón Dove 90g",              sku: "JDV-090", price: 1200, category: "Perfumería e higiene", stock: 130, minStock: 10 },
      { name: "Desodorante Rexona 150ml",    sku: "DES-150", price: 2600, category: "Perfumería e higiene", stock: 4,   minStock: 10 }, // stock bajo a propósito (alerta)
      { name: "Pasta Dental Colgate 90g",    sku: "PAS-090", price: 1900, category: "Perfumería e higiene", stock: 140, minStock: 10 },
    ];

    const productIdBySku: Record<string, string> = {};
    for (const p of prodDefs) {
      let prod = await prisma.product.findFirst({ where: { tenantId: tenant.id, sku: p.sku } });
      if (!prod) {
        prod = await prisma.product.create({
          data: {
            tenantId: tenant.id, name: p.name, sku: p.sku, categoryId: categories[p.category],
            price: p.price, wholesalePrice: round2(p.price * 0.8), clientPrice: round2(p.price * 0.9),
            purchasePrice: round2(p.price * 0.65), ivaRate: 21, isActive: true,
          },
        });
      }
      await prisma.productStock.upsert({
        where: { productId_businessLocationId: { productId: prod.id, businessLocationId: location.id } },
        update: { quantity: p.stock, minQuantity: p.minStock },
        create: { tenantId: tenant.id, productId: prod.id, businessLocationId: location.id, quantity: p.stock, minQuantity: p.minStock },
      });
      productIdBySku[p.sku] = prod.id;
    }
    console.log(`  ✓ ${prodDefs.length} productos nuevos (con stock cargado)`);

    // Las ventas de hoy (paso 5) también usan SKUs de los productos ya
    // cargados por seedDemo1Contabilidad.ts (FID-500, ARR-1000, etc.) -- hay
    // que sumarlos al mapa sku->id, si no esas ventas se saltean en silencio
    // (el filtro de items las deja vacías y `if (items.length === 0) continue`
    // no loguea nada).
    const existingProducts = await prisma.product.findMany({
      where: { tenantId: tenant.id, sku: { not: null } },
      select: { id: true, sku: true },
    });
    for (const p of existingProducts) {
      if (p.sku && !productIdBySku[p.sku]) productIdBySku[p.sku] = p.id;
    }

    // También bajamos el stock de dos productos ya existentes, para que las
    // alertas no sean solo de productos nuevos.
    const existingLowStock: { sku: string; qty: number; min: number }[] = [
      { sku: "CAF-250", qty: 3, min: 10 },
      { sku: "PAP-004", qty: 1, min: 10 },
    ];
    for (const low of existingLowStock) {
      const prod = await prisma.product.findFirst({ where: { tenantId: tenant.id, sku: low.sku } });
      if (!prod) continue;
      await prisma.productStock.updateMany({
        where: { tenantId: tenant.id, productId: prod.id, businessLocationId: location.id },
        data: { quantity: low.qty, minQuantity: low.min },
      });
    }

    // ─── 4) Caja: abrir sesión de hoy ANTES de las ventas de hoy ───────────
    // (el resumen de caja agrega ventas en efectivo con createdAt >= openedAt,
    // asi que la sesion tiene que existir antes de que se generen esas ventas)
    console.log("\n💰 Caja...");
    let cashSessionOpened = false;
    try {
      await cashSessionService.openSession({
        userId: admin.id, businessLocationId: location.id, openingBalance: 80000,
        notes: "Apertura de demo para video",
      });
      cashSessionOpened = true;
      console.log("  ✓ Caja abierta (apertura $80.000)");
    } catch (err) {
      console.log(`  ↺ ${(err as Error).message}`);
    }

    // ─── 5) Ventas de hoy (via saleService: descuenta stock real, genera
    //         movimientos de stock, ingreso en Finanzas y puntos de fidelidad) ─
    console.log("\n🧾 Ventas de hoy...");
    const clients = await prisma.client.findMany({ where: { tenantId: tenant.id } });
    const byName = (n: string) => clients.find((c) => c.nombre === n)?.id;
    const marianaId = byName("Mariana");
    const diegoId = byName("Diego");
    const valeriaId = byName("Valeria");
    const kioscoRapiditoId = byName("Kiosco Rapidito"); // cuenta corriente

    type TodaySale = {
      clientId?: string; items: { sku: string; qty: number }[];
      paymentMethod: PaymentMethod; payments?: { method: PaymentMethod; amount: number }[];
    };
    const todaySales: TodaySale[] = [
      { items: [{ sku: "COC-225", qty: 2 }, { sku: "ALF-001", qty: 3 }], paymentMethod: PaymentMethod.EFECTIVO },
      { items: [{ sku: "FID-500", qty: 3 }, { sku: "ACE-900", qty: 1 }], paymentMethod: PaymentMethod.EFECTIVO, clientId: marianaId },
      { items: [{ sku: "JAB-800", qty: 1 }, { sku: "DET-750", qty: 1 }], paymentMethod: PaymentMethod.TARJETA_DEBITO },
      { items: [{ sku: "CER-1L", qty: 4 }, { sku: "CHI-001", qty: 5 }], paymentMethod: PaymentMethod.EFECTIVO },
      { items: [{ sku: "PAS-090", qty: 2 }, { sku: "JDV-090", qty: 2 }], paymentMethod: PaymentMethod.TARJETA_CREDITO, clientId: diegoId },
      { items: [{ sku: "AGU-2L", qty: 6 }], paymentMethod: PaymentMethod.QR_MERCADOPAGO },
      { items: [{ sku: "YER-1000", qty: 2 }, { sku: "AZU-1000", qty: 1 }], paymentMethod: PaymentMethod.TRANSFERENCIA, clientId: valeriaId },
      { items: [{ sku: "CHO-150", qty: 4 }, { sku: "ALF-001", qty: 6 }], paymentMethod: PaymentMethod.EFECTIVO },
      { items: [{ sku: "ARR-1000", qty: 20 }, { sku: "ACE-900", qty: 10 }], paymentMethod: PaymentMethod.CUENTA_CORRIENTE, clientId: kioscoRapiditoId },
    ];

    let created = 0;
    for (const s of todaySales) {
      const items = s.items
        .filter((it) => productIdBySku[it.sku])
        .map((it) => ({ productId: productIdBySku[it.sku], quantity: it.qty }));
      if (items.length === 0) continue;
      try {
        await saleService.create({
          userId: admin.id, clientId: s.clientId, businessLocationId: location.id, stockLocationId: location.id,
          paymentMethod: s.paymentMethod, receiptType: ReceiptType.TICKET, status: SaleStatus.COMPLETED,
          items, payments: s.payments,
        });
        created++;
      } catch (err) {
        console.error(`  ✗ Error en venta:`, (err as Error).message);
      }
    }
    console.log(`  ✓ ${created}/${todaySales.length} ventas de hoy creadas`);

    // Un par de movimientos manuales de caja, ahora que ya hay ventas en efectivo adentro.
    if (cashSessionOpened) {
      const session = await cashSessionService.getOpenSession(admin.id, location.id);
      if (session) {
        await cashSessionService.addMovement({
          sessionId: session.id, type: "WITHDRAWAL", amount: 5000, description: "Retiro para pago de flete",
        });
        console.log("  ✓ Movimiento de caja: retiro $5.000");
      }
    }

    // ─── 6) Una sesión de caja cerrada de ayer, para el historial ──────────
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const openedYesterday = new Date(yesterday); openedYesterday.setHours(9, 0, 0, 0);
    const closedYesterday = new Date(yesterday); closedYesterday.setHours(21, 30, 0, 0);
    await prisma.cashSession.create({
      data: {
        tenantId: tenant.id, userId: admin.id, businessLocationId: location.id, status: "CLOSED",
        openedAt: openedYesterday, closedAt: closedYesterday,
        openingBalance: 60000, expectedBalance: 143500, actualBalance: 142800, difference: -700,
        notes: "Apertura", closeNotes: "Cierre con pequeña diferencia de vuelto",
        movements: {
          create: [
            { type: "OPENING", amount: 60000, description: "Apertura de caja", createdAt: openedYesterday },
            { type: "WITHDRAWAL", amount: -8000, description: "Pago proveedor menor", createdAt: new Date(yesterday.setHours(15, 0, 0, 0)) },
          ],
        },
      },
    });
    console.log("  ✓ Sesión de caja cerrada de ayer (para el historial)");

    // ─── 7) Alertas de stock bajo (reales, via alertService) ───────────────
    console.log("\n🔔 Alertas de stock bajo...");
    const alerts = await alertService.checkAllProductsStock();
    console.log(`  ✓ ${alerts.length} alertas generadas`);

    // ─── 8) Servicios (RepairOrder) en distintos estados ───────────────────
    console.log("\n🔧 Servicios / reparaciones...");
    try {
      // a) Recién recibida, sin presupuestar todavía.
      await repairOrderService.create({
        clientId: diegoId, businessLocationId: location.id,
        deviceType: "Celular", deviceBrand: "Samsung", deviceModel: "Galaxy A34",
        reportedIssue: "No enciende, pantalla completamente negra",
        deviceAccessories: "Cargador",
      });

      // b) Presupuestada, pendiente de que el cliente la apruebe.
      const notebook = await repairOrderService.create({
        clientId: marianaId, businessLocationId: location.id,
        deviceType: "Notebook", deviceBrand: "HP", deviceModel: "Pavilion 15",
        reportedIssue: "No carga la batería, se apaga sola",
      });
      await repairOrderService.addItem(notebook.id, { type: "PART", description: "Batería compatible HP Pavilion", quantity: 1, unitPrice: 45000 });
      await repairOrderService.addItem(notebook.id, { type: "LABOR", description: "Mano de obra - diagnóstico y cambio", quantity: 1, unitPrice: 12000 });

      // c) Aprobada por el cliente, todavía no arrancó el técnico.
      const tablet = await repairOrderService.create({
        clientId: valeriaId, businessLocationId: location.id,
        deviceType: "Tablet", deviceBrand: "Samsung", deviceModel: "Tab A9",
        reportedIssue: "Pantalla rota, no responde al tacto",
      });
      await repairOrderService.addItem(tablet.id, { type: "PART", description: "Módulo táctil + vidrio Tab A9", quantity: 1, unitPrice: 38000 });
      await repairOrderService.addItem(tablet.id, { type: "LABOR", description: "Mano de obra - cambio de módulo", quantity: 1, unitPrice: 15000 });
      await repairOrderService.setStatus(tablet.id, "APPROVED");

      // d) Aprobada y en reparación ahora mismo.
      const celular2 = await repairOrderService.create({
        clientId: diegoId, businessLocationId: location.id,
        deviceType: "Celular", deviceBrand: "Motorola", deviceModel: "Moto G54",
        reportedIssue: "Cambio de batería, no dura ni medio día",
      });
      await repairOrderService.addItem(celular2.id, { type: "PART", description: "Batería compatible Moto G54", quantity: 1, unitPrice: 22000 });
      await repairOrderService.addItem(celular2.id, { type: "LABOR", description: "Mano de obra", quantity: 1, unitPrice: 8000 });
      await repairOrderService.setStatus(celular2.id, "APPROVED");
      await repairOrderService.setStatus(celular2.id, "IN_PROGRESS");

      // e) Ciclo completo: aprobada, reparada, entregada y cobrada (genera una Sale).
      const parlante = await repairOrderService.create({
        clientId: marianaId, businessLocationId: location.id,
        deviceType: "Parlante bluetooth", deviceBrand: "JBL", deviceModel: "Charge 5",
        reportedIssue: "No prende, no carga",
      });
      await repairOrderService.addItem(parlante.id, { type: "PART", description: "Conector de carga JBL Charge 5", quantity: 1, unitPrice: 9000 });
      await repairOrderService.addItem(parlante.id, { type: "LABOR", description: "Mano de obra", quantity: 1, unitPrice: 6000 });
      await repairOrderService.setStatus(parlante.id, "APPROVED");
      await repairOrderService.setStatus(parlante.id, "IN_PROGRESS");
      await repairOrderService.setStatus(parlante.id, "READY");
      await repairOrderService.checkout(
        parlante.id,
        { paymentMethod: "EFECTIVO", receiptType: "TICKET", businessLocationId: location.id, stockLocationId: location.id },
        admin.id
      );

      console.log("  ✓ 5 órdenes de servicio (recibida, presupuestada, aprobada, en reparación, entregada)");
    } catch (err) {
      console.error("  ✗ Error cargando servicios:", (err as Error).message);
    }

    // ─── 9) Promociones activas ─────────────────────────────────────────────
    console.log("\n🏷️  Promociones...");
    const now = new Date();
    const in15d = new Date(now.getTime() + 15 * 86400000);
    const in30d = new Date(now.getTime() + 30 * 86400000);
    try {
      await promotionService.create({
        name: "10% off en compras +$20.000", type: PromotionType.CART_DISCOUNT,
        discountValue: 10, discountType: DiscountType.PERCENTAGE,
        startsAt: now, endsAt: in30d, minAmount: 20000,
      });
      await promotionService.create({
        name: "15% off en Bebidas", type: PromotionType.CATEGORY_DISCOUNT,
        discountValue: 15, discountType: DiscountType.PERCENTAGE,
        startsAt: now, endsAt: in15d, categoryIds: [categories["Bebidas"]],
      });
      console.log("  ✓ 2 promociones activas");
    } catch (err) {
      console.error("  ✗ Error cargando promociones:", (err as Error).message);
    }
  });

  console.log("\n✅ Listo. Demo1 (demo-qwq) queda con categorías, productos, alertas de stock, ventas de hoy, caja abierta, servicios y promociones para el video.");

  // saleService.create() dispara loyaltyService.earnPoints() y la generación
  // del PDF del ticket "fire and forget" (sin esperarlos) -- si el proceso
  // desconecta el cliente de Prisma antes de que terminen, tiran "Engine is
  // not yet connected". No afecta la venta en sí (ya se guardó adentro del
  // await de saleService.create), pero les da un respiro para no ensuciar
  // el log con esos errores inofensivos.
  await new Promise((r) => setTimeout(r, 2000));
}

main()
  .catch((e) => { console.error("❌ Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
