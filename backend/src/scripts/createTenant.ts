/**
 * Alta de un negocio (tenant) nuevo: crea el Tenant, su usuario ADMIN inicial
 * y una sucursal default. Pensado para correr a mano cuando se suma un
 * cliente nuevo (doc seccion 6 - multi-tenant).
 *
 * Uso:
 *   npx ts-node src/scripts/createTenant.ts \
 *     --slug=negocio-dos \
 *     --name="Negocio Dos SRL" \
 *     --adminEmail=admin@negociodos.com \
 *     --adminPassword=cambiar123 \
 *     [--adminName="Administrador"] \
 *     [--locationName="Casa Central"]
 *
 * El "slug" es el subdominio por el que se va a resolver el tenant
 * (src/middleware/tenant.ts), ej. slug "negocio-dos" -> negocio-dos.tudominio.com.
 */
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};

  for (const raw of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(raw);
    if (match) {
      args[match[1]] = match[2];
    }
  }

  return args;
}

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function createTenant() {
  const args = parseArgs(process.argv.slice(2));

  const rawSlug = args.slug;
  const name = String(args.name || "").trim();
  const adminEmail = String(args.adminEmail || "").trim().toLowerCase();
  const adminPassword = String(args.adminPassword || "");
  const adminName = String(args.adminName || "Administrador").trim();
  const locationName = String(args.locationName || "Casa Central").trim();

  if (!rawSlug) throw new Error("Falta --slug (subdominio del negocio, ej. negocio-dos)");
  if (!name) throw new Error("Falta --name (nombre comercial del negocio)");
  if (!adminEmail) throw new Error("Falta --adminEmail");
  if (!adminPassword || adminPassword.length < 6) {
    throw new Error("--adminPassword es obligatorio y debe tener al menos 6 caracteres");
  }

  const slug = normalizeSlug(rawSlug);
  if (!slug || slug === "www") {
    throw new Error(`Slug invalido: "${rawSlug}" -> "${slug}"`);
  }

  const existingTenant = await prisma.tenant.findUnique({ where: { slug } });
  if (existingTenant) {
    throw new Error(`Ya existe un tenant con slug "${slug}" (id ${existingTenant.id})`);
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name, slug, isActive: true },
    });

    const admin = await tx.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        name: adminName,
        role: Role.ADMIN,
        isActive: true,
        mustChangePassword: true,
        tenantId: tenant.id,
      },
    });

    const location = await tx.businessLocation.create({
      data: {
        name: locationName,
        type: "STORE",
        isDefault: true,
        isActive: true,
        tenantId: tenant.id,
      },
    });

    return { tenant, admin, location };
  });

  return result;
}

createTenant()
  .then(({ tenant, admin, location }) => {
    console.log("");
    console.log("✅ Tenant creado correctamente");
    console.log("");
    console.log(`Negocio: ${tenant.name}`);
    console.log(`Slug (subdominio): ${tenant.slug}`);
    console.log(`Tenant ID: ${tenant.id}`);
    console.log("");
    console.log("🔐 Usuario admin:");
    console.log(`Email: ${admin.email}`);
    console.log(`(la contraseña es la que pasaste por --adminPassword)`);
    console.log(`mustChangePassword: true -> va a pedir cambiarla en el primer login`);
    console.log("");
    console.log(`📍 Sucursal default: ${location.name}`);
    console.log("");
    console.log(
      `En desarrollo, probalo con el header "X-Tenant-Slug: ${tenant.slug}". En produccion, apuntá el subdominio "${tenant.slug}" a la app.`
    );
    console.log("");
  })
  .catch((error) => {
    console.error("❌ Error creando el tenant:", error.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
