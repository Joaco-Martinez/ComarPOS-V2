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
 * El "slug" es solo un identificador legible del tenant (se usa en el panel
 * de super-admin y como fallback del header X-Tenant-Slug en dev) - ya no
 * hay resolucion por subdominio (src/middleware/tenant.ts).
 */
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { LEGACY_CATEGORY_ACCOUNTS } from "../utils/legacyFinanceCategories";

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

  if (!rawSlug) throw new Error("Falta --slug (identificador del negocio, ej. negocio-dos)");
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

    // Plan de cuentas default (isSystem=true), mismo set que se sembro para
    // los tenants preexistentes en la migracion 20260826200000_add_finance_account
    // -- asi un tenant nuevo no arranca con el selector de cuentas vacio.
    await tx.financeAccount.createMany({
      data: LEGACY_CATEGORY_ACCOUNTS.map((c) => ({
        tenantId: tenant.id,
        name: c.label,
        type: c.type,
        isSystem: true,
        isActive: true,
      })),
    });

    // Lista de precios default (doc "listas de precios") - siempre existe,
    // no se puede renombrar/eliminar, se sincroniza sola desde el precio de
    // cada producto (ver priceList.service.ts#syncDefaultPriceListItem).
    await tx.priceList.create({
      data: {
        tenantId: tenant.id,
        name: "Minorista",
        description: "Lista principal (venta al público) - se sincroniza con el precio del producto",
        isDefault: true,
        isActive: true,
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
    console.log(`Slug: ${tenant.slug}`);
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
      `Cada usuario entra a su tenant por login (email/password), no por dominio. En desarrollo podés forzar este tenant para rutas publicas/anonimas con el header "X-Tenant-Slug: ${tenant.slug}".`
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
