import prisma from "../prisma";
import { currentTenantId } from "../context/tenantContext";

export const cbteCounterService = {
  // Nota: el unique compuesto tenantId_ptoVta_cbteTipo no se puede usar como
  // `where` directo de Prisma (el tipo generado exige tenantId: string, no
  // admite null, aunque la columna es nullable) -> se busca/actualiza por
  // findFirst + create/update en vez de findUnique/upsert.
  async peekNext(ptoVta: number, cbteTipo: number): Promise<number> {
    const tenantId = currentTenantId() ?? null;

    const counter = await prisma.cbteCounter.findFirst({
      where: { tenantId, ptoVta, cbteTipo },
    });

    // Si no existe, el “último” es 0
    const last = counter?.lastNumber ?? 0;
    return last + 1;
  },

  async commitUsed(ptoVta: number, cbteTipo: number, usedNumber: number) {
    const tenantId = currentTenantId() ?? null;

    const existing = await prisma.cbteCounter.findFirst({
      where: { tenantId, ptoVta, cbteTipo },
      select: { id: true },
    });

    if (existing) {
      await prisma.cbteCounter.update({
        where: { id: existing.id },
        data: { lastNumber: usedNumber },
      });
    } else {
      await prisma.cbteCounter.create({
        data: { tenantId, ptoVta, cbteTipo, lastNumber: usedNumber },
      });
    }
  },
};
