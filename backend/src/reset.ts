import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import { assertLocalDatabase } from "./utils/assertLocalDatabase";

const prisma = new PrismaClient();

/**
 * Reinicia el schema public completo y luego aplica migraciones de Prisma.
 * Funciona en Postgres.
 */
async function main() {
  console.log("🧨 RESET DB: arrancando...");

  // 1) Solo contra una base local (ver utils/assertLocalDatabase.ts)
  assertLocalDatabase("reset");

  console.log("🗑️  Borrando schema public...");
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS public CASCADE;`);
  await prisma.$executeRawUnsafe(`CREATE SCHEMA public;`);

  // permisos típicos (opcional, pero recomendado)
  await prisma.$executeRawUnsafe(`GRANT ALL ON SCHEMA public TO public;`);
  await prisma.$executeRawUnsafe(`GRANT ALL ON SCHEMA public TO postgres;`);

  console.log("✅ Schema public recreado.");

  // 2) Aplicar migraciones (carga los nuevos schemas)
  console.log("📦 Aplicando migraciones Prisma (migrate deploy)...");
  execSync("npx prisma migrate deploy", { stdio: "inherit" });

  console.log("✅ Migraciones aplicadas.");

  // 3) (Opcional) Seed si lo tenés
  // console.log("🌱 Corriendo seed...");
  // execSync("npx prisma db seed", { stdio: "inherit" });

  console.log("🎉 RESET DB: terminado.");
}

main()
  .catch((e) => {
    console.error("❌ Reset falló:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
