/**
 * Import puntual del catalogo de "Kiosko Vir" (tenant real, alta 2026-09-03,
 * cuenta rubengera83@gmail.com) desde el excel exportado de su POS anterior.
 * Reusa categoryService.create() y product.write.ts#create() (no reimplementa
 * la logica de negocio) para que valga la misma validacion que el alta manual.
 *
 * Uso:
 *   npx ts-node scripts/importKioskoVirProductos.ts            -> dry-run (no escribe nada)
 *   npx ts-node scripts/importKioskoVirProductos.ts --commit    -> escribe de verdad
 *   npx ts-node scripts/importKioskoVirProductos.ts --commit --limit=20  -> prueba acotada
 */
import ExcelJS from "exceljs";
import prisma from "../src/prisma";
import { runWithTenant } from "../src/context/tenantContext";
import { create as createProduct } from "../src/services/product/product.write";
import { categoryService } from "../src/services/category.service";

const TENANT_SLUG = "kiosko-vir";
const EXCEL_PATH = "C:\\Users\\Joaco\\Downloads\\Productos.xlsx";
const ADMIN_EMAIL = "rubengera83@gmail.com";

const COMMIT = process.argv.includes("--commit");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

function cell(v: any) {
  if (v && typeof v === "object" && "text" in v) return v.text;
  if (v && typeof v === "object" && "result" in v) return v.result;
  return v;
}

type Row = {
  r: number;
  id: string;
  nombre: string;
  categoria: string | null;
  codigo: string | null;
  descripcion: string | null;
  costo: number;
  precio: number;
  controlarStock: boolean; // true = trackea stock (S)
  stockActual: number;
  stockMin: number;
};

async function readRows(): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  const ws = wb.worksheets[0];

  const rows: Row[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const raw = (ws.getRow(r).values as any[]).slice(1).map(cell);
    if (raw.every((v) => v === null || v === undefined || v === "")) continue;
    const [id, nombre, categoria, codigo, descripcion, costo, precio, , , , , controlarStockRaw, stockActual, stockMin] = raw;
    rows.push({
      r,
      id: String(id),
      nombre: String(nombre ?? "").trim(),
      categoria: categoria ? String(categoria).trim() : null,
      codigo: codigo ? String(codigo).trim() : null,
      descripcion: descripcion ? String(descripcion).trim() : null,
      costo: Number(costo) || 0,
      precio: Number(precio) || 0,
      controlarStock: String(controlarStockRaw) === "S",
      stockActual: Number(stockActual) || 0,
      stockMin: Number(stockMin) || 0,
    });
  }
  return rows;
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`No existe el tenant ${TENANT_SLUG}`);

  const adminUser = await prisma.user.findFirst({ where: { email: ADMIN_EMAIL, tenantId: tenant.id } });
  if (!adminUser) throw new Error(`No existe el usuario ${ADMIN_EMAIL} en el tenant`);

  const location = await prisma.businessLocation.findFirst({ where: { tenantId: tenant.id, isActive: true } });
  if (!location) throw new Error("El tenant no tiene ninguna ubicacion activa");

  const allRows = await readRows();

  // Dedupe por codigo de barras: se queda con la primera aparicion, el resto
  // se reporta como saltado (mismo codigo repetido para "productos" distintos
  // en el excel de origen -- Product.sku es unico por tenant).
  const seenSku = new Set<string>();
  const skippedDupSku: Row[] = [];
  const rows: Row[] = [];
  for (const row of allRows) {
    const sku = row.codigo || row.id; // fallback: id interno del POS de origen si no hay codigo de barras
    if (seenSku.has(sku)) {
      skippedDupSku.push(row);
      continue;
    }
    seenSku.add(sku);
    rows.push(row);
  }

  const limited = rows.slice(0, LIMIT === Infinity ? rows.length : LIMIT);

  const categoryNames = [...new Set(limited.map((r) => r.categoria).filter((c): c is string => !!c))];

  console.log(`Tenant: ${tenant.name} (${tenant.id})`);
  console.log(`Ubicacion destino: ${location.name} (${location.id})`);
  console.log(`Filas totales en excel: ${allRows.length}`);
  console.log(`Duplicados de codigo saltados: ${skippedDupSku.length}`);
  console.log(`A procesar en esta corrida: ${limited.length}`);
  console.log(`Categorias distintas a crear: ${categoryNames.length}`);
  console.log(`Modo: ${COMMIT ? "COMMIT (escribe de verdad)" : "DRY-RUN (no escribe nada)"}`);
  console.log("---");

  if (!COMMIT) {
    console.log("Dry-run: no se crea nada. Corré con --commit para ejecutar.");
    console.log("Muestra de las primeras 5 filas a crear:");
    console.log(JSON.stringify(limited.slice(0, 5), null, 2));
    return;
  }

  await runWithTenant(tenant.id, async () => {
    const categoryIdByName = new Map<string, string>();

    // Categorias ya existentes en el tenant (por si se corre el script mas de una vez)
    const existingCategories = await prisma.productCategory.findMany({ where: { tenantId: tenant.id } });
    for (const c of existingCategories) categoryIdByName.set(c.name, c.id);

    for (const name of categoryNames) {
      if (categoryIdByName.has(name)) continue;
      const result = await categoryService.create({ name });
      if ("statusCode" in result) {
        console.error(`ERROR creando categoria "${name}": ${result.message}`);
        continue;
      }
      categoryIdByName.set(name, result.id);
    }

    let created = 0;
    let failed = 0;
    let processed = 0;
    const failures: { row: Row; reason: string }[] = [];

    const CONCURRENCY = 8;
    let cursor = 0;
    const admin = adminUser;
    const loc = location;

    async function processRow(row: Row) {
      const sku = row.codigo || row.id;
      const categoryId = row.categoria ? categoryIdByName.get(row.categoria) : undefined;

      const result = await createProduct({
        name: row.nombre,
        description: row.descripcion || undefined,
        sku,
        categoryId,
        saleUnit: "UNIT",
        price: row.precio,
        purchasePrice: row.costo,
        unlimitedStock: !row.controlarStock,
        userId: admin.id,
        initialStock: [
          {
            businessLocationId: loc.id,
            quantity: row.stockActual,
            ...(row.stockMin > 0 ? { minQuantity: row.stockMin } : {}),
          },
        ],
      } as any).catch((e: any) => ({ statusCode: 500, message: e?.message ?? String(e) }));

      if (result && "statusCode" in (result as any)) {
        failed++;
        failures.push({ row, reason: (result as any).message });
      } else {
        created++;
      }
      processed++;
      if (processed % 100 === 0) console.log(`... ${processed}/${limited.length} procesados (${created} creados, ${failed} fallidos)`);
    }

    async function worker() {
      while (cursor < limited.length) {
        const row = limited[cursor++];
        await processRow(row);
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    console.log("---");
    console.log(`Creados: ${created}`);
    console.log(`Fallidos: ${failed}`);
    console.log(`Duplicados de codigo saltados (no procesados): ${skippedDupSku.length}`);
    if (failures.length > 0) {
      console.log("Fallos:");
      console.log(JSON.stringify(failures.map((f) => ({ r: f.row.r, nombre: f.row.nombre, reason: f.reason })), null, 2));
    }
    if (skippedDupSku.length > 0) {
      console.log("Saltados por codigo duplicado:");
      console.log(JSON.stringify(skippedDupSku.map((r) => ({ r: r.r, nombre: r.nombre, codigo: r.codigo })), null, 2));
    }
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
