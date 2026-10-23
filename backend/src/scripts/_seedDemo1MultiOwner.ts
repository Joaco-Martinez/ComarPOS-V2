/* Multi-facturacion de ejemplo para Demo1 (slug demo-qwq): 4 duenos (CUIT),
 * reparte entre ellos las facturas/compras de octubre 2026 que cargo
 * _seedDemo1Fiscal.ts y agrega notas de credito A y C.
 * Uso: ts-node _seedDemo1MultiOwner.ts <ids-del-seed-fiscal.json> <salida.json> */
import "dotenv/config";
import fs from "fs";
import prisma from "../prisma";
import { calcularIvaPorAlicuota } from "../afip/utils/ivaAlicuotas";

const TENANT = "8cb0d3d3-5814-444c-b120-a15bd986cbac";
const [SEED_IDS, OUT] = process.argv.slice(2);
const RI = "IVA RESPONSABLE INSCRIPTO";
const MONO = "RESPONSABLE MONOTRIBUTO";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const day = (d: number, h = 15) => new Date(`2026-10-${String(d).padStart(2, "0")}T${h}:00:00.000Z`);
let caeSeq = 0;
const fakeCae = () => `7642${String(Date.now()).slice(-8)}${String(caeSeq++).padStart(2, "0")}`;

function cuitWithDv(base10: string) {
  const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const s = base10.split("").reduce((acc, d, i) => acc + Number(d) * w[i], 0);
  const r = 11 - (s % 11);
  return base10 + (r === 11 ? 0 : r === 10 ? 9 : r);
}

const OWNERS = [
  { key: "o1", businessName: "Martín Gómez", cuit: "20304050607", ivaCondition: RI, pv: 1, fiscalAddress: "Av. San Martín 1234, Córdoba" },
  { key: "o2", businessName: "Laura Fernández", cuit: cuitWithDv("2733445566"), ivaCondition: RI, pv: 2, fiscalAddress: "Belgrano 456, Córdoba" },
  { key: "o3", businessName: "Comercial Demo SRL", cuit: cuitWithDv("3071234567"), ivaCondition: RI, pv: 1, fiscalAddress: "Colón 789, Córdoba" },
  { key: "o4", businessName: "Sofía Ramírez", cuit: cuitWithDv("2738765432"), ivaCondition: MONO, pv: 5, fiscalAddress: "Ituzaingó 321, Córdoba" },
] as const;
type OwnerKey = (typeof OWNERS)[number]["key"];

// Dia de la venta de octubre -> dueno que la facturo.
const SALE_OWNER: Record<number, OwnerKey> = { 2: "o1", 3: "o1", 17: "o1", 7: "o2", 12: "o2", 10: "o3", 15: "o3", 5: "o4", 20: "o4" };
const PURCHASE_OWNER: Record<string, OwnerKey> = { "Distribuidora Sur SRL": "o1", "Mayorista Norte": "o2", "Insumos del Centro SA": "o3" };

