/**
 * Carga datos de ejemplo de "Contabilidad" (Finanzas, Compras con datos
 * fiscales, Cuenta corriente de proveedores, Libro IVA Digital + Liquidación,
 * Estado de Resultados) en el tenant demo "Demo1" (slug demo-qwq), para
 * poder sacar capturas de esas pantallas ya pobladas.
 *
 * Uso: npx ts-node scripts/seedDemo1Contabilidad.ts
 *
 * Pensado para correr UNA vez sobre este tenant puntual -- no es idempotente
 * a nivel fino (si se corre dos veces, duplica ventas/compras/movimientos de
 * finanzas), aunque productos/clientes/proveedores sí se buscan por nombre
 * antes de crear para no duplicarlos.
 */
import { CategoryFinance, FinanceType, PaymentMethod, CategoryClient, DocumentType } from "@prisma/client";
import prisma from "../src/prisma";
import { runWithTenant } from "../src/context/tenantContext";
import { purchaseService } from "../src/services/purchase.service";
import { financeService } from "../src/services/finance.service";
import { supplierAccountService } from "../src/services/supplierAccount.service";
import { cerrarLiquidacion } from "../src/services/libroIvaDigital/liquidacion.service";

const TENANT_SLUG = "demo-qwq"; // "Demo1"

