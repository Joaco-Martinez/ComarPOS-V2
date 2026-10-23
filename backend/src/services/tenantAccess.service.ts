/**
 * Una cuenta, varios negocios (hoy solo el contador). El negocio "de base"
 * de un usuario sigue siendo User.tenantId; UserTenantAccess suma los demas.
 * El JWT lleva el negocio ACTIVO (tenantId) y, si no es el de base, `ext:
 * true` -- solo esos tokens se re-validan contra la DB en cada request (con
 * cache corta), asi revocar un acceso corta la sesion en menos de
 * ACCESS_CACHE_MS sin que los usuarios de un solo negocio paguen ninguna
 * consulta extra.
 */
import { Role } from "@prisma/client";
import prisma from "../prisma";

export type ResolvedAccess = {
  tenantId: string;
  role: Role;
  isHome: boolean;
};

export type UserTenantOption = {
  tenantId: string;
  slug: string;
  name: string;
  role: Role;
  isHome: boolean;
};

// Roles que pueden tener acceso a negocios ajenos. Si en algun momento se
// abre a otros roles, revisar antes lo que asume cada pantalla del rol.
export const MULTI_TENANT_ROLES: Role[] = [Role.CONTADOR];

/**
 * Con que rol entra `userId` al negocio `tenantId`, o null si no puede.
 * El negocio de base usa User.role; uno ajeno, el rol del acceso.
 */
export async function resolveTenantAccess(userId: string, tenantId: string): Promise<ResolvedAccess | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true, role: true, isActive: true },
  });
  if (!user || user.isActive === false) return null;

  if (user.tenantId === tenantId) return { tenantId, role: user.role, isHome: true };

  const access = await prisma.userTenantAccess.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { role: true, isActive: true },
  });
  if (!access || !access.isActive) return null;

  return { tenantId, role: access.role, isHome: false };
}

/** Negocios a los que puede entrar la cuenta: el de base primero, despues los demas por nombre. */
export async function listUserTenants(userId: string): Promise<UserTenantOption[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      tenant: { select: { id: true, slug: true, name: true } },
      tenantAccesses: {
        where: { isActive: true },
        select: { role: true, tenant: { select: { id: true, slug: true, name: true, isActive: true } } },
      },
    },
  });
  if (!user) return [];

  const others = user.tenantAccesses
    .filter((a) => a.tenant.isActive)
    .map((a) => ({ tenantId: a.tenant.id, slug: a.tenant.slug, name: a.tenant.name, role: a.role, isHome: false }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const home = user.tenant
    ? [{ tenantId: user.tenant.id, slug: user.tenant.slug, name: user.tenant.name, role: user.role, isHome: true }]
    : [];

  return [...home, ...others.filter((o) => o.tenantId !== user.tenant?.id)];
}

// Cache de la verificacion por request de los tokens `ext` (ver
// middleware/auth.ts). Corto a proposito: es el tiempo maximo que un
// contador sigue entrando despues de que el negocio le saca el acceso.
const ACCESS_CACHE_MS = 60 * 1000;
const accessCache = new Map<string, { value: ResolvedAccess | null; at: number }>();

export async function resolveTenantAccessCached(userId: string, tenantId: string) {
  const key = `${userId}:${tenantId}`;
  const hit = accessCache.get(key);
  if (hit && Date.now() - hit.at < ACCESS_CACHE_MS) return hit.value;

  const value = await resolveTenantAccess(userId, tenantId);
  accessCache.set(key, { value, at: Date.now() });
  return value;
}

/** Llamar al dar o sacar un acceso para que el cambio aplique en el proximo request. */
export function invalidateTenantAccess(userId: string, tenantId: string) {
  accessCache.delete(`${userId}:${tenantId}`);
}
