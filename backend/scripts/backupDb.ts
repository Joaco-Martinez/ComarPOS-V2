/**
 * Backup manual de la base (JSON, todas las tablas) sin depender de
 * pg_dump/Docker - usa la misma conexion de Prisma via SQL crudo, asi que
 * funciona en cualquier maquina que ya pueda correr el backend.
 *
 * Uso: npm run backup
 *
 * Esto es un complemento, NO un reemplazo de backups automaticos: Railway
 * ofrece backups automaticos de Postgres desde su dashboard (proyecto ->
 * base de datos -> Backups) - activarlos ahi es el paso mas importante y
 * no depende de que nadie se acuerde de correr este script.
 *
 * Para restaurar: recrear el schema con `npx prisma migrate deploy` contra
 * una base vacia, despues reinsertar los datos de este JSON tabla por tabla
 * (respetando el orden de FKs) o usarlo como referencia para auditar datos.
 */
import fs from "fs";
import path from "path";
import prisma from "../src/prisma";

async function main() {
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );

  const dump: Record<string, unknown[]> = {};

  for (const { tablename } of tables) {
    if (tablename.startsWith("_prisma")) continue;
    dump[tablename] = await prisma.$queryRawUnsafe(`SELECT * FROM "${tablename}"`);
  }

  const dir = path.join(__dirname, "..", "backups");
  fs.mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `comarpos-backup-${timestamp}.json`);

  fs.writeFileSync(
    file,
    JSON.stringify(dump, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2)
  );

  const sizeKb = (fs.statSync(file).size / 1024).toFixed(1);
  const rowCount = Object.values(dump).reduce((acc, rows) => acc + rows.length, 0);
  console.log(`✅ Backup listo: ${file}`);
  console.log(`   ${Object.keys(dump).length} tablas, ${rowCount} filas, ${sizeKb} KB`);
}

main()
  .catch((err) => {
    console.error("❌ Error generando backup:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
