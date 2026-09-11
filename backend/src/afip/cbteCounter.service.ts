import prisma from "../prisma";
import { currentTenantId } from "../context/tenantContext";

export const cbteCounterService = {
  // Nota: el unique compuesto tenantId_arcaConfigId_ptoVta_cbteTipo no se
  // puede usar como `where` directo de Prisma (el tipo generado exige
  // tenantId/arcaConfigId: string, no admite null, aunque las columnas son
  // nullable) -> se busca/actualiza por findFirst + create/update en vez de
  // findUnique/upsert. arcaConfigId identifica a que dueno (CUIT) pertenece
  // este contador -- sin multi-facturacion sigue siendo el unico ArcaConfig
  // del tenant, pero ya no se asume implicito (ver wsfe-base.service.ts).
  async peekNext(ptoVta: number, cbteTipo: number, arcaConfigId?: string | null): Promise<number> {
    const tenantId = currentTenantId() ?? null;

    const counter = await prisma.cbteCounter.findFirst({
      where: { tenantId, arcaConfigId: arcaConfigId ?? null, ptoVta, cbteTipo },
    });

    // Si no existe, el “último” es 0
    const last = counter?.lastNumber ?? 0;
    return last + 1;
  },

  async commitUsed(ptoVta: number, cbteTipo: number, usedNumber: number, arcaConfigId?: string | null) {
    const tenantId = currentTenantId() ?? null;

    const existing = await prisma.cbteCounter.findFirst({
      where: { tenantId, arcaConfigId: arcaConfigId ?? null, ptoVta, cbteTipo },
      select: { id: true },
    });

    if (existing) {
      await prisma.cbteCounter.update({
        where: { id: existing.id },
        data: { lastNumber: usedNumber },
      });
    } else {
      await prisma.cbteCounter.create({
        data: { tenantId, arcaConfigId: arcaConfigId ?? null, ptoVta, cbteTipo, lastNumber: usedNumber },
      });
    }
  },
};
