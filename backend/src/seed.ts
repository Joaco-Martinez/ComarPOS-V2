import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function seedAdmin() {
  const password = await bcrypt.hash("Joaco1907!", 10);

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
      email: "joaco.martinez1480@gmail.com",
    },
    update: {
      name: "Administrador",
      role: Role.ADMIN,
      password,
    },
    create: {
      email: "joaco.martinez1480@gmail.com",
      password,
      name: "Administrador",
      role: Role.ADMIN,
      tenantId: tenant.id,
    },
  });

  return admin;
}

// Super-admin de plataforma (PlatformAdmin), separado del User por-tenant de
// seedAdmin(). Sin esto no hay forma de entrar a /platform-admin: la tabla
// queda vacia y el login rechaza cualquier credencial.
async function seedPlatformAdmin() {
  const passwordHash = await bcrypt.hash("Joaco1907!", 10);

  const platformAdmin = await prisma.platformAdmin.upsert({
    where: { email: "joaco.martinez1480@gmail.com" },
    update: {
      name: "Joaco",
      passwordHash,
    },
    create: {
      email: "joaco.martinez1480@gmail.com",
      passwordHash,
      name: "Joaco",
    },
  });

  return platformAdmin;
}

async function main() {
  console.log("🌱 Iniciando seed...");

  const admin = await seedAdmin();
  const platformAdmin = await seedPlatformAdmin();

  console.log("");
  console.log("✅ Seed finalizado correctamente");
  console.log("");
  console.log("🔐 Usuario admin (tenant grupo-vj) creado/actualizado:");
  console.log(`ID: ${admin.id}`);
  console.log(`Email: ${admin.email}`);
  console.log("");
  console.log("🛡️  Platform admin (/platform-admin) creado/actualizado:");
  console.log(`ID: ${platformAdmin.id}`);
  console.log(`Email: ${platformAdmin.email}`);
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