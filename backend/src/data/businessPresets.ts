/**
 * Presets de configuracion inicial por rubro (doc "wizard tipo Treinta" -
 * /trial-signup deja elegir un rubro y precarga categorias + productos de
 * ejemplo, ver businessPreset.service.ts#apply). Los slugs coinciden a
 * proposito con frontend/components/landing/verticals.ts (mismo catalogo de
 * rubros que ya se usa en el marketing de la landing, para no mantener dos
 * listas de rubros distintas) - si se agrega un rubro nuevo ahi, agregar acá
 * su preset (o el selector del wizard lo va a mostrar sin contenido para
 * precargar).
 *
 * Los precios son placeholders (numeros redondos) para que el negocio no
 * arranque con productos en $0 - se espera que el dueño los ajuste a los
 * reales antes de vender (misma logica que cualquier alta manual de
 * producto).
 */
export type BusinessPresetProduct = {
  name: string;
  price: number;
  ivaRate?: number;
  saleUnit?: "UNIT" | "KG";
  isService?: boolean;
};

export type BusinessPresetCategory = {
  name: string;
  products: BusinessPresetProduct[];
};

export type BusinessPreset = {
  slug: string;
  label: string;
  categories: BusinessPresetCategory[];
};

export const BUSINESS_PRESETS: BusinessPreset[] = [
  {
    slug: "kioscos-y-almacenes",
    label: "Kioscos y almacenes",
    categories: [
      {
        name: "Bebidas",
        products: [
          { name: "Coca-Cola 500ml", price: 1500 },
          { name: "Agua mineral 500ml", price: 900 },
        ],
      },
      {
        name: "Golosinas",
        products: [
          { name: "Alfajor Jorgito", price: 800 },
          { name: "Chicles Beldent", price: 500 },
        ],
      },
      {
        name: "Almacén",
        products: [
          { name: "Arroz 1kg", price: 2200 },
          { name: "Fideos 500g", price: 1400 },
        ],
      },
      {
        name: "Cigarrillos",
        products: [{ name: "Marlboro Box", price: 4500 }],
      },
    ],
  },
  {
    slug: "veterinarias",
    label: "Veterinarias",
    categories: [
      {
        name: "Alimento balanceado",
        products: [
          { name: "Bolsa alimento perro 15kg", price: 35000 },
          { name: "Bolsa alimento gato 3kg", price: 12000 },
        ],
      },
      {
        name: "Accesorios",
        products: [
          { name: "Correa", price: 6000 },
          { name: "Cucha chica", price: 15000 },
        ],
      },
      {
        name: "Higiene",
        products: [{ name: "Shampoo antipulgas", price: 8500 }],
      },
      {
        name: "Servicios",
        products: [
          { name: "Consulta veterinaria", price: 20000, isService: true },
          { name: "Baño y peluquería", price: 15000, isService: true },
        ],
      },
    ],
  },
  {
    slug: "electronica",
    label: "Electrónica",
    categories: [
      {
        name: "Celulares y accesorios",
        products: [
          { name: "Cargador USB-C", price: 8000 },
          { name: "Auriculares Bluetooth", price: 25000 },
        ],
      },
      {
        name: "Cómputo",
        products: [
          { name: "Mouse inalámbrico", price: 12000 },
          { name: "Pendrive 32GB", price: 9000 },
        ],
      },
      {
        name: "Audio y video",
        products: [{ name: "Parlante Bluetooth", price: 35000 }],
      },
    ],
  },
  {
    slug: "chocolaterias-y-golosinas",
    label: "Chocolatería y golosinas",
    categories: [
      {
        name: "Chocolates",
        products: [
          { name: "Chocolate con leche 100g", price: 3500 },
          { name: "Bombones surtidos", price: 6000 },
        ],
      },
      {
        name: "Caramelos y gomitas",
        products: [
          { name: "Caramelos masticables", price: 1200 },
          { name: "Gomitas ácidas", price: 1800 },
        ],
      },
      {
        name: "Combos y regalos",
        products: [{ name: "Caja regalo surtida", price: 12000 }],
      },
    ],
  },
  {
    slug: "indumentaria",
    label: "Indumentaria",
    categories: [
      {
        name: "Remeras",
        products: [{ name: "Remera básica", price: 12000 }],
      },
      {
        name: "Pantalones",
        products: [{ name: "Jean clásico", price: 28000 }],
      },
      {
        name: "Calzado",
        products: [{ name: "Zapatillas urbanas", price: 45000 }],
      },
      {
        name: "Accesorios",
        products: [{ name: "Gorra", price: 8000 }],
      },
    ],
  },
  {
    slug: "ferreterias",
    label: "Ferreterías",
    categories: [
      {
        name: "Tornillería",
        products: [
          { name: "Tornillos autorroscantes x100", price: 3500 },
          { name: "Tarugos x50", price: 2000 },
        ],
      },
      {
        name: "Pinturas",
        products: [
          { name: "Pintura látex 4L", price: 18000 },
          { name: "Pincel", price: 2500 },
        ],
      },
      {
        name: "Herramientas",
        products: [
          { name: "Martillo", price: 9000 },
          { name: "Set destornilladores", price: 11000 },
        ],
      },
      {
        name: "Electricidad",
        products: [{ name: "Cable 2.5mm (x metro)", price: 800 }],
      },
    ],
  },
  {
    slug: "distribuidoras",
    label: "Distribuidoras",
    categories: [
      {
        name: "Bebidas por mayor",
        products: [{ name: "Pack Coca-Cola 500ml x12", price: 15000 }],
      },
      {
        name: "Almacén por mayor",
        products: [{ name: "Caja fideos 500g x24", price: 28000 }],
      },
      {
        name: "Limpieza por mayor",
        products: [{ name: "Pack detergente x12", price: 14000 }],
      },
    ],
  },
  {
    slug: "farmacias",
    label: "Farmacias",
    categories: [
      {
        name: "Medicamentos de venta libre",
        products: [
          { name: "Ibuprofeno 400mg", price: 3500 },
          { name: "Paracetamol 500mg", price: 3000 },
        ],
      },
      {
        name: "Perfumería",
        products: [
          { name: "Jabón de tocador", price: 1500 },
          { name: "Shampoo", price: 4500 },
        ],
      },
      {
        name: "Cuidado personal",
        products: [{ name: "Protector solar FPS50", price: 9000 }],
      },
    ],
  },
  {
    slug: "librerias",
    label: "Librerías",
    categories: [
      {
        name: "Útiles escolares",
        products: [
          { name: "Cuaderno A4 tapa dura", price: 4500 },
          { name: "Cartuchera con útiles", price: 8000 },
        ],
      },
      {
        name: "Papelería",
        products: [
          { name: "Resma A4", price: 6500 },
          { name: "Bolígrafos x3", price: 1800 },
        ],
      },
      {
        name: "Arte",
        products: [{ name: "Témperas x12", price: 5500 }],
      },
    ],
  },
  {
    slug: "vinotecas",
    label: "Vinotecas",
    categories: [
      {
        name: "Vinos tintos",
        products: [{ name: "Malbec reserva", price: 8500 }],
      },
      {
        name: "Vinos blancos",
        products: [{ name: "Chardonnay", price: 7500 }],
      },
      {
        name: "Espumantes",
        products: [{ name: "Extra brut", price: 9500 }],
      },
      {
        name: "Accesorios",
        products: [{ name: "Sacacorchos", price: 3500 }],
      },
    ],
  },
  {
    slug: "perfumerias",
    label: "Perfumerías",
    categories: [
      {
        name: "Perfumes",
        products: [{ name: "Perfume unisex 100ml", price: 25000 }],
      },
      {
        name: "Cuidado facial",
        products: [{ name: "Crema hidratante", price: 8000 }],
      },
      {
        name: "Cuidado capilar",
        products: [{ name: "Shampoo profesional", price: 7000 }],
      },
    ],
  },
  {
    slug: "otro",
    label: "Otro rubro",
    categories: [
      {
        name: "General",
        products: [{ name: "Producto de ejemplo", price: 1000 }],
      },
    ],
  },
];

export function getBusinessPresetBySlug(slug: string): BusinessPreset | undefined {
  return BUSINESS_PRESETS.find((p) => p.slug === slug);
}
