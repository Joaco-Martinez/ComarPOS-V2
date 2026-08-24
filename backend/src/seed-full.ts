/**
 * Seed completo — como si el negocio llevara 90 días usando el sistema.
 * Ejecutar con: npx ts-node src/seed-full.ts
 */
import {
  PrismaClient, Role, CategoryClient, PaymentMethod, ReceiptType,
  SaleStatus, FinanceType, CategoryFinance, PurchaseStatus,
  MovementType, BusinessLocationType, CashSessionStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function hoursAgo(h: number) {
  const d = new Date();
  d.setHours(d.getHours() - h);
  return d;
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seed completo iniciando...\n");

  const slug = process.env.DEFAULT_TENANT_SLUG ?? "grupo-vj";
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`Tenant "${slug}" no existe. Corré las migraciones primero.`);
  const tId = tenant.id;

  // ─── Usuarios ──────────────────────────────────────────────────────────────
  console.log("👤 Creando usuarios...");
  const pw = await bcrypt.hash("admin123", 10);
  const pw2 = await bcrypt.hash("empleado123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@grupovj.com" },
    update: { name: "Administrador", role: Role.ADMIN, password: pw },
    create: { email: "admin@grupovj.com", password: pw, name: "Administrador", role: Role.ADMIN, tenantId: tId },
  });

  const cajera = await prisma.user.upsert({
    where: { email: "cajera@grupovj.com" },
    update: { name: "Valentina Pérez", role: Role.EMPLEADO },
    create: { email: "cajera@grupovj.com", password: pw2, name: "Valentina Pérez", role: Role.EMPLEADO, tenantId: tId },
  });

  const vendedor = await prisma.user.upsert({
    where: { email: "vendedor@grupovj.com" },
    update: { name: "Marcos Rodríguez", role: Role.EMPLEADO },
    create: { email: "vendedor@grupovj.com", password: pw2, name: "Marcos Rodríguez", role: Role.EMPLEADO, tenantId: tId },
  });
  console.log("  ✓ admin@grupovj.com / admin123");
  console.log("  ✓ cajera@grupovj.com / empleado123");
  console.log("  ✓ vendedor@grupovj.com / empleado123");

  // ─── Sucursales ────────────────────────────────────────────────────────────
  console.log("\n🏪 Creando sucursales...");
  let local = await prisma.businessLocation.findFirst({ where: { tenantId: tId, name: "Local Principal" } });
  if (!local) {
    local = await prisma.businessLocation.create({
      data: {
        tenantId: tId, name: "Local Principal", type: BusinessLocationType.BRANCH,
        addressStreet: "Av. San Martín", addressNumber: "1450",
        addressCity: "Córdoba", addressProvince: "Córdoba",
        isDefault: true, isActive: true,
      },
    });
  }
  let deposito = await prisma.businessLocation.findFirst({ where: { tenantId: tId, name: "Depósito Central" } });
  if (!deposito) {
    deposito = await prisma.businessLocation.create({
      data: {
        tenantId: tId, name: "Depósito Central", type: BusinessLocationType.WAREHOUSE,
        addressStreet: "Ruta Nacional 9", addressNumber: "km 12",
        addressCity: "Córdoba", addressProvince: "Córdoba",
        isDefault: false, isActive: true,
      },
    });
  }
  console.log("  ✓ Local Principal (BRANCH)");
  console.log("  ✓ Depósito Central (WAREHOUSE)");

  // ─── Categorías ────────────────────────────────────────────────────────────
  console.log("\n📂 Creando categorías...");
  const catDefs = [
    { name: "Bebidas",       slug: "bebidas-gvj",    description: "Gaseosas, aguas, jugos, cervezas" },
    { name: "Snacks",        slug: "snacks-gvj",     description: "Papas fritas, galletas, golosinas" },
    { name: "Lácteos",       slug: "lacteos-gvj",    description: "Leche, yogur, quesos, manteca" },
    { name: "Panificados",   slug: "panificados-gvj", description: "Pan, galletitas, facturas, tortas" },
    { name: "Limpieza",      slug: "limpieza-gvj",   description: "Detergentes, lavandina, desinfectantes" },
    { name: "Ferretería",    slug: "ferreteria-gvj", description: "Tornillos, pegamentos, herramientas menores" },
  ];
  const cats: Record<string, string> = {};
  for (const c of catDefs) {
    const existing = await prisma.productCategory.findFirst({ where: { tenantId: tId, slug: c.slug } });
    const cat = existing ?? await prisma.productCategory.create({
      data: { tenantId: tId, name: c.name, slug: c.slug, description: c.description, isActive: true },
    });
    cats[c.name] = cat.id;
  }
  console.log(`  ✓ ${catDefs.length} categorías`);

  // ─── Productos ─────────────────────────────────────────────────────────────
  console.log("\n📦 Creando productos...");
  const prodDefs = [
    // Bebidas
    { name: "Coca-Cola 1.5L",        sku: "COC-1500", cat: "Bebidas",     price: 1850,  wp: 1450,  cp: 1650, pp: 1100, sl: 48, sd: 120, ms: 24 },
    { name: "Sprite 1.5L",           sku: "SPR-1500", cat: "Bebidas",     price: 1750,  wp: 1380,  cp: 1570, pp: 1050, sl: 36, sd: 80,  ms: 18 },
    { name: "Agua Mineral 500ml",     sku: "AGU-500",  cat: "Bebidas",     price: 780,   wp: 600,   cp: 700,  pp: 440,  sl: 72, sd: 200, ms: 36 },
    { name: "Jugo Cepita Naranja 1L", sku: "CEP-NAR",  cat: "Bebidas",     price: 1350,  wp: 1060,  cp: 1200, pp: 790,  sl: 30, sd: 60,  ms: 12 },
    { name: "Cerveza Quilmes 1L",     sku: "QUI-1000", cat: "Bebidas",     price: 2100,  wp: 1650,  cp: 1900, pp: 1200, sl: 24, sd: 48,  ms: 12 },
    { name: "Fanta Naranja 500ml",    sku: "FAN-500",  cat: "Bebidas",     price: 900,   wp: 700,   cp: 810,  pp: 530,  sl: 48, sd: 96,  ms: 24 },
    // Snacks
    { name: "Papas Fritas Lays 95g",  sku: "LAY-095",  cat: "Snacks",      price: 1200,  wp: 940,   cp: 1080, pp: 700,  sl: 40, sd: 80,  ms: 20 },
    { name: "Galletas Oreo 118g",     sku: "ORE-118",  cat: "Snacks",      price: 1450,  wp: 1140,  cp: 1300, pp: 850,  sl: 30, sd: 60,  ms: 15 },
    { name: "Maní con Sal 100g",      sku: "MAN-100",  cat: "Snacks",      price: 850,   wp: 660,   cp: 760,  pp: 490,  sl: 50, sd: 100, ms: 25 },
    { name: "Alfajor Jorgito",        sku: "ALF-JOR",  cat: "Snacks",      price: 650,   wp: 510,   cp: 590,  pp: 380,  sl: 60, sd: 0,   ms: 30 },
    { name: "Chocolinas 200g",        sku: "CHO-200",  cat: "Snacks",      price: 1100,  wp: 860,   cp: 990,  pp: 640,  sl: 35, sd: 70,  ms: 18 },
    // Lácteos
    { name: "Leche Entera SanCor 1L", sku: "SAN-1000", cat: "Lácteos",    price: 1400,  wp: 1100,  cp: 1260, pp: 820,  sl: 40, sd: 80,  ms: 20 },
    { name: "Yogur Ser Natural 190g", sku: "SER-190",  cat: "Lácteos",    price: 780,   wp: 610,   cp: 700,  pp: 450,  sl: 28, sd: 0,   ms: 14 },
    { name: "Queso Cremoso La Serenísima 200g", sku: "SER-QCR", cat: "Lácteos", price: 2800, wp: 2200, cp: 2520, pp: 1650, sl: 15, sd: 30, ms: 8 },
    { name: "Manteca La Serenísima 200g", sku: "SER-MAN", cat: "Lácteos", price: 2400,  wp: 1880,  cp: 2160, pp: 1400, sl: 20, sd: 40,  ms: 10 },
    // Panificados
    { name: "Pan de Molde Bimbo 500g", sku: "BIM-500", cat: "Panificados", price: 1650,  wp: 1300,  cp: 1490, pp: 960,  sl: 22, sd: 0,   ms: 11 },
    { name: "Galletitas Surtidas 250g", sku: "GAL-250", cat: "Panificados", price: 1050, wp: 820,   cp: 945,  pp: 610,  sl: 30, sd: 60,  ms: 15 },
    // Limpieza
    { name: "Detergente Magistral 1L", sku: "MAG-1000", cat: "Limpieza",   price: 1800,  wp: 1410,  cp: 1620, pp: 1050, sl: 25, sd: 50,  ms: 12 },
    { name: "Lavandina Ayudín 1L",    sku: "AYU-1000", cat: "Limpieza",   price: 1100,  wp: 860,   cp: 990,  pp: 640,  sl: 30, sd: 60,  ms: 15 },
    { name: "Jabón líquido Dove 220ml", sku: "DOV-220", cat: "Limpieza",   price: 2200,  wp: 1730,  cp: 1980, pp: 1290, sl: 20, sd: 40,  ms: 10 },
    // Ferretería
    { name: "Tornillos 6x50mm (x50)", sku: "TOR-050",  cat: "Ferretería", price: 1500,  wp: 1170,  cp: 1350, pp: 870,  sl: 18, sd: 50,  ms: 9 },
    { name: "Pegamento Bostik 17g",   sku: "BOS-017",  cat: "Ferretería", price: 750,   wp: 590,   cp: 680,  pp: 440,  sl: 25, sd: 30,  ms: 12 },
  ];

  const products: Record<string, string> = {}; // sku → id
  for (const p of prodDefs) {
    const existing = await prisma.product.findFirst({ where: { tenantId: tId, sku: p.sku } });
    const prod = existing ?? await prisma.product.create({
      data: {
        tenantId: tId, name: p.name, sku: p.sku,
        categoryId: cats[p.cat],
        price: p.price, wholesalePrice: p.wp, clientPrice: p.cp, purchasePrice: p.pp,
        isActive: true,
      },
    });
    products[p.sku] = prod.id;

    if (!existing) {
      await prisma.productStock.upsert({
        where: { productId_businessLocationId: { productId: prod.id, businessLocationId: local.id } },
        update: {},
        create: { tenantId: tId, productId: prod.id, businessLocationId: local.id, quantity: p.sl, minQuantity: p.ms },
      });
      await prisma.productStock.upsert({
        where: { productId_businessLocationId: { productId: prod.id, businessLocationId: deposito.id } },
        update: {},
        create: { tenantId: tId, productId: prod.id, businessLocationId: deposito.id, quantity: p.sd },
      });
    }
  }
  console.log(`  ✓ ${prodDefs.length} productos`);

  // ─── Proveedores ───────────────────────────────────────────────────────────
  console.log("\n🚚 Creando proveedores...");
  let prov1 = await prisma.supplier.findFirst({ where: { tenantId: tId, name: "Distribuidora Norte S.A." } });
  if (!prov1) {
    prov1 = await prisma.supplier.create({
      data: {
        tenantId: tId, name: "Distribuidora Norte S.A.", cuit: "30-71234567-8",
        contactName: "Roberto Gutiérrez", phone: "0351-4551234",
        email: "pedidos@distnorte.com", address: "Ruta 9 km 5, Córdoba",
        isActive: true,
      },
    });
  }
  let prov2 = await prisma.supplier.findFirst({ where: { tenantId: tId, name: "Mayorista del Oeste" } });
  if (!prov2) {
    prov2 = await prisma.supplier.create({
      data: {
        tenantId: tId, name: "Mayorista del Oeste", cuit: "30-68901234-5",
        contactName: "Silvia Méndez", phone: "0351-4669900",
        email: "compras@mayoristaoeeste.com", address: "Av. Colón 3200, Córdoba",
        isActive: true,
      },
    });
  }
  console.log("  ✓ Distribuidora Norte S.A.");
  console.log("  ✓ Mayorista del Oeste");

  // ─── Clientes ──────────────────────────────────────────────────────────────
  console.log("\n👥 Creando clientes...");
  const clientDefs = [
    { nombre: "Carla",    apellido: "Fernández",  dni: "35812345", gmail: "carla.fern@gmail.com",      category: CategoryClient.Price,     tel: "3512345678", cred: 0,     isAcc: false },
    { nombre: "Jorge",   apellido: "Blanco",      dni: "27654321", gmail: "jorge.blanco@gmail.com",    category: CategoryClient.Price,     tel: "3519876543", cred: 0,     isAcc: false },
    { nombre: "Supermercado El Barrio", apellido: "", dni: "30111222", gmail: "compras@elbarrio.com", category: CategoryClient.Mayorista, tel: "3514567890", cred: 80000, isAcc: true },
    { nombre: "Almacén",  apellido: "Don Pedro",  dni: "20445566", gmail: "donpedro@hotmail.com",     category: CategoryClient.Mayorista, tel: "3513456789", cred: 50000, isAcc: true },
    { nombre: "Lucía",   apellido: "Medina",      dni: "39203040", gmail: "lumedina@gmail.com",       category: CategoryClient.Price,     tel: "3512233445", cred: 0,     isAcc: false },
    { nombre: "Martín",  apellido: "Torres",      dni: "32987654", gmail: "martintor@gmail.com",      category: CategoryClient.Price,     tel: "3516677889", cred: 0,     isAcc: false },
    { nombre: "Kiosco",  apellido: "La Esquina",  dni: "27778899", gmail: "kioscolaesquina@gmail.com", category: CategoryClient.Mayorista, tel: "3519988776", cred: 30000, isAcc: true },
    { nombre: "Roxana",  apellido: "Juárez",      dni: "28112233", gmail: "roxana.j@gmail.com",       category: CategoryClient.Price,     tel: "3511234321", cred: 0,     isAcc: false },
  ];

  const clientIds: string[] = [];
  for (const c of clientDefs) {
    try {
      const existing = await prisma.client.findFirst({ where: { tenantId: tId, dni: c.dni } });
      const client = existing ?? await prisma.client.create({
        data: {
          tenantId: tId, nombre: c.nombre, apellido: c.apellido, dni: c.dni,
          gmail: c.gmail, telefono: c.tel, category: c.category,
          creditLimit: c.cred > 0 ? c.cred : null, isAccountEnabled: c.isAcc,
        },
      });
      clientIds.push(client.id);
      // loyalty account para clientes individuales
      if (c.category === CategoryClient.Price) {
        const existing = await prisma.loyaltyAccount.findUnique({ where: { clientId: client.id } });
        if (!existing) {
          await prisma.loyaltyAccount.create({ data: { clientId: client.id, points: randInt(50, 800) } });
        }
      }
    } catch {}
  }
  console.log(`  ✓ ${clientIds.length} clientes`);

  // ─── Compras (ingresos de stock) ───────────────────────────────────────────
  console.log("\n🛒 Creando compras...");
  const compraDefs = [
    { daysBack: 85, supplier: prov1.id, provName: "Distribuidora Norte S.A.", amount: 185000, items: [
      { sku: "COC-1500", qty: 48, price: 1100 }, { sku: "SPR-1500", qty: 24, price: 1050 },
      { sku: "AGU-500",  qty: 96, price: 440 },  { sku: "CEP-NAR",  qty: 24, price: 790 },
    ]},
    { daysBack: 60, supplier: prov2.id, provName: "Mayorista del Oeste", amount: 220000, items: [
      { sku: "LAY-095",  qty: 60, price: 700 },  { sku: "ORE-118",  qty: 48, price: 850 },
      { sku: "ALF-JOR",  qty: 96, price: 380 },  { sku: "CHO-200",  qty: 36, price: 640 },
      { sku: "MAN-100",  qty: 48, price: 490 },
    ]},
    { daysBack: 40, supplier: prov1.id, provName: "Distribuidora Norte S.A.", amount: 160000, items: [
      { sku: "SAN-1000", qty: 48, price: 820 },  { sku: "SER-190",  qty: 36, price: 450 },
      { sku: "SER-QCR",  qty: 24, price: 1650 }, { sku: "SER-MAN",  qty: 24, price: 1400 },
    ]},
    { daysBack: 20, supplier: prov2.id, provName: "Mayorista del Oeste", amount: 130000, items: [
      { sku: "MAG-1000", qty: 30, price: 1050 }, { sku: "AYU-1000", qty: 36, price: 640 },
      { sku: "DOV-220",  qty: 24, price: 1290 }, { sku: "BIM-500",  qty: 24, price: 960 },
    ]},
    { daysBack: 5, supplier: prov1.id, provName: "Distribuidora Norte S.A.", amount: 95000, items: [
      { sku: "COC-1500", qty: 36, price: 1100 }, { sku: "QUI-1000", qty: 24, price: 1200 },
      { sku: "FAN-500",  qty: 48, price: 530 },  { sku: "AGU-500",  qty: 72, price: 440 },
    ]},
  ];

  for (const comp of compraDefs) {
    const existing = await prisma.purchase.findFirst({
      where: { tenantId: tId, supplierId: comp.supplier, date: daysAgo(comp.daysBack) }
    });
    if (existing) continue;
    const purchase = await prisma.purchase.create({
      data: {
        tenantId: tId, supplierId: comp.supplier, providerName: comp.provName,
        totalAmount: comp.amount, paymentMethod: PaymentMethod.TRANSFERENCIA,
        businessLocationId: deposito.id, status: PurchaseStatus.COMPLETED,
        userId: admin.id, date: daysAgo(comp.daysBack),
        items: {
          create: comp.items.map(i => ({
            productId: products[i.sku], quantity: i.qty,
            unitCost: i.price, subtotal: i.qty * i.price,
          })),
        },
      },
    });
    // Stock movements
    for (const i of comp.items) {
      await prisma.stockMovement.create({
        data: {
          tenantId: tId, productId: products[i.sku], userId: admin.id,
          purchaseId: purchase.id, type: MovementType.INGRESS,
          toLocationId: deposito.id, quantity: i.qty, reason: "Compra a proveedor",
          createdAt: daysAgo(comp.daysBack),
        },
      });
    }
  }
  console.log(`  ✓ ${compraDefs.length} compras con movimientos de stock`);

  // ─── Sesiones de caja ─────────────────────────────────────────────────────
  console.log("\n💰 Creando sesiones de caja...");
  const sessionDefs = [
    { daysBack: 3, user: cajera.id,   opening: 5000,   closing: 82000 },
    { daysBack: 2, user: vendedor.id, opening: 5000,   closing: 74000 },
    { daysBack: 1, user: cajera.id,   opening: 10000,  closing: 95000 },
  ];
  const cashSessionIds: string[] = [];
  for (const s of sessionDefs) {
    const existing = await prisma.cashSession.findFirst({
      where: { tenantId: tId, userId: s.user, openedAt: daysAgo(s.daysBack) }
    });
    const sess = existing ?? await prisma.cashSession.create({
      data: {
        tenantId: tId, userId: s.user, businessLocationId: local.id,
        status: CashSessionStatus.CLOSED, openingBalance: s.opening,
        expectedBalance: s.closing, actualBalance: s.closing - randInt(-500, 500),
        openedAt: daysAgo(s.daysBack), closedAt: new Date(daysAgo(s.daysBack).getTime() + 8 * 3600000),
      },
    });
    cashSessionIds.push(sess.id);
  }
  // Sesión abierta hoy
  const openSessExisting = await prisma.cashSession.findFirst({
    where: { tenantId: tId, userId: cajera.id, status: CashSessionStatus.OPEN }
  });
  if (!openSessExisting) {
    const openSess = await prisma.cashSession.create({
      data: {
        tenantId: tId, userId: cajera.id, businessLocationId: local.id,
        status: CashSessionStatus.OPEN, openingBalance: 8000,
        openedAt: hoursAgo(4),
      },
    });
    cashSessionIds.push(openSess.id);
  }
  console.log(`  ✓ ${cashSessionIds.length + 1} sesiones de caja (1 abierta)`);

  // ─── Ventas ────────────────────────────────────────────────────────────────
  console.log("\n🧾 Creando historial de ventas (90 días)...");

  const skus = Object.keys(products);
  const payMethods = [PaymentMethod.EFECTIVO, PaymentMethod.EFECTIVO, PaymentMethod.EFECTIVO, PaymentMethod.TARJETA_DEBITO, PaymentMethod.TARJETA_CREDITO, PaymentMethod.QR_MERCADOPAGO, PaymentMethod.TRANSFERENCIA];
  const userIds = [cajera.id, cajera.id, vendedor.id];
  // clientes frecuentes para mayoristas
  const mayoristasIds = clientIds.slice(2, 4).concat([clientIds[6]]);
  const particularesIds = clientIds.filter(id => !mayoristasIds.includes(id));

  let salesCount = 0;
  for (let day = 90; day >= 0; day--) {
    const date = daysAgo(day);
    // Los fines de semana menos ventas
    const isWeekend = [0, 6].includes(date.getDay());
    const numSales = isWeekend ? randInt(3, 7) : randInt(6, 14);

    for (let i = 0; i < numSales; i++) {
      const isMayorista = Math.random() < 0.2;
      const clientId = isMayorista
        ? randFrom(mayoristasIds)
        : (Math.random() < 0.6 ? randFrom(particularesIds) : undefined);

      const numItems = randInt(1, 5);
      const itemSkus = [...skus].sort(() => Math.random() - 0.5).slice(0, numItems);
      const payMethod = randFrom(payMethods);

      let subtotal = 0;
      const saleItems: { productId: string; quantity: number; price: number; subtotal: number; profit: number; purchasePriceSnapshot: number; priceType: 'PRICE' | 'WHOLESALE_PRICE'; productNameSnapshot: string }[] = [];

      for (const sku of itemSkus) {
        const def = prodDefs.find(p => p.sku === sku)!;
        const qty = randInt(1, isMayorista ? 6 : 3);
        const unitPrice = isMayorista ? def.wp : def.price;
        const sub = unitPrice * qty;
        subtotal += sub;
        saleItems.push({
          productId: products[sku],
          quantity: qty, price: unitPrice, subtotal: sub,
          profit: (unitPrice - def.pp) * qty,
          purchasePriceSnapshot: def.pp,
          priceType: isMayorista ? 'WHOLESALE_PRICE' : 'PRICE',
          productNameSnapshot: def.name,
        });
      }

      const total = subtotal;
      const grossProfit = saleItems.reduce((a, s) => a + s.profit, 0);

      const saleDate = new Date(date);
      saleDate.setHours(randInt(9, 20), randInt(0, 59));

      try {
        await prisma.sale.create({
          data: {
            tenantId: tId,
            userId: randFrom(userIds),
            clientId: clientId ?? null,
            businessLocationId: local.id,
            subtotal, total, grossProfit,
            paymentMethod: payMethod,
            receiptType: ReceiptType.TICKET,
            status: SaleStatus.COMPLETED,
            stockLocationId: local.id,
            createdAt: saleDate, updatedAt: saleDate,
            items: {
              create: saleItems.map(s => ({
                productId: s.productId, quantity: s.quantity, price: s.price,
                subtotal: s.subtotal, profit: s.profit,
                purchasePriceSnapshot: s.purchasePriceSnapshot,
                priceType: s.priceType,
                productNameSnapshot: s.productNameSnapshot,
              })),
            },
            payments: {
              create: [{ method: payMethod, amount: total }],
            },
          },
        });
        salesCount++;
      } catch {}
    }
  }
  console.log(`  ✓ ~${salesCount} ventas creadas`);

  // ─── Finanzas ──────────────────────────────────────────────────────────────
  console.log("\n📊 Creando registros de finanzas...");
  const financeDefs = [
    { type: FinanceType.EGRESO, cat: CategoryFinance.AlquilerL1,     amount: 150000, desc: "Alquiler local enero",        days: 80 },
    { type: FinanceType.EGRESO, cat: CategoryFinance.AlquilerL1,     amount: 150000, desc: "Alquiler local febrero",       days: 50 },
    { type: FinanceType.EGRESO, cat: CategoryFinance.AlquilerL1,     amount: 155000, desc: "Alquiler local marzo",         days: 20 },
    { type: FinanceType.EGRESO, cat: CategoryFinance.Sueldos,        amount: 320000, desc: "Sueldos empleados enero",      days: 79 },
    { type: FinanceType.EGRESO, cat: CategoryFinance.Sueldos,        amount: 320000, desc: "Sueldos empleados febrero",    days: 49 },
    { type: FinanceType.EGRESO, cat: CategoryFinance.Sueldos,        amount: 340000, desc: "Sueldos empleados marzo",      days: 19 },
    { type: FinanceType.EGRESO, cat: CategoryFinance.Alarma,         amount: 18000,  desc: "Alarma Prosegur - enero",      days: 78 },
    { type: FinanceType.EGRESO, cat: CategoryFinance.Alarma,         amount: 18000,  desc: "Alarma Prosegur - febrero",    days: 48 },
    { type: FinanceType.EGRESO, cat: CategoryFinance.Impuestos,      amount: 45000,  desc: "Monotributo enero",            days: 77 },
    { type: FinanceType.EGRESO, cat: CategoryFinance.Impuestos,      amount: 45000,  desc: "Monotributo febrero",          days: 47 },
    { type: FinanceType.EGRESO, cat: CategoryFinance.Contadora,      amount: 22000,  desc: "Honorarios contadora enero",   days: 76 },
    { type: FinanceType.EGRESO, cat: CategoryFinance.Contadora,      amount: 22000,  desc: "Honorarios contadora febrero", days: 46 },
    { type: FinanceType.EGRESO, cat: CategoryFinance.Publicidad,     amount: 35000,  desc: "Publicidad Instagram - Q1",    days: 60 },
    { type: FinanceType.EGRESO, cat: CategoryFinance.Otro,           amount: 8500,   desc: "Mantenimiento heladera",       days: 35 },
    { type: FinanceType.INGRESO, cat: CategoryFinance.COBRANZA,      amount: 75000,  desc: "Cobro cuenta Supermercado El Barrio", days: 55 },
    { type: FinanceType.INGRESO, cat: CategoryFinance.COBRANZA,      amount: 45000,  desc: "Cobro cuenta Almacén Don Pedro", days: 30 },
  ];

  for (const f of financeDefs) {
    await prisma.finance.create({
      data: {
        tenantId: tId, type: f.type, category: f.cat, amount: f.amount,
        description: f.desc, date: daysAgo(f.days), paymentMethod: PaymentMethod.TRANSFERENCIA,
      },
    });
  }
  console.log(`  ✓ ${financeDefs.length} registros de finanzas`);

  // ─── Resultado ─────────────────────────────────────────────────────────────
  console.log("\n✅ Seed completo finalizado.");
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║           USUARIOS CREADOS                       ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log("║  admin@grupovj.com       → admin123   (ADMIN)   ║");
  console.log("║  cajera@grupovj.com      → empleado123 (EMPLEADO)║");
  console.log("║  vendedor@grupovj.com    → empleado123 (EMPLEADO)║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\n  Productos: ${prodDefs.length} | Categorías: ${catDefs.length}`);
  console.log(`  Clientes: ${clientDefs.length} | Proveedores: 2`);
  console.log(`  Compras: ${compraDefs.length} | Finanzas: ${financeDefs.length}`);
  console.log(`  Ventas: ~${salesCount} (90 días de historial)\n`);
}

main()
  .catch(e => { console.error("❌ Error en seed-full:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
