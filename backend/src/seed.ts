import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function seedAdmin() {
  const password = await bcrypt.hash("admin123", 10);

  // doc seccion 6 - multi-tenant: este script corre fuera de un request, asi
  // que no hay tenant resuelto por subdominio. Se asigna el tenant default
  // (DEFAULT_TENANT_SLUG, "grupo-vj") creado por la migracion de backfill.
  const defaultTenantSlug = process.env.DEFAULT_TENANT_SLUG || "grupo-vj";
  const tenant = await prisma.tenant.findUnique({ where: { slug: defaultTenantSlug } });

  if (!tenant) {
    throw new Error(
      `No existe el tenant default "${defaultTenantSlug}". Corré las migraciones antes del seed.`
    );
  }

  const admin = await prisma.user.upsert({
    where: {
      email: "admin@grupovj.com",
    },
    update: {
      name: "Administrador",
      role: Role.ADMIN,
      password,
    },
    create: {
      email: "admin@grupovj.com",
      password,
      name: "Administrador",
      role: Role.ADMIN,
      tenantId: tenant.id,
    },
  });

  return admin;
}

async function main() {
  console.log("🌱 Iniciando seed...");

  const admin = await seedAdmin();

  console.log("");
  console.log("✅ Seed finalizado correctamente");
  console.log("");
  console.log("🔐 Usuario admin creado/actualizado:");
  console.log(`ID: ${admin.id}`);
  console.log("Email: admin@grupovj.com");
  console.log("Password: admin123");
  console.log("");
}

main()
  .catch((error) => {
    console.error("❌ Error ejecutando seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });