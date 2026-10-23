/* Datos de ejemplo fiscales para el tenant Demo1 (slug demo-qwq), octubre 2026. */
import "dotenv/config";
import fs from "fs";
import prisma from "../prisma";
import { calcularIvaPorAlicuota } from "../afip/utils/ivaAlicuotas";
import { priceListService } from "../services/priceList.service";

const TENANT = "8cb0d3d3-5814-444c-b120-a15bd986cbac";
const MARK = "Dato de ejemplo (contador)";
const OUT = process.argv[2];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const day = (d: number, h = 15) => new Date(`2026-10-${String(d).padStart(2, "0")}T${h}:00:00.000Z`);
let caeSeq = 0;
const fakeCae = () => `7642${String(Date.now()).slice(-8)}${String(caeSeq++).padStart(2, "0")}`;

type Line = { name: string; qty: number };
type SaleSpec = {
  day: number;
  client?: string; // nombre del cliente
  invoice?: "A" | "B";
  condicion?: number;
  method: "EFECTIVO" | "TARJETA" | "TRANSFERENCIA" | "QR";
  discountPct?: number;
  lines: Line[];
};

(async () => {
  const already = await prisma.salePayment.count({ where: { notes: MARK, sale: { tenantId: TENANT } } });
  if (already > 0) throw new Error("Los datos de ejemplo ya fueron cargados en Demo1");

  const created: Record<string, string[]> = { products: [], sales: [], invoices: [], purchases: [] };
  // Se guarda despues de cada alta: si algo falla a mitad, queda la lista para limpiar.
  const track = (kind: string, id: string) => {
    created[kind].push(id);
    fs.writeFileSync(OUT, JSON.stringify(created, null, 2));
  };
  const admin = await prisma.user.findFirst({ where: { tenantId: TENANT, role: "ADMIN" }, select: { id: true } });
  const location = await prisma.businessLocation.findFirst({ where: { tenantId: TENANT, isDefault: true }, select: { id: true } });
  const refInvoice = await prisma.invoiceAfip.findFirst({ where: { tenantId: TENANT, resultado: "A" }, select: { cuit: true, puntoVenta: true } });
  if (!admin || !location || !refInvoice) throw new Error("Demo1 sin admin, sucursal o facturas previas");

  // Productos al 10,5% (alimentos) para que haya mas de una alicuota.
  const newProducts = [
    { name: "Harina Pureza 000 1kg", price: 1250, purchasePrice: 800 },
    { name: "Pan Lactal Fargo 550g", price: 2900, purchasePrice: 1900 },
  ];
  for (const p of newProducts) {
    const exists = await prisma.product.findFirst({ where: { tenantId: TENANT, name: p.name } });
    if (exists) continue;
    const prod = await prisma.product.create({
      data: { tenantId: TENANT, name: p.name, price: p.price, wholesalePrice: p.price, clientPrice: p.price, purchasePrice: p.purchasePrice, ivaRate: 10.5 },
    });
    await priceListService.syncDefaultPriceListItem(TENANT, { id: prod.id, price: prod.price, pricePerKg: null });
    track('products', prod.id);
  }

  const products = await prisma.product.findMany({ where: { tenantId: TENANT, isActive: true }, select: { id: true, name: true, price: true, purchasePrice: true, ivaRate: true, sku: true } });
  const product = (name: string) => {
    const p = products.find((x) => x.name === name);
    if (!p) throw new Error(`Producto no encontrado: ${name}`);
    return p;
  };
  const clients = await prisma.client.findMany({ where: { tenantId: TENANT }, select: { id: true, nombre: true, dni: true } });
  const client = (nombre: string) => clients.find((c) => c.nombre === nombre)!;

  const lastNum = async (tipo: number) =>
    (await prisma.invoiceAfip.aggregate({ where: { cuit: refInvoice.cuit, puntoVenta: refInvoice.puntoVenta, tipoComprobante: tipo }, _max: { numero: true } }))._max.numero ?? 0;
  const next: Record<number, number> = { 1: await lastNum(1), 6: await lastNum(6), 8: await lastNum(8) };

  const sales: SaleSpec[] = [
    { day: 2, invoice: "B", method: "EFECTIVO", lines: [{ name: "Coca-Cola 2.25L", qty: 2 }, { name: "Pan Lactal Fargo 550g", qty: 1 }, { name: "Harina Pureza 000 1kg", qty: 2 }] },
    { day: 3, client: "Distribuidora El Progreso", invoice: "A", condicion: 1, method: "TRANSFERENCIA", lines: [{ name: "Yerba Playadito 1kg", qty: 10 }, { name: "Azúcar Ledesma 1kg", qty: 10 }, { name: "Harina Pureza 000 1kg", qty: 20 }] },
    { day: 5, client: "Olivia", invoice: "B", condicion: 5, method: "TARJETA", lines: [{ name: "Café La Virginia 250g", qty: 1 }, { name: "Alfajores", qty: 3 }] },
    { day: 7, client: "Kiosco Rapidito", invoice: "A", condicion: 6, method: "TRANSFERENCIA", lines: [{ name: "Coca-Cola 2.25L", qty: 12 }, { name: "Cerveza Quilmes 1L", qty: 12 }, { name: "Chicles Beldent", qty: 20 }] },
    { day: 9, method: "EFECTIVO", lines: [{ name: "Agua Villavicencio 2L", qty: 2 }, { name: "Fideos Matarazzo 500g", qty: 3 }] },
    { day: 10, client: "Almacén Don Bosco", invoice: "A", condicion: 1, method: "TRANSFERENCIA", lines: [{ name: "Aceite Natura 900ml", qty: 6 }, { name: "Arroz Gallo Oro 1kg", qty: 10 }, { name: "Pan Lactal Fargo 550g", qty: 5 }] },
    { day: 12, client: "Mariana", invoice: "B", condicion: 5, method: "QR", lines: [{ name: "Shampoo Sedal 350ml", qty: 1 }, { name: "Jabón Dove 90g", qty: 2 }] },
    { day: 14, method: "EFECTIVO", lines: [{ name: "Alfajor Jorgito", qty: 4 }, { name: "Chocolate Águila 150g", qty: 1 }] },
    { day: 15, client: "Diego", invoice: "B", condicion: 5, method: "TARJETA", lines: [{ name: "Detergente Magistral 750ml", qty: 1 }, { name: "Lavandina Ayudín 1L", qty: 2 }, { name: "Papel Higiénico Elite x4", qty: 2 }] },
    { day: 17, invoice: "B", method: "EFECTIVO", discountPct: 10, lines: [{ name: "Coca-Cola 2.25L", qty: 3 }, { name: "Harina Pureza 000 1kg", qty: 2 }] },
    { day: 18, method: "QR", lines: [{ name: "Cerveza Quilmes 1L", qty: 6 }] },
    { day: 20, client: "Valeria", invoice: "B", condicion: 5, method: "EFECTIVO", lines: [{ name: "Chocolate Águila 150g", qty: 2 }, { name: "Café La Virginia 250g", qty: 1 }] },
  ];

  const invoiceBySaleDay: Record<number, { id: string; tipo: number; numero: number; tipoDoc: number; nroDoc: bigint; condicion: number; saleId: string }> = {};

  for (const spec of sales) {
    const items = spec.lines.map((l) => {
      const p = product(l.name);
      const subtotal = round2(p.price * l.qty);
      return { p, qty: l.qty, subtotal, profit: round2(subtotal - p.purchasePrice * l.qty) };
    });
    const subtotal = round2(items.reduce((s, i) => s + i.subtotal, 0));
    const total = spec.discountPct ? round2(subtotal * (1 - spec.discountPct / 100)) : subtotal;
    const c = spec.client ? client(spec.client) : null;
    const fecha = day(spec.day);

    const sale = await prisma.sale.create({
      data: {
        tenantId: TENANT,
        userId: admin.id,
        clientId: c?.id ?? null,
        businessLocationId: location.id,
        paymentMethod: spec.method,
        receiptType: spec.invoice ? "FACTURA" : "TICKET",
        status: "COMPLETED",
        subtotal,
        total,
        ...(spec.discountPct ? { discountType: "PERCENTAGE", discountValue: spec.discountPct } : {}),
        grossProfit: round2(items.reduce((s, i) => s + i.profit, 0) - (subtotal - total)),
        isInvoiced: Boolean(spec.invoice),
        invoiceStatus: spec.invoice ? "INVOICED" : "NONE",
        createdAt: fecha,
        items: {
          create: items.map((i) => ({
            productId: i.p.id,
            quantity: i.qty,
            price: i.p.price,
            subtotal: i.subtotal,
            ivaRate: i.p.ivaRate,
            profit: i.profit,
            purchasePriceSnapshot: i.p.purchasePrice,
            productNameSnapshot: i.p.name,
            productSkuSnapshot: i.p.sku,
            createdAt: fecha,
          })),
        },
        payments: { create: [{ method: spec.method, amount: total, notes: MARK, createdAt: fecha }] },
      },
    });
    track('sales', sale.id);

    if (spec.invoice) {
      const tipo = spec.invoice === "A" ? 1 : 6;
      next[tipo] += 1;
      const digits = c?.dni?.replace(/\D/g, "") ?? "";
      const tipoDoc = !digits ? 99 : digits.length === 11 ? 80 : 96;
      const desglose = calcularIvaPorAlicuota(items.map((i) => ({ subtotal: i.subtotal, ivaRate: i.p.ivaRate })), total);
      const inv = await prisma.invoiceAfip.create({
        data: {
          tenantId: TENANT,
          saleId: sale.id,
          cuit: refInvoice.cuit,
          puntoVenta: refInvoice.puntoVenta,
          tipoComprobante: tipo,
          tipoDoc,
          nroDoc: BigInt(digits || 0),
          numero: next[tipo],
          fechaEmision: fecha,
          resultado: "A",
          cae: fakeCae(),
          caeVto: new Date(fecha.getTime() + 10 * 24 * 3600 * 1000),
          total,
          neto: desglose.neto,
          iva: desglose.iva,
          ivaDetalle: desglose.alicuotas as any,
          condicionIVAReceptor: spec.condicion ?? 5,
        },
      });
      track('invoices', inv.id);
      invoiceBySaleDay[spec.day] = { id: inv.id, tipo, numero: next[tipo], tipoDoc, nroDoc: BigInt(digits || 0), condicion: spec.condicion ?? 5, saleId: sale.id };
    }
  }

  // Nota de credito B parcial: Mariana devolvio el shampoo (venta del 12).
  {
    const orig = invoiceBySaleDay[12];
    const original = await prisma.invoiceAfip.findUnique({ where: { id: orig.id } });
    const shampoo = product("Shampoo Sedal 350ml");
    const importe = shampoo.price;
    const factor = importe / Number(original!.total);
    const detalle = (original!.ivaDetalle as any[]).map((a) => ({ subtotal: (a.baseImp + a.importe) * factor, ivaRate: a.rate }));
    const desglose = calcularIvaPorAlicuota(detalle, importe);
    const fecha = day(19);
    const ncSale = await prisma.sale.create({
      data: {
        tenantId: TENANT, userId: admin.id, clientId: client("Mariana").id, businessLocationId: location.id,
        paymentMethod: "QR", receiptType: "FACTURA", status: "CANCELLED", isNoteCredit: true,
        subtotal: importe, total: importe, returnReason: "Devolución de productos", createdAt: fecha,
        items: { create: [{ productId: shampoo.id, quantity: 1, price: shampoo.price, subtotal: shampoo.price, ivaRate: shampoo.ivaRate, productNameSnapshot: shampoo.name, createdAt: fecha }] },
      },
    });
    track('sales', ncSale.id);
    next[8] += 1;
    const nc = await prisma.invoiceAfip.create({
      data: {
        tenantId: TENANT, saleId: ncSale.id, relatedInvoiceId: orig.id, cuit: refInvoice.cuit, puntoVenta: refInvoice.puntoVenta,
        tipoComprobante: 8, tipoDoc: orig.tipoDoc, nroDoc: orig.nroDoc, numero: next[8], fechaEmision: fecha, resultado: "A",
        cae: fakeCae(), caeVto: new Date(fecha.getTime() + 10 * 24 * 3600 * 1000), total: importe,
        neto: desglose.neto, iva: desglose.iva, ivaDetalle: desglose.alicuotas as any, condicionIVAReceptor: orig.condicion,
      },
    });
    track('invoices', nc.id);
  }

  // Compras de octubre (facturas A con IVA y percepciones, y una B sin credito fiscal).
  const suppliers = await prisma.supplier.findMany({ where: { tenantId: TENANT }, select: { id: true, name: true, cuit: true } });
  const supplier = (name: string) => suppliers.find((s) => s.name === name)!;
  const purchases = [
    { day: 4, supplier: "Distribuidora Sur SRL", type: 1, pv: 3, nro: "00003-00012456", percIva: 1500, percIibb: 900, method: "TRANSFERENCIA" as const,
      lines: [{ name: "Coca-Cola 2.25L", qty: 24 }, { name: "Harina Pureza 000 1kg", qty: 40 }] },
    { day: 11, supplier: "Insumos del Centro SA", type: 1, pv: 2, nro: "00002-00045720", percIva: 0, percIibb: 600, method: "TRANSFERENCIA" as const,
      lines: [{ name: "Detergente Magistral 750ml", qty: 20 }, { name: "Lavandina Ayudín 1L", qty: 20 }] },
    { day: 16, supplier: "Mayorista Norte", type: 6, pv: 1, nro: "00001-00079010", percIva: 0, percIibb: 0, method: "EFECTIVO" as const,
      lines: [{ name: "Alfajores", qty: 40 }] },
  ];
  for (const pu of purchases) {
    const s = supplier(pu.supplier);
    const items = pu.lines.map((l) => {
      const p = product(l.name);
      return { p, qty: l.qty, subtotal: round2(p.purchasePrice * l.qty) };
    });
    const itemsTotal = round2(items.reduce((acc, i) => acc + i.subtotal, 0));
    const purchase = await prisma.purchase.create({
      data: {
        tenantId: TENANT, supplierId: s.id, providerName: s.name, providerCuit: s.cuit, userId: admin.id, businessLocationId: location.id,
        invoiceType: pu.type, invoicePointOfSale: pu.pv, invoiceNumber: pu.nro, paymentMethod: pu.method, description: MARK,
        ivaPerceptionAmount: pu.percIva, iibbPerceptionAmount: pu.percIibb,
        totalAmount: round2(itemsTotal + pu.percIva + pu.percIibb), date: day(pu.day), status: "COMPLETED",
        items: { create: items.map((i) => ({ productId: i.p.id, quantity: i.qty, unitCost: i.p.purchasePrice, subtotal: i.subtotal, ivaRate: i.p.ivaRate, productNameSnapshot: i.p.name })) },
      },
    });
    track('purchases', purchase.id);
  }

  fs.writeFileSync(OUT, JSON.stringify(created, null, 2));
  console.log("OK", Object.fromEntries(Object.entries(created).map(([k, v]) => [k, v.length])));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("ERROR:", e?.message ?? e);
  await prisma.$disconnect();
  process.exit(1);
});
