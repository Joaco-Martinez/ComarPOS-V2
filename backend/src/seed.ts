import { PrismaClient } from "@prisma/client";
import "dotenv/config";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Super-admin de plataforma (PlatformAdmin, tabla propia -- ver
// backend/CLAUDE.md seccion "Platform admin"). Es lo UNICO que este seed
// crea: el sistema arranca sin ningun tenant de fabrica, los tenants reales
// se dan de alta por /trial-signup (self-service) o a mano desde
// /platform-admin. Sin este seed no hay forma de entrar a /platform-admin
// la primera vez (la tabla queda vacia y el login rechaza cualquier
// credencial).
//
// Las credenciales salen de variables de entorno (nunca del codigo: el repo
// es publico y una contraseña commiteada queda para siempre en el historial).
async function seedPlatformAdmin() {
  const email = String(process.env.PLATFORM_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.PLATFORM_ADMIN_PASSWORD || "");
  const name = String(process.env.PLATFORM_ADMIN_NAME || "Admin").trim();

  if (!email) throw new Error("Falta PLATFORM_ADMIN_EMAIL");
  if (password.length < 12) {
    throw new Error("PLATFORM_ADMIN_PASSWORD es obligatoria y debe tener al menos 12 caracteres");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const platformAdmin = await prisma.platformAdmin.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
    },
    create: {
      email,
      passwordHash,
      name,
    },
  });

  return platformAdmin;
}

async function main() {
  console.log("🌱 Iniciando seed...");

  const platformAdmin = await seedPlatformAdmin();

  console.log("");
  console.log("✅ Seed finalizado correctamente");
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
