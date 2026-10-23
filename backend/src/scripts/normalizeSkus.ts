/**
 * Deja todos los SKUs existentes solo con letras y numeros (sin guiones,
 * puntos, espacios ni acentos), mismo criterio que normalizeSku() en
 * product.helpers.ts para los SKUs nuevos. Si el SKU limpio choca con otro
 * producto del mismo tenant (@@unique([tenantId, sku])) se le agrega 2, 3...
 * Los snapshots de ventas/devoluciones viejas (productSkuSnapshot) no se
 * tocan: son historia. Tampoco los SKUs internos de envio/mano de obra (ver
 * isInternal mas abajo).
 *
 *   npx ts-node src/scripts/normalizeSkus.ts            -> solo muestra los cambios
 *   npx ts-node src/scripts/normalizeSkus.ts --apply    -> los aplica
 *   npx ts-node src/scripts/normalizeSkus.ts --apply --out cambios.json
 */
import "dotenv/config";
import fs from "fs";
import { Prisma } from "@prisma/client";
import prisma from "../prisma";
import { normalizeSku } from "../services/product/product.helpers";

async function main() {
  const apply = process.argv.includes("--apply");
  const outIdx = process.argv.indexOf("--out");
  const outFile = outIdx > -1 ? process.argv[outIdx + 1] : null;

  const products = await prisma.product.findMany({
    where: { sku: { not: null } },
    select: { id: true, tenantId: true, sku: true, name: true },
  });

  const takenByTenant = new Map<string, Set<string>>();
  const taken = (tenantId: string | null) => {
    const key = tenantId ?? "";
    if (!takenByTenant.has(key)) takenByTenant.set(key, new Set());
    return takenByTenant.get(key)!;
  };

  // Los que ya estan limpios reservan su SKU primero, asi un SKU limpio
  // existente nunca cambia por culpa de uno sucio que colapsa al mismo valor.
  // SKUs internos (producto de envio y de mano de obra): el codigo los
  // renombra solo la primera vez que los usa (ensureDeliveryProduct /
  // ensureServiceLaborProduct). No se tocan aca para que un backend todavia
  // sin deployar, que los sigue buscando con guion, no cree duplicados.
  const isInternal = (sku: string) => sku === "ENVIO-FLETE2" || sku.startsWith("SERVICIO-TECNICO-");

  const dirty: typeof products = [];
  for (const p of products) {
    if (isInternal(String(p.sku))) {
      taken(p.tenantId).add(normalizeSku(String(p.sku)).toUpperCase());
      continue;
    }
    const sku = String(p.sku);
    if (normalizeSku(sku) === sku && sku) taken(p.tenantId).add(sku.toUpperCase());
    else dirty.push(p);
  }

  const changes: { id: string; tenantId: string | null; name: string; from: string; to: string }[] = [];
  for (const p of dirty) {
    const base = normalizeSku(String(p.sku)) || `PRD${p.id.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase()}`;
    const set = taken(p.tenantId);
    let to = base;
    let n = 2;
    while (set.has(to.toUpperCase())) to = `${base}${n++}`;
    set.add(to.toUpperCase());
    changes.push({ id: p.id, tenantId: p.tenantId, name: p.name, from: String(p.sku), to });
  }

  for (const c of changes) console.log(`${c.tenantId ?? "-"}  ${c.from}  ->  ${c.to}   (${c.name})`);
  const collisions = changes.filter((c) => c.to !== normalizeSku(c.from));
  console.log(`\n${changes.length} SKUs a cambiar de ${products.length} productos con SKU; ${collisions.length} con sufijo por choque.`);

  if (outFile) fs.writeFileSync(outFile, JSON.stringify(changes, null, 2));

  if (!apply) {
    console.log("Modo prueba: no se cambio nada. Correr con --apply para aplicar.");
    return;
  }

  // Un solo UPDATE ... FROM (VALUES ...): atomico y una sola ida a la base
  // (uno por uno dentro de una transaccion interactiva pasaba el timeout
  // con cientos de productos contra la DB remota). No hay riesgo de chocar
  // con el unique a mitad del UPDATE: ningun SKU destino es igual a un SKU
  // actual (los limpios quedan reservados en `taken` y los sucios tienen
  // algun caracter que el destino ya no tiene).
  const BATCH = 500;
  for (let i = 0; i < changes.length; i += BATCH) {
    const chunk = changes.slice(i, i + BATCH);
    const values = Prisma.join(chunk.map((c) => Prisma.sql`(${c.id}, ${c.to})`));
    await prisma.$executeRaw`
      UPDATE "Product" AS p SET sku = v.sku
      FROM (VALUES ${values}) AS v(id, sku)
      WHERE p.id = v.id`;
  }

  console.log(`Aplicado: ${changes.length} SKUs actualizados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
