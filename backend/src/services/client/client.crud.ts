/**
 * Lectura, edicion y baja de clientes.
 * Extraido de client.service.ts (doc seccion 4 - modularizacion).
 */
import prisma from "../../prisma";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { tenantScope } from "../../utils/tenantScope";
import { currentTenantId } from "../../context/tenantContext";
import {
  DEFAULT_CLIENT_PASSWORD,
  normalizeCategory,
  cleanEmail,
  cleanString,
  buildAddressData,
  clientUserSelect,
  type ClientCategory,
  type ClientAddressData,
} from "./client.helpers";

export async function getClients(options?: { includeLoyalty?: boolean }) {
  return prisma.client.findMany({
    where: { ...tenantScope() },
    orderBy: { createdAt: "desc" },
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
      ...(options?.includeLoyalty ? { loyaltyAccount: true } : {}),
    },
  });
}

export async function getClientById(id: string) {
  return prisma.client.findFirst({
    where: { id, ...tenantScope() },
    include: {
      user: {
        select: clientUserSelect,
      },
      sales: {
        orderBy: { createdAt: "desc" },
        include: {
          payments: true,
          businessLocation: true,
          items: {
            include: { product: true },
          },
        },
      },
      accountMovements: {
        orderBy: { date: "desc" },
        include: {
          sale: {
            select: {
              id: true,
              total: true,
              status: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });
}

export async function updateClient(
  id: string,
  data: Partial<
    {
      nombre: string;
      apellido: string | null;
      dni: string | null;
      telefono: string | null;
      gmail: string | null;
      category: ClientCategory;
      creditLimit: number | null;
      isAccountEnabled: boolean;

      createUser: boolean;
      password: string;
      unlinkUser: boolean;
    } & ClientAddressData
  >
) {
  const existing = await prisma.client.findFirst({
    where: { id, ...tenantScope() },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
  });

  if (!existing) throw new Error("Cliente no encontrado");

  const cleanData: any = {};

  if (data.nombre !== undefined) cleanData.nombre = String(data.nombre).trim();
  if (data.apellido !== undefined) cleanData.apellido = cleanString(data.apellido);
  if (data.dni !== undefined) cleanData.dni = cleanString(data.dni);
  if (data.telefono !== undefined) cleanData.telefono = cleanString(data.telefono);
  if (data.gmail !== undefined) cleanData.gmail = cleanEmail(data.gmail);
  if (data.category !== undefined) cleanData.category = normalizeCategory(data.category);
  if (data.creditLimit !== undefined) cleanData.creditLimit = data.creditLimit;
  if (data.isAccountEnabled !== undefined) cleanData.isAccountEnabled = data.isAccountEnabled;

  Object.assign(cleanData, buildAddressData(data));

  return prisma.$transaction(async (tx) => {
    if (data.unlinkUser === true && existing.userId) {
      cleanData.userId = null;
    }

    if (data.createUser === true && !existing.userId) {
      const email = cleanEmail(data.gmail ?? existing.gmail);

      if (!email) {
        throw new Error("Para crear login, el email es obligatorio");
      }

      const existingUser = await tx.user.findFirst({
        where: { email, ...tenantScope() },
      });

      if (existingUser) {
        throw new Error("Ya existe un usuario con ese email");
      }

      const nombre = cleanData.nombre ?? existing.nombre;
      const apellido = cleanData.apellido ?? existing.apellido ?? "";
      const hashedPassword = await bcrypt.hash(DEFAULT_CLIENT_PASSWORD, 10);

      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          name: `${nombre} ${apellido}`.trim(),
          role: Role.CLIENTE,
          isActive: true,
          mustChangePassword: true,
          tenantId: currentTenantId(),
        },
      });

      cleanData.userId = user.id;
      cleanData.gmail = email;
    }

    if (existing.userId && cleanData.gmail) {
      const emailAlreadyUsed = await tx.user.findFirst({
        where: {
          email: cleanData.gmail,
          id: { not: existing.userId },
        },
      });

      if (emailAlreadyUsed) {
        throw new Error("Ya existe un usuario con ese email");
      }

      await tx.user.update({
        where: { id: existing.userId },
        data: {
          email: cleanData.gmail,
          name: `${cleanData.nombre ?? existing.nombre} ${
            cleanData.apellido ?? existing.apellido ?? ""
          }`.trim(),
        },
      });
    }

    return tx.client.update({
      where: { id },
      data: cleanData,
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

export async function deleteClient(id: string) {
  const client = await prisma.client.findFirst({
    where: { id, ...tenantScope() },
    select: {
      id: true,
      currentBalance: true,
      userId: true,
      _count: {
        select: {
          sales: true,
          accountMovements: true,
        },
      },
    },
  });

  if (!client) throw Object.assign(new Error("Cliente no encontrado"), { status: 404 });

  if (client.currentBalance > 0) {
    throw Object.assign(new Error("No se puede eliminar un cliente con saldo deudor"), { status: 409 });
  }

  if (client._count.sales > 0 || client._count.accountMovements > 0) {
    throw Object.assign(
      new Error("No se puede eliminar un cliente con historial de ventas o cuenta corriente"),
      { status: 409 }
    );
  }

  return prisma.client.delete({ where: { id } });
}
