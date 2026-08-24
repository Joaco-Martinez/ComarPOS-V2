import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Super-admin de plataforma (PlatformAdmin, tabla propia -- ver
// backend/CLAUDE.md seccion "Platform admin"). Es lo UNICO que este seed
// crea: el sistema arranca sin ningun tenant de fabrica, los tenants reales
// se dan de alta por /trial-signup (self-service) o a mano desde
// /platform-admin. Sin este seed no hay forma de entrar a /platform-admin
// la primera vez (la tabla queda vacia y el login rechaza cualquier
// credencial).
async function seedPlatformAdmin() {
  const passwordHash = await bcrypt.hash("Joaco1907", 10);

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
