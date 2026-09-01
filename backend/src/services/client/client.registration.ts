/**
 * Alta de clientes (creado por admin y autoregistro desde la tienda).
 * Extraido de client.service.ts (doc seccion 4 - modularizacion).
 */
import prisma from "../../prisma";
import bcrypt from "bcryptjs";
import { CategoryClient, Role } from "@prisma/client";
import { currentTenantId } from "../../context/tenantContext";
import { tenantScope } from "../../utils/tenantScope";
import {
  DEFAULT_CLIENT_PASSWORD,
  normalizeCategory,
  normalizeDocumentType,
  normalizeIvaCondition,
  cleanEmail,
  cleanString,
  buildAddressData,
  clientUserSelect,
  type ClientCategory,
  type ClientAddressData,
} from "./client.helpers";

export async function createClient(data: {
  nombre: string;
  apellido?: string | null;
  dni?: string | null;
  documentType?: string | null;
  ivaCondition?: string | null;
  category?: ClientCategory;
  telefono?: string | null;
  gmail?: string | null;
  creditLimit?: number | null;
  isAccountEnabled?: boolean;
  priceListId?: string | null;
} & ClientAddressData) {
  const nombre = String(data.nombre || "").trim();
  const apellido = cleanString(data.apellido);
  const dni = cleanString(data.dni);
  const documentType = normalizeDocumentType(data.documentType);
  const ivaCondition = normalizeIvaCondition(data.ivaCondition);
  const gmail = cleanEmail(data.gmail);

  if (!nombre) throw new Error("El nombre es obligatorio");

  const category = normalizeCategory(data.category);
  const addressData = buildAddressData(data);

  return prisma.$transaction(async (tx) => {
    if (gmail) {
      const existingUser = await tx.user.findFirst({
        where: { email: gmail, ...tenantScope() },
      });

      if (existingUser) {
        throw new Error("Ya existe un usuario con ese email");
      }
    }

    if (dni) {
      const existingClientByDni = await tx.client.findFirst({
        where: { dni, ...tenantScope() },
      });

      if (existingClientByDni) {
        throw new Error("Ya existe un cliente con ese DNI/CUIT");
      }
    }

    if (gmail) {
      const existingClientByEmail = await tx.client.findFirst({
        where: { gmail, ...tenantScope() },
      });

      if (existingClientByEmail) {
        throw new Error("Ya existe un cliente con ese email");
      }
    }

    // El login (User rol CLIENTE) solo tiene sentido si hay email para
    // loguearse -- un alta rapida sin email (ej. desde el buscador de
    // POS/Servicios) queda como registro interno nada mas, sin cuenta.
    let userId: string | null = null;

    if (gmail) {
      const hashedPassword = await bcrypt.hash(DEFAULT_CLIENT_PASSWORD, 10);

      const user = await tx.user.create({
        data: {
          email: gmail,
          password: hashedPassword,
          name: `${nombre} ${apellido ?? ""}`.trim(),
          role: Role.CLIENTE,
          isActive: true,
          mustChangePassword: true,
          tenantId: currentTenantId(),
        },
      });

      userId = user.id;
    }

    let priceListId: string | null = null;

    if (data.priceListId) {
      const priceList = await tx.priceList.findFirst({
        where: { id: data.priceListId, ...tenantScope() },
        select: { id: true },
      });

      if (!priceList) throw new Error("Lista de precios no encontrada");

      priceListId = priceList.id;
    }

    return tx.client.create({
      data: {
        nombre,
        apellido,
        dni,
        documentType,
        ivaCondition,
        category,
        telefono: data.telefono ?? null,
        gmail,
        creditLimit: data.creditLimit ?? null,
        isAccountEnabled: data.isAccountEnabled ?? false,
        priceListId,
        userId,
        tenantId: currentTenantId(),
        ...addressData,
      },
      include: {
        user: {
          select: clientUserSelect,
        },
        _count: {
          select: {
            sales: true,
            accountMovements: true,
          },
        },
      },
    });
  });
}

export async function registerStoreClient(data: {
  nombre: string;
  apellido: string;
  dni: string;
  telefono?: string | null;
  gmail: string;
  password: string;
} & ClientAddressData) {
  const nombre = String(data.nombre || "").trim();
  const apellido = String(data.apellido || "").trim();
  const dni = String(data.dni || "").trim();
  const gmail = cleanEmail(data.gmail);

  if (!nombre) throw new Error("El nombre es obligatorio");
  if (!apellido) throw new Error("El apellido es obligatorio");
  if (!dni) throw new Error("El DNI/CUIT es obligatorio");
  if (!gmail) throw new Error("El email es obligatorio");

  if (!data.password || data.password.length < 6) {
    throw new Error("La contraseña debe tener al menos 6 caracteres");
  }

  const addressData = buildAddressData(data);

  return prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findFirst({
      where: { email: gmail, ...tenantScope() },
    });

    if (existingUser) {
      throw new Error("Ya existe un usuario con ese email");
    }

    const existingClientByDni = await tx.client.findFirst({
      where: { dni, ...tenantScope() },
    });

    if (existingClientByDni) {
      throw new Error("Ya existe un cliente con ese DNI/CUIT");
    }

    const existingClientByEmail = await tx.client.findFirst({
      where: { gmail, ...tenantScope() },
    });

    if (existingClientByEmail) {
      throw new Error("Ya existe un cliente con ese email");
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await tx.user.create({
      data: {
        email: gmail,
        password: hashedPassword,
        name: `${nombre} ${apellido}`.trim(),
        role: Role.CLIENTE,
        isActive: true,
        mustChangePassword: false,
        tenantId: currentTenantId(),
      },
    });

    return tx.client.create({
      data: {
        nombre,
        apellido,
        dni,
        telefono: data.telefono ?? null,
        gmail,
        category: CategoryClient.Price,
        creditLimit: null,
        isAccountEnabled: false,
        userId: user.id,
        tenantId: currentTenantId(),
        ...addressData,
      },
      include: {
        user: {
          select: clientUserSelect,
        },
        _count: {
          select: {
            sales: true,
            accountMovements: true,
          },
        },
      },
    });
  });
}