(async () => {
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT }, select: { multiInvoicingEnabled: true } });
  if (tenant?.multiInvoicingEnabled) throw new Error("Demo1 ya tiene multi-facturacion activada");
  if (await prisma.arcaConfig.count({ where: { tenantId: TENANT } })) throw new Error("Demo1 ya tiene configuraciones ARCA");

  const seed = JSON.parse(fs.readFileSync(SEED_IDS, "utf8")) as Record<string, string[]>;
  const seededInvoiceIds = new Set(seed.invoices);
  const out = {
    tenantMultiInvoicingBefore: false,
    arcaConfigs: [] as string[],
    created: { sales: [] as string[], invoices: [] as string[] },
    // Estado previo de lo que se modifica, para poder revertir.
    invoicesBefore: [] as any[],
    purchasesBefore: [] as { id: string; arcaConfigId: string | null }[],
    salesBefore: [] as { id: string; requestedArcaConfigId: string | null }[],
    vatSettlementsBefore: [] as { id: string; arcaConfigId: string | null }[],
  };
  const save = () => fs.writeFileSync(OUT, JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));

  await prisma.tenant.update({ where: { id: TENANT }, data: { multiInvoicingEnabled: true } });
  save();

  const ownerId: Record<OwnerKey, string> = {} as any;
  const owner = (k: OwnerKey) => OWNERS.find((o) => o.key === k)!;
  for (const o of OWNERS) {
    const cfg = await prisma.arcaConfig.create({
      data: {
        tenantId: TENANT,
        businessName: o.businessName,
        cuit: o.cuit,
        ivaCondition: o.ivaCondition,
        fiscalAddress: o.fiscalAddress,
        activityStart: new Date("2020-03-01T00:00:00.000Z"),
        environment: "HOMOLOGACION",
        isActive: true,
        defaultPointOfSale: o.pv,
        scope: `TENANT_${TENANT}_DEMO_${o.key}`,
        pointsOfSale: {
          create: [{ number: o.pv, description: "Punto de venta de ejemplo", isDefault: true, enabledCbteTypes: o.ivaCondition === RI ? [1, 3, 6, 8] : [11, 13] }],
        },
      },
    });
    ownerId[o.key] = cfg.id;
    out.arcaConfigs.push(cfg.id);
    save();
  }

  // Todo lo historico (facturas, compras, liquidaciones) era del unico CUIT: dueno 1.
  const allInvoices = await prisma.invoiceAfip.findMany({ where: { tenantId: TENANT }, include: { sale: { select: { id: true, createdAt: true, requestedArcaConfigId: true } } } });
  out.invoicesBefore = allInvoices.map(({ sale, ...inv }) => inv);
  const purchases = await prisma.purchase.findMany({ where: { tenantId: TENANT }, select: { id: true, arcaConfigId: true, providerName: true, description: true } });
  out.purchasesBefore = purchases.map((p) => ({ id: p.id, arcaConfigId: p.arcaConfigId }));
  const settlements = await prisma.vatSettlement.findMany({ where: { tenantId: TENANT }, select: { id: true, arcaConfigId: true } });
  out.vatSettlementsBefore = settlements;
  out.salesBefore = allInvoices.filter((i) => i.sale).map((i) => ({ id: i.sale!.id, requestedArcaConfigId: i.sale!.requestedArcaConfigId }));
  save();

  for (const inv of allInvoices.filter((i) => !seededInvoiceIds.has(i.id))) {
    await prisma.invoiceAfip.update({ where: { id: inv.id }, data: { arcaConfigId: ownerId.o1 } });
    if (inv.saleId) await prisma.sale.update({ where: { id: inv.saleId }, data: { requestedArcaConfigId: ownerId.o1 } });
  }
  await prisma.vatSettlement.updateMany({ where: { tenantId: TENANT, arcaConfigId: null }, data: { arcaConfigId: ownerId.o1 } });
  for (const p of purchases) {
    const k = seed.purchases.includes(p.id) ? PURCHASE_OWNER[p.providerName ?? ""] ?? "o1" : "o1";
    await prisma.purchase.update({ where: { id: p.id }, data: { arcaConfigId: ownerId[k] } });
  }

  // Facturas de octubre: cada una a su dueno. Primero numeros temporales
  // negativos para no chocar con el @@unique(cuit, pv, tipo, numero).
  const seeded = allInvoices.filter((i) => seededInvoiceIds.has(i.id));
  let tmp = -1;
  for (const inv of seeded) await prisma.invoiceAfip.update({ where: { id: inv.id }, data: { numero: tmp-- } });

  const facturas = seeded.filter((i) => i.tipoComprobante === 1 || i.tipoComprobante === 6);
  const ncB = seeded.find((i) => i.tipoComprobante === 8)!;
  const facturaByDay = new Map<number, (typeof seeded)[number]>();
  for (const f of facturas) facturaByDay.set(f.sale!.createdAt.getUTCDate(), f);

  type Plan = { id?: string; owner: OwnerKey; tipo: number; fecha: Date; total: number; neto: number; iva: number; ivaDetalle: any; isNew?: boolean };
  const plans: Plan[] = [];
  for (const [d, k] of Object.entries(SALE_OWNER)) {
    const f = facturaByDay.get(Number(d));
    if (!f) throw new Error(`No hay factura de ejemplo del dia ${d}`);
    const isMono = owner(k).ivaCondition === MONO;
    plans.push({
      id: f.id, owner: k, fecha: f.fechaEmision, total: f.total,
      // Monotributo: Factura C, sin discriminar IVA (igual que wsfe-base.service.ts).
      tipo: isMono ? 11 : f.tipoComprobante,
      neto: isMono ? f.total : f.neto,
      iva: isMono ? 0 : f.iva,
      ivaDetalle: isMono ? null : f.ivaDetalle,
    });
  }
  plans.push({ id: ncB.id, owner: SALE_OWNER[12], tipo: 8, fecha: ncB.fechaEmision, total: ncB.total, neto: ncB.neto, iva: ncB.iva, ivaDetalle: ncB.ivaDetalle });

  // Numeracion por dueno/pv/tipo, continuando la historica.
  const nextNum = new Map<string, number>();
  const takeNumber = async (k: OwnerKey, tipo: number) => {
    const o = owner(k);
    const key = `${o.cuit}|${o.pv}|${tipo}`;
    if (!nextNum.has(key)) {
      const max = await prisma.invoiceAfip.aggregate({ where: { cuit: o.cuit, puntoVenta: o.pv, tipoComprobante: tipo, numero: { gt: 0 } }, _max: { numero: true } });
      nextNum.set(key, max._max.numero ?? 0);
    }
    nextNum.set(key, nextNum.get(key)! + 1);
    return nextNum.get(key)!;
  };

  plans.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  for (const p of plans) {
    const o = owner(p.owner);
    await prisma.invoiceAfip.update({
      where: { id: p.id! },
      data: {
        arcaConfigId: ownerId[p.owner], cuit: o.cuit, puntoVenta: o.pv, tipoComprobante: p.tipo, numero: await takeNumber(p.owner, p.tipo),
        neto: p.neto, iva: p.iva, ivaDetalle: p.ivaDetalle ?? undefined,
      },
    });
    const inv = seeded.find((i) => i.id === p.id)!;
    if (inv.saleId) await prisma.sale.update({ where: { id: inv.saleId }, data: { requestedArcaConfigId: ownerId[p.owner] } });
  }
  // ivaDetalle: null explicito para las C (el update con undefined no lo borra).
  for (const p of plans.filter((x) => x.ivaDetalle === null)) {
    await prisma.$executeRaw`UPDATE "InvoiceAfip" SET "ivaDetalle" = NULL WHERE id = ${p.id}`;
  }

  // Notas de credito nuevas, como las arma notaCredito.service.ts: venta
  // espejo CANCELLED + isNoteCredit, mismo dueno/CUIT/pv que la factura.
  const emitNc = async (facturaId: string, fecha: Date, importe: number, motivo: string) => {
    const orig = await prisma.invoiceAfip.findUniqueOrThrow({ where: { id: facturaId }, include: { sale: { include: { items: true } } } });
    const k = (Object.keys(ownerId) as OwnerKey[]).find((x) => ownerId[x] === orig.arcaConfigId)!;
    const o = owner(k);
    const tipoNc = orig.tipoComprobante === 1 ? 3 : orig.tipoComprobante === 6 ? 8 : 13;
    let neto = importe, iva = 0, ivaDetalle: any = undefined;
    if (tipoNc !== 13) {
      const factor = importe / Number(orig.total);
      const detalle = (orig.ivaDetalle as any[]).map((a) => ({ subtotal: (a.baseImp + a.importe) * factor, ivaRate: a.rate }));
      const d = calcularIvaPorAlicuota(detalle, importe);
      neto = d.neto; iva = d.iva; ivaDetalle = d.alicuotas;
    }
    const s = orig.sale!;
    const ncSale = await prisma.sale.create({
      data: {
        tenantId: TENANT, clientId: s.clientId, userId: s.userId, paymentMethod: s.paymentMethod, receiptType: s.receiptType,
        businessLocationId: s.businessLocationId, status: "CANCELLED", isNoteCredit: true, subtotal: importe, total: importe,
        returnReason: motivo, requestedArcaConfigId: ownerId[k], createdAt: fecha,
        items: { create: s.items.map((it) => ({ productId: it.productId, quantity: it.quantity, quantityKg: it.quantityKg, price: it.price, subtotal: it.subtotal, ivaRate: it.ivaRate, productNameSnapshot: it.productNameSnapshot, productSkuSnapshot: it.productSkuSnapshot, createdAt: fecha })) },
      },
    });
    out.created.sales.push(ncSale.id);
    save();
    const nc = await prisma.invoiceAfip.create({
      data: {
        tenantId: TENANT, saleId: ncSale.id, relatedInvoiceId: orig.id, arcaConfigId: ownerId[k], cuit: o.cuit, puntoVenta: o.pv,
        tipoComprobante: tipoNc, tipoDoc: orig.tipoDoc, nroDoc: orig.nroDoc, numero: await takeNumber(k, tipoNc), fechaEmision: fecha,
        resultado: "A", cae: fakeCae(), caeVto: new Date(fecha.getTime() + 10 * 24 * 3600 * 1000), total: importe, neto, iva, ivaDetalle,
        condicionIVAReceptor: orig.condicionIVAReceptor,
      },
    });
    out.created.invoices.push(nc.id);
    save();
  };

  // NC A parcial: Almacen Don Bosco devolvio 2 aceites (dueno 3).
  const aceite = await prisma.product.findFirstOrThrow({ where: { tenantId: TENANT, name: "Aceite Natura 900ml" }, select: { price: true } });
  await emitNc(facturaByDay.get(10)!.id, day(22), round2(aceite.price * 2), "Devolución de productos");
  // NC C total: se anulo la venta de Valeria (dueno 4, monotributo).
  await emitNc(facturaByDay.get(20)!.id, day(21), facturaByDay.get(20)!.total, "Anulación de venta");

  save();
  console.log("OK", { duenos: OWNERS.map((o) => `${o.businessName} ${o.cuit} PV${o.pv}`), notasCreditoNuevas: out.created.invoices.length });
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("ERROR:", e?.message ?? e);
  await prisma.$disconnect();
  process.exit(1);
});