function dateInMonth(year: number, month1to12: number, day: number, hour = 12) {
  return new Date(year, month1to12 - 1, day, hour, 0, 0);
}

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
  const curMonth = today.getMonth() + 1; // 1-12
  const prevDate = new Date(curYear, curMonth - 2, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = prevDate.getMonth() + 1;

  console.log(`Tenant: ${tenant.name} (${tenant.id})`);
  console.log(`Período actual: ${curMonth}/${curYear} — período anterior: ${prevMonth}/${prevYear}`);

  await runWithTenant(tenant.id, async () => {
    // ─── Productos ────────────────────────────────────────────────────────
    console.log("\n📦 Productos...");
    const prodDefs = [
      { name: "Fideos Matarazzo 500g",     sku: "FID-500",  price: 950,  wp: 760,  cp: 860,  pp: 620 },
      { name: "Arroz Gallo Oro 1kg",       sku: "ARR-1000", price: 1450, wp: 1160, cp: 1310, pp: 980 },
      { name: "Aceite Natura 900ml",       sku: "ACE-900",  price: 2600, wp: 2080, cp: 2340, pp: 1850 },
      { name: "Yerba Playadito 1kg",       sku: "YER-1000", price: 3200, wp: 2560, cp: 2880, pp: 2300 },
      { name: "Azúcar Ledesma 1kg",        sku: "AZU-1000", price: 1300, wp: 1040, cp: 1170, pp: 890 },
      { name: "Café La Virginia 250g",     sku: "CAF-250",  price: 3800, wp: 3040, cp: 3420, pp: 2700 },
      { name: "Papel Higiénico Elite x4",  sku: "PAP-004",  price: 2100, wp: 1680, cp: 1890, pp: 1500 },
      { name: "Shampoo Sedal 350ml",       sku: "SHA-350",  price: 2900, wp: 2320, cp: 2610, pp: 2050 },
    ];
    const products: Record<string, { id: string; purchasePrice: number }> = {};
    for (const p of prodDefs) {
      let prod = await prisma.product.findFirst({ where: { tenantId: tenant.id, sku: p.sku } });
      if (!prod) {
        prod = await prisma.product.create({
          data: {
            tenantId: tenant.id, name: p.name, sku: p.sku,
            price: p.price, wholesalePrice: p.wp, clientPrice: p.cp, purchasePrice: p.pp,
            ivaRate: 21, isActive: true,
          },
        });
        await prisma.productStock.upsert({
          where: { productId_businessLocationId: { productId: prod.id, businessLocationId: location.id } },
          update: {},
          create: { tenantId: tenant.id, productId: prod.id, businessLocationId: location.id, quantity: 200, minQuantity: 10 },
        });
      }
      products[p.sku] = { id: prod.id, purchasePrice: prod.purchasePrice };
    }
    console.log(`  ✓ ${Object.keys(products).length} productos disponibles`);

    // ─── Clientes ─────────────────────────────────────────────────────────
    console.log("\n👥 Clientes...");
    const clientDefs = [
      { nombre: "Distribuidora El Progreso", apellido: "", dni: "30-70998877-4", documentType: DocumentType.CUIT, ivaCondition: "IVA RESPONSABLE INSCRIPTO", category: CategoryClient.Mayorista, isAcc: true, cred: 200000, tel: "3511122334" },
      { nombre: "Mariana", apellido: "López", dni: "34567890", documentType: DocumentType.DNI, ivaCondition: "CONSUMIDOR FINAL", category: CategoryClient.Price, isAcc: false, cred: 0, tel: "3512223344" },
      { nombre: "Diego", apellido: "Fernández", dni: "30112233", documentType: DocumentType.DNI, ivaCondition: "CONSUMIDOR FINAL", category: CategoryClient.Price, isAcc: false, cred: 0, tel: "3513334455" },
      { nombre: "Kiosco Rapidito", apellido: "", dni: "27-33445566-9", documentType: DocumentType.CUIT, ivaCondition: "RESPONSABLE MONOTRIBUTO", category: CategoryClient.Mayorista, isAcc: true, cred: 60000, tel: "3514445566" },
    ];
    const clients: { id: string; nombre: string; dni: string; documentType: DocumentType; category: CategoryClient; ivaCondition: string | null }[] = [];
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
      }
      clients.push({ id: client.id, nombre: `${client.nombre} ${client.apellido ?? ""}`.trim(), dni: client.dni!, documentType: client.documentType, category: client.category, ivaCondition: client.ivaCondition });
    }
    console.log(`  ✓ ${clients.length} clientes disponibles`);

    // ─── Proveedores ──────────────────────────────────────────────────────
    console.log("\n🚚 Proveedores...");
    const supplierDefs = [
      { name: "Distribuidora Sur SRL", cuit: "30-70123456-1", contactName: "Hernán Ríos", phone: "0351-4001122" },
      { name: "Insumos del Centro SA", cuit: "30-71234567-2", contactName: "Paula Vega", phone: "0351-4002233" },
      { name: "Mayorista Norte", cuit: "27-68123456-3", contactName: "Lucas Ibáñez", phone: "0351-4003344" },
    ];
    const suppliers: { id: string; name: string; cuit: string }[] = [];
    for (const s of supplierDefs) {
      let sup = await prisma.supplier.findFirst({ where: { tenantId: tenant.id, name: s.name } });
      if (!sup) {
        sup = await prisma.supplier.create({
          data: { tenantId: tenant.id, name: s.name, cuit: s.cuit, contactName: s.contactName, phone: s.phone, isActive: true },
        });
      }
      suppliers.push({ id: sup.id, name: sup.name, cuit: sup.cuit ?? s.cuit });
    }
    console.log(`  ✓ ${suppliers.length} proveedores disponibles`);

    // ─── Compras (con datos fiscales para el Libro IVA Digital) ───────────
    console.log("\n🛒 Compras...");
    type CompraDef = {
      year: number; month: number; day: number; supplier: number;
      items: { sku: string; qty: number; cost: number }[];
      invoiceType?: number; pos?: number; invoiceNumber?: string;
      ivaPerc?: number; iibbPerc?: number;
    };
    const compraDefs: CompraDef[] = [
      { year: prevYear, month: prevMonth, day: 10, supplier: 0, invoiceType: 1, pos: 3, invoiceNumber: "00003-00012345",
        items: [{ sku: "FID-500", qty: 100, cost: 620 }, { sku: "ARR-1000", qty: 60, cost: 980 }] },
      { year: prevYear, month: prevMonth, day: 18, supplier: 1, invoiceType: 1, pos: 2, invoiceNumber: "00002-00045678", ivaPerc: 1500, iibbPerc: 800,
        items: [{ sku: "ACE-900", qty: 40, cost: 1850 }, { sku: "YER-1000", qty: 50, cost: 2300 }] },
      { year: prevYear, month: prevMonth, day: 25, supplier: 2, invoiceType: 6, pos: 1, invoiceNumber: "00001-00078901",
        items: [{ sku: "AZU-1000", qty: 80, cost: 890 }, { sku: "CAF-250", qty: 30, cost: 2700 }] },
      { year: curYear, month: curMonth, day: 3, supplier: 0, invoiceType: 1, pos: 3, invoiceNumber: "00003-00012399", ivaPerc: 900,
        items: [{ sku: "PAP-004", qty: 60, cost: 1500 }, { sku: "SHA-350", qty: 40, cost: 2050 }] },
      { year: curYear, month: curMonth, day: 10, supplier: 1, invoiceType: 1, pos: 2, invoiceNumber: "00002-00045699",
        items: [{ sku: "FID-500", qty: 80, cost: 620 }, { sku: "ARR-1000", qty: 50, cost: 980 }] },
      { year: curYear, month: curMonth, day: 15, supplier: 2, invoiceType: 6, pos: 1, invoiceNumber: "00001-00078950",
        items: [{ sku: "ACE-900", qty: 30, cost: 1850 }] },
      // A propósito sin datos fiscales -- para mostrar el aviso de "datos faltantes" del Libro IVA Compras.
      { year: curYear, month: curMonth, day: 5, supplier: 0,
        items: [{ sku: "YER-1000", qty: 20, cost: 2300 }] },
    ];

    let comprasCreated = 0;
    for (const c of compraDefs) {
      const supplier = suppliers[c.supplier];
      try {
        await purchaseService.create({
          supplierId: supplier.id,
          providerName: supplier.name,
          businessLocationId: location.id,
          date: dateInMonth(c.year, c.month, c.day),
          paymentMethod: PaymentMethod.TRANSFERENCIA,
          providerCuit: c.invoiceType ? supplier.cuit : undefined,
          invoiceType: c.invoiceType,
          invoicePointOfSale: c.pos,
          invoiceNumber: c.invoiceNumber,
          ivaPerceptionAmount: c.ivaPerc,
          iibbPerceptionAmount: c.iibbPerc,
          items: c.items.map(i => ({ productId: products[i.sku].id, quantity: i.qty, unitCost: i.cost, ivaRate: 21 })),
        }, admin.id);
        comprasCreated++;
      } catch (err) {
        console.error(`  ✗ Error en compra ${supplier.name} ${c.day}/${c.month}:`, (err as Error).message);
      }
    }
    console.log(`  ✓ ${comprasCreated}/${compraDefs.length} compras creadas (generan deuda automática a c/proveedor)`);

    // ─── Pago parcial a un proveedor (cuenta corriente) ────────────────────
    console.log("\n💸 Pago a proveedor...");
    try {
      await supplierAccountService.registerPayment({
        supplierId: suppliers[0].id,
        amount: 60000,
        method: PaymentMethod.TRANSFERENCIA,
        userId: admin.id,
        description: `Pago parcial a ${suppliers[0].name}`,
        createFinance: true,
      });
      console.log(`  ✓ Pago de $60.000 registrado a ${suppliers[0].name}`);
    } catch (err) {
      console.error("  ✗ Error registrando el pago:", (err as Error).message);
    }

    // ─── Ventas (algunas facturadas, para el Libro IVA / Liquidación) ─────
    console.log("\n🧾 Ventas...");
    type SaleDef = {
      year: number; month: number; day: number; clientIdx: number | null;
      items: { sku: string; qty: number }[]; payment: PaymentMethod; invoice?: 1 | 6 | 11;
    };
    const saleDefs: SaleDef[] = [
      { year: prevYear, month: prevMonth, day: 3,  clientIdx: 0,    items: [{ sku: "FID-500", qty: 30 }, { sku: "ARR-1000", qty: 20 }], payment: PaymentMethod.TRANSFERENCIA, invoice: 1 },
      { year: prevYear, month: prevMonth, day: 5,  clientIdx: null, items: [{ sku: "ACE-900", qty: 2 }, { sku: "AZU-1000", qty: 3 }],   payment: PaymentMethod.EFECTIVO },
      { year: prevYear, month: prevMonth, day: 8,  clientIdx: 1,    items: [{ sku: "CAF-250", qty: 1 }, { sku: "YER-1000", qty: 1 }],   payment: PaymentMethod.TARJETA_DEBITO, invoice: 6 },
      { year: prevYear, month: prevMonth, day: 12, clientIdx: null, items: [{ sku: "PAP-004", qty: 2 }],                                payment: PaymentMethod.EFECTIVO },
      { year: prevYear, month: prevMonth, day: 15, clientIdx: 3,    items: [{ sku: "FID-500", qty: 40 }, { sku: "AZU-1000", qty: 30 }], payment: PaymentMethod.TRANSFERENCIA, invoice: 6 },
      { year: prevYear, month: prevMonth, day: 18, clientIdx: 2,    items: [{ sku: "SHA-350", qty: 1 }, { sku: "CAF-250", qty: 1 }],    payment: PaymentMethod.QR_MERCADOPAGO },
      { year: prevYear, month: prevMonth, day: 22, clientIdx: null, items: [{ sku: "ARR-1000", qty: 2 }, { sku: "ACE-900", qty: 1 }],   payment: PaymentMethod.EFECTIVO },
      { year: prevYear, month: prevMonth, day: 27, clientIdx: 1,    items: [{ sku: "YER-1000", qty: 2 }],                               payment: PaymentMethod.TARJETA_CREDITO, invoice: 6 },

      { year: curYear, month: curMonth, day: 2,  clientIdx: 0,    items: [{ sku: "ACE-900", qty: 25 }, { sku: "YER-1000", qty: 30 }], payment: PaymentMethod.TRANSFERENCIA, invoice: 1 },
      { year: curYear, month: curMonth, day: 4,  clientIdx: null, items: [{ sku: "FID-500", qty: 3 }],                                payment: PaymentMethod.EFECTIVO },
      { year: curYear, month: curMonth, day: 7,  clientIdx: 2,    items: [{ sku: "CAF-250", qty: 2 }, { sku: "AZU-1000", qty: 2 }],   payment: PaymentMethod.TARJETA_DEBITO, invoice: 6 },
      { year: curYear, month: curMonth, day: 10, clientIdx: 3,    items: [{ sku: "PAP-004", qty: 25 }, { sku: "SHA-350", qty: 20 }],  payment: PaymentMethod.TRANSFERENCIA, invoice: 6 },
      { year: curYear, month: curMonth, day: 14, clientIdx: null, items: [{ sku: "ARR-1000", qty: 2 }, { sku: "YER-1000", qty: 1 }],  payment: PaymentMethod.EFECTIVO },
      { year: curYear, month: curMonth, day: 17, clientIdx: 1,    items: [{ sku: "FID-500", qty: 50 }],                               payment: PaymentMethod.TRANSFERENCIA, invoice: 1 },
      { year: curYear, month: curMonth, day: 20, clientIdx: null, items: [{ sku: "CAF-250", qty: 1 }],                                payment: PaymentMethod.QR_MERCADOPAGO },
      { year: curYear, month: curMonth, day: 23, clientIdx: 2,    items: [{ sku: "SHA-350", qty: 1 }, { sku: "ACE-900", qty: 1 }],    payment: PaymentMethod.TARJETA_CREDITO },
    ];

    const invoiceCounters: Record<number, number> = { 1: 1, 6: 1, 11: 1 };
    let ventasCreated = 0;
    let invoicesCreated = 0;

    for (const s of saleDefs) {
      const client = s.clientIdx !== null ? clients[s.clientIdx] : null;
      const isMayorista = client?.category === CategoryClient.Mayorista;

      let subtotal = 0;
      const saleItems: { productId: string; quantity: number; price: number; subtotal: number; profit: number; purchasePriceSnapshot: number; priceType: "PRICE" | "WHOLESALE_PRICE"; productNameSnapshot: string; ivaRate: number }[] = [];
      for (const it of s.items) {
        const prod = await prisma.product.findFirst({ where: { id: products[it.sku].id } });
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
      const saleDate = dateInMonth(s.year, s.month, s.day, 11 + Math.floor(Math.random() * 8));

      const sale = await prisma.sale.create({
        data: {
          tenantId: tenant.id, userId: admin.id, clientId: client?.id ?? null,
          stockLocationId: location.id, stockLocation: "LOCAL",
          subtotal, total, grossProfit,
          paymentMethod: s.payment, receiptType: "TICKET", status: "COMPLETED",
          isInvoiced: !!s.invoice, invoiceStatus: s.invoice ? "INVOICED" : "NONE",
          createdAt: saleDate, updatedAt: saleDate,
          items: { create: saleItems.map(x => ({
            productId: x.productId, quantity: x.quantity, price: x.price, subtotal: x.subtotal,
            profit: x.profit, purchasePriceSnapshot: x.purchasePriceSnapshot, priceType: x.priceType,
            productNameSnapshot: x.productNameSnapshot, ivaRate: x.ivaRate,
          })) },
          payments: { create: [{ method: s.payment, amount: total }] },
        },
      });
      ventasCreated++;

      if (s.invoice) {
        const tipo = s.invoice;
        const numero = invoiceCounters[tipo]++;
        const neto = round2(total / 1.21);
        const iva = round2(total - neto);
        const tipoDoc = client?.documentType === DocumentType.CUIT ? 80 : 96;
        const nroDoc = BigInt((client?.dni ?? "0").replace(/\D/g, "") || "0");
        const condicionIVAReceptor = client?.ivaCondition === "IVA RESPONSABLE INSCRIPTO" ? 1
          : client?.ivaCondition === "RESPONSABLE MONOTRIBUTO" ? 6 : 5;
        const cae = `7${String(Date.now()).slice(-13)}`;
        const caeVto = new Date(saleDate.getTime() + 10 * 86400000);

        await prisma.invoiceAfip.create({
          data: {
            tenantId: tenant.id, saleId: sale.id,
            cuit: "20304050607", puntoVenta: 1, tipoComprobante: tipo,
            tipoDoc, nroDoc, numero, fechaEmision: saleDate,
            resultado: "A", cae, caeVto, total, neto, iva, condicionIVAReceptor,
          },
        });
        invoicesCreated++;
      }
    }
    console.log(`  ✓ ${ventasCreated}/${saleDefs.length} ventas creadas (${invoicesCreated} facturadas con CAE de ejemplo)`);

    // ─── Finanzas (ingresos/egresos) ───────────────────────────────────────
    console.log("\n📊 Finanzas...");
    const financeAccounts = await prisma.financeAccount.findMany({ where: { tenantId: tenant.id, isSystem: true } });
    const accountIdByCategory: Partial<Record<CategoryFinance, string>> = {};
    const labelByCategory: Record<string, CategoryFinance> = {
      "Alquiler local 1": CategoryFinance.AlquilerL1, "Sueldos": CategoryFinance.Sueldos,
      "Alarma": CategoryFinance.Alarma, "Impuestos": CategoryFinance.Impuestos,
      "Contadora": CategoryFinance.Contadora, "Publicidad": CategoryFinance.Publicidad,
      "Otro": CategoryFinance.Otro, "Cobranza": CategoryFinance.COBRANZA,
      "Materia prima": CategoryFinance.MateriaPrima,
    };
    for (const acc of financeAccounts) {
      const cat = labelByCategory[acc.name];
      if (cat) accountIdByCategory[cat] = acc.id;
    }

    const financeDefs: { year: number; month: number; day: number; type: FinanceType; cat: CategoryFinance; amount: number; desc: string }[] = [
      { year: prevYear, month: prevMonth, day: 1,  type: FinanceType.EGRESO, cat: CategoryFinance.AlquilerL1, amount: 180000, desc: "Alquiler local" },
      { year: prevYear, month: prevMonth, day: 5,  type: FinanceType.EGRESO, cat: CategoryFinance.Sueldos,    amount: 420000, desc: "Sueldos del equipo" },
      { year: prevYear, month: prevMonth, day: 5,  type: FinanceType.EGRESO, cat: CategoryFinance.Alarma,     amount: 15000,  desc: "Alarma Prosegur" },
      { year: prevYear, month: prevMonth, day: 10, type: FinanceType.EGRESO, cat: CategoryFinance.Impuestos,  amount: 60000,  desc: "Monotributo" },
      { year: prevYear, month: prevMonth, day: 10, type: FinanceType.EGRESO, cat: CategoryFinance.Contadora,  amount: 35000,  desc: "Honorarios contadora" },
      { year: prevYear, month: prevMonth, day: 15, type: FinanceType.EGRESO, cat: CategoryFinance.Publicidad, amount: 40000,  desc: "Publicidad redes" },
      { year: prevYear, month: prevMonth, day: 20, type: FinanceType.EGRESO, cat: CategoryFinance.Otro,       amount: 12000,  desc: "Mantenimiento" },
      { year: prevYear, month: prevMonth, day: 22, type: FinanceType.INGRESO, cat: CategoryFinance.COBRANZA,  amount: 30000,  desc: "Cobro cuenta corriente cliente" },

      { year: curYear, month: curMonth, day: 1,  type: FinanceType.EGRESO, cat: CategoryFinance.AlquilerL1, amount: 185000, desc: "Alquiler local" },
      { year: curYear, month: curMonth, day: 5,  type: FinanceType.EGRESO, cat: CategoryFinance.Sueldos,    amount: 430000, desc: "Sueldos del equipo" },
      { year: curYear, month: curMonth, day: 5,  type: FinanceType.EGRESO, cat: CategoryFinance.Alarma,     amount: 15000,  desc: "Alarma Prosegur" },
      { year: curYear, month: curMonth, day: 10, type: FinanceType.EGRESO, cat: CategoryFinance.Impuestos,  amount: 60000,  desc: "Monotributo" },
      { year: curYear, month: curMonth, day: 10, type: FinanceType.EGRESO, cat: CategoryFinance.Contadora,  amount: 35000,  desc: "Honorarios contadora" },
      { year: curYear, month: curMonth, day: 14, type: FinanceType.EGRESO, cat: CategoryFinance.Publicidad, amount: 25000,  desc: "Publicidad redes" },
      { year: curYear, month: curMonth, day: 16, type: FinanceType.EGRESO, cat: CategoryFinance.MateriaPrima, amount: 18000, desc: "Insumos varios" },
      { year: curYear, month: curMonth, day: 19, type: FinanceType.EGRESO, cat: CategoryFinance.Otro,       amount: 9000,   desc: "Mantenimiento" },
    ];

    for (const f of financeDefs) {
      await financeService.create({
        type: f.type, amount: f.amount, category: f.cat,
        financeAccountId: accountIdByCategory[f.cat] ?? null,
        description: f.desc, date: dateInMonth(f.year, f.month, f.day),
        paymentMethod: PaymentMethod.TRANSFERENCIA,
      }, admin.id);
    }
    console.log(`  ✓ ${financeDefs.length} registros de finanzas`);

    // ─── Cerrar la Liquidación de IVA del período anterior ─────────────────
    console.log("\n📘 Cerrando Liquidación de IVA del período anterior...");
    try {
      const settlement = await cerrarLiquidacion({ year: prevYear, month: prevMonth, userId: admin.id });
      console.log(`  ✓ ${prevMonth}/${prevYear} cerrado — saldo técnico: $${settlement.saldoTecnico} (${settlement.resultado})`);
      console.log(`  ℹ El período ${curMonth}/${curYear} queda en BORRADOR (se recalcula solo, con el arrastre del anterior)`);
    } catch (err) {
      console.error("  ✗ No se pudo cerrar la liquidación del período anterior:", (err as Error).message);
    }
  });

  console.log("\n✅ Listo. Datos de ejemplo cargados en el tenant Demo1.");
}

main()
  .catch(e => { console.error("❌ Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
