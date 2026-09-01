/**
 * Aplica un preset de rubro (ver data/businessPresets.ts) al crear un tenant
 * nuevo: crea las ProductCategory + Product de ejemplo que el usuario dejó
 * tildadas en el wizard de /trial-signup. Corre DENTRO de la misma
 * transaccion que crea el Tenant (ver trialSignup.service.ts) - por eso
 * recibe el `tx` en vez de importar el prisma singleton.
 */
import { Prisma, ProductType, SaleUnit } from "@prisma/client";
import { BUSINESS_PRESETS, getBusinessPresetBySlug, type BusinessPreset } from "../data/businessPresets";

export type BusinessPresetSelection = {
  categories: { name: string; products?: string[] }[];
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ProductCategory.slug y Product.sku no son unicos solo dentro del tenant
// nuevo (slug es global, ver "known gaps" en CLAUDE.md) - se resuelve el
// choque agregando un sufijo, igual que category.service.ts#generateUniqueSlug.
async function uniqueCategorySlug(tx: Prisma.TransactionClient, name: string) {
  const base = slugify(name) || "categoria";
  let candidate = base;
  let counter = 2;

  while (await tx.productCategory.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${counter}`;
    counter++;
  }

  return candidate;
}

async function uniqueSku(tx: Prisma.TransactionClient, tenantId: string, name: string) {
  const base = slugify(name).toUpperCase().slice(0, 20) || "PROD";
  let candidate = base;
  let counter = 2;

  while (
    await tx.product.findUnique({ where: { tenantId_sku: { tenantId, sku: candidate } }, select: { id: true } })
  ) {
    candidate = `${base}-${counter}`;
    counter++;
  }

  return candidate;
}

export const businessPresetService = {
  /** Catálogo completo de presets, para que el wizard del signup arme el checklist. */
  list(): BusinessPreset[] {
    return BUSINESS_PRESETS;
  },

  getBySlug: getBusinessPresetBySlug,

  /**
   * Crea las categorias/productos elegidos. `selection` es lo que el usuario
   * dejó tildado en el wizard (por nombre, no por id - todavía no existen);
   * si viene undefined se aplica el preset completo (ej. alta manual desde
   * createTenant.ts, que no pasa por ningun wizard).
   */
  async apply(
    tx: Prisma.TransactionClient,
    tenantId: string,
    businessType: string,
    selection?: BusinessPresetSelection
  ) {
    const preset = getBusinessPresetBySlug(businessType);
    if (!preset) return [];

    const chosenCategories = selection
      ? preset.categories.filter((c) => selection.categories.some((sc) => sc.name === c.name))
      : preset.categories;

    const createdProducts: { id: string; price: number; pricePerKg: number | null }[] = [];

    for (const cat of chosenCategories) {
      const categorySelection = selection?.categories.find((sc) => sc.name === cat.name);
      const chosenProducts =
        categorySelection?.products?.length
          ? cat.products.filter((p) => categorySelection.products!.includes(p.name))
          : selection
            ? [] // categoria tildada pero sin ningun producto tildado adentro: se crea vacia
            : cat.products;

      const category = await tx.productCategory.create({
        data: { tenantId, name: cat.name, slug: await uniqueCategorySlug(tx, cat.name) },
      });

      for (const p of chosenProducts) {
        const saleUnit: SaleUnit = p.saleUnit === "KG" ? SaleUnit.KG : SaleUnit.UNIT;
        const price = saleUnit === SaleUnit.UNIT ? p.price : 0;
        const pricePerKg = saleUnit === SaleUnit.KG ? p.price : null;

        const product = await tx.product.create({
          data: {
            tenantId,
            name: p.name,
            sku: await uniqueSku(tx, tenantId, p.name),
            categoryId: category.id,
            type: ProductType.SIMPLE,
            saleUnit,
            price,
            clientPrice: price,
            wholesalePrice: price,
            pricePerKg,
            clientPricePerKg: pricePerKg,
            wholesalePricePerKg: pricePerKg,
            ivaRate: p.ivaRate ?? 21,
            isService: !!p.isService,
            isActive: true,
          },
        });

        createdProducts.push({ id: product.id, price: product.price, pricePerKg: product.pricePerKg });
      }
    }

    return createdProducts;
  },
};
