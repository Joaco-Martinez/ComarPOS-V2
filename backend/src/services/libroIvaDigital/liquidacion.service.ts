/**
 * Liquidacion de IVA mensual -- el paso que falta despues de tener el Libro
 * IVA Digital (RG 4597) armado: cuanto IVA hay que pagar (o cuanto saldo a
 * favor queda) en el mes, reutilizando getVentasLibroIvaDigital/
 * getComprasLibroIvaDigital como fuente de datos.
 *
 * Definiciones:
 * - Debito fiscal: IVA de las facturas de Ventas del periodo (importeIva de
 *   cada comprobante aprobado).
 * - Credito fiscal: IVA liquidado en las facturas de Compras del periodo
 *   (importeIvaLiquidado, calculado a partir de los items) MAS la
 *   percepcion de IVA sufrida (percepcionIva) -- ambos son IVA que el
 *   negocio ya pago/le retuvieron y puede computar contra el debito fiscal.
 *   Deliberadamente NO se suman las otras percepciones de Compras
 *   (IIBB, municipales, impuestos internos, otras nacionales): esas no son
 *   IVA, son otros impuestos/regimenes -- entran en otras declaraciones,
 *   no en la liquidacion de IVA.
 * - Saldo tecnico: debitoFiscal - creditoFiscal - saldoTecnicoAnterior
 *   (el saldo a favor arrastrado del periodo previo, siempre >= 0 -- solo
 *   se arrastra si el periodo anterior CERRADO dio a favor). Positivo =
 *   A_PAGAR; cero o negativo = A_FAVOR (la magnitud es lo que se arrastra
 *   al periodo siguiente).
 *
 * Un periodo se puede recalcular libremente mientras no este CERRADO (no
 * se persiste en la base hasta el primer calculo/cierre -- ver
 * getLiquidacion). Al cerrarlo, queda congelado (status=CERRADO) para que
 * cargar/editar compras o ventas retroactivas del mes no corra el piso ya
 * declarado -- reabrirlo es una accion explicita aparte (reabrirLiquidacion),
 * nunca implicita.
 */
import prisma from "../../prisma";
import { VatSettlementResult, VatSettlementStatus, VatSettlement } from "@prisma/client";
import { tenantScope } from "../../utils/tenantScope";
import { currentTenantId } from "../../context/tenantContext";
import { AppError } from "../../utils/asyncHandler";
import { monthRangeAR } from "../../utils/dateAR";
import { getVentasLibroIvaDigital } from "./ventas.service";
import { getComprasLibroIvaDigital } from "./compras.service";

function round2(n: number) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export type SaldoTecnicoCalcInput = {
  debitoFiscal: number;
  creditoFiscal: number;
  /** Saldo a favor arrastrado del periodo anterior (siempre >= 0). */
  saldoTecnicoAnterior: number;
};

export type SaldoTecnicoCalcResult = {
  /** Positivo = a pagar. Cero o negativo = a favor (magnitud = credito remanente). */
  saldoTecnico: number;
  resultado: VatSettlementResult;
  /** Lo que se arrastra al periodo siguiente (0 si el resultado fue A_PAGAR). */
  saldoAFavorProximoPeriodo: number;
};

/**
 * Funcion pura: debito fiscal - credito fiscal - saldo a favor arrastrado.
 * Sin tocar DB -- es lo que se testea en __tests__/liquidacion.test.ts.
 */
export function calcularSaldoTecnico(input: SaldoTecnicoCalcInput): SaldoTecnicoCalcResult {
  const saldoTecnico = round2(
    Number(input.debitoFiscal) - Number(input.creditoFiscal) - Number(input.saldoTecnicoAnterior)
  );

  if (saldoTecnico > 0) {
    return { saldoTecnico, resultado: VatSettlementResult.A_PAGAR, saldoAFavorProximoPeriodo: 0 };
  }

  return {
    saldoTecnico,
    resultado: VatSettlementResult.A_FAVOR,
    saldoAFavorProximoPeriodo: round2(Math.abs(saldoTecnico)),
  };
}

/** Periodo (year, month) inmediatamente anterior a este, cruzando de año en enero. */
function previousPeriod(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function validatePeriod(year: number, month: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new AppError("PERIODO_INVALIDO", "Indicá un year y month válidos (ej. year=2026, month=8)", 400);
  }
}

/** Saldo a favor que se arrastra desde el periodo anterior CERRADO (0 si no hay o si dio a pagar). */
async function getSaldoTecnicoAnteriorCarry(year: number, month: number): Promise<number> {
  const { year: py, month: pm } = previousPeriod(year, month);
  const prev = await prisma.vatSettlement.findFirst({
    where: { ...tenantScope(), year: py, month: pm, status: VatSettlementStatus.CERRADO },
  });
  if (!prev) return 0;
  return prev.resultado === VatSettlementResult.A_FAVOR ? round2(Math.abs(prev.saldoTecnico)) : 0;
}

type PeriodoCalculado = {
  year: number;
  month: number;
  debitoFiscal: number;
  creditoFiscal: number;
  saldoTecnicoAnterior: number;
} & SaldoTecnicoCalcResult;

/** Calcula el periodo en base a Ventas/Compras + el arrastre, sin tocar la tabla VatSettlement. */
async function calcularPeriodo(year: number, month: number): Promise<PeriodoCalculado> {
  const { start, end } = monthRangeAR(year, month);

  const [ventas, compras, saldoTecnicoAnterior] = await Promise.all([
    getVentasLibroIvaDigital({ from: start, to: end }),
    getComprasLibroIvaDigital({ from: start, to: end }),
    getSaldoTecnicoAnteriorCarry(year, month),
  ]);

  const debitoFiscal = round2(ventas.cbte.reduce((sum, r) => sum + r.importeIva, 0));
  const creditoFiscal = round2(
    compras.cbte.reduce((sum, r) => sum + r.importeIvaLiquidado + r.percepcionIva, 0)
  );

  const calc = calcularSaldoTecnico({ debitoFiscal, creditoFiscal, saldoTecnicoAnterior });

  return { year, month, debitoFiscal, creditoFiscal, saldoTecnicoAnterior, ...calc };
}

export type LiquidacionView = PeriodoCalculado & {
  id: string | null;
  status: VatSettlementStatus;
  closedAt: Date | null;
  closedByUserId: string | null;
  /** false cuando el periodo ya esta CERRADO (los valores son los congelados, no un recalculo en vivo). */
  editable: boolean;
};

/**
 * Devuelve la liquidacion del periodo. Si esta CERRADA, devuelve el
 * registro persistido tal cual quedo al cerrar (no recalcula: ventas/
 * compras cargadas despues con fecha retroactiva no deben mover un periodo
 * ya declarado). Si no esta cerrada (o no existe todavia registro), calcula
 * en vivo contra Ventas/Compras.
 */
export async function getLiquidacion(year: number, month: number): Promise<LiquidacionView> {
  validatePeriod(year, month);

  const stored = await prisma.vatSettlement.findFirst({ where: { ...tenantScope(), year, month } });

  if (stored && stored.status === VatSettlementStatus.CERRADO) {
    return {
      id: stored.id,
      year: stored.year,
      month: stored.month,
      debitoFiscal: stored.debitoFiscal,
      creditoFiscal: stored.creditoFiscal,
      saldoTecnicoAnterior: stored.saldoTecnicoAnterior,
      saldoTecnico: stored.saldoTecnico,
      resultado: stored.resultado,
      saldoAFavorProximoPeriodo: stored.resultado === VatSettlementResult.A_FAVOR ? round2(Math.abs(stored.saldoTecnico)) : 0,
      status: stored.status,
      closedAt: stored.closedAt,
      closedByUserId: stored.closedByUserId,
      editable: false,
    };
  }

  const calc = await calcularPeriodo(year, month);

  return {
    ...calc,
    id: stored?.id ?? null,
    status: stored?.status ?? VatSettlementStatus.BORRADOR,
    closedAt: stored?.closedAt ?? null,
    closedByUserId: stored?.closedByUserId ?? null,
    editable: true,
  };
}

/** El periodo anterior tiene que estar CERRADO para no romper el arrastre, salvo que sea el primer cierre historico del tenant. */
async function assertPreviousPeriodClosed(year: number, month: number) {
  const anyClosed = await prisma.vatSettlement.count({
    where: { ...tenantScope(), status: VatSettlementStatus.CERRADO },
  });
  if (anyClosed === 0) return; // primer cierre historico: no hay arrastre previo que pueda romperse

  const { year: py, month: pm } = previousPeriod(year, month);
  const prev = await prisma.vatSettlement.findFirst({ where: { ...tenantScope(), year: py, month: pm } });

  if (!prev || prev.status !== VatSettlementStatus.CERRADO) {
    throw new AppError(
      "PERIODO_ANTERIOR_NO_CERRADO",
      `No podés cerrar ${String(month).padStart(2, "0")}/${year} sin cerrar antes el período anterior (${String(pm).padStart(2, "0")}/${py}) -- si no, se rompe el arrastre de saldo a favor.`,
      409
    );
  }
}

/** Cierra (declara) el periodo: recalcula por ultima vez y congela el resultado. */
export async function cerrarLiquidacion(params: {
  year: number;
  month: number;
  userId: string | null;
}): Promise<VatSettlement> {
  validatePeriod(params.year, params.month);

  const existing = await prisma.vatSettlement.findFirst({
    where: { ...tenantScope(), year: params.year, month: params.month },
  });

  if (existing?.status === VatSettlementStatus.CERRADO) {
    throw new AppError(
      "PERIODO_YA_CERRADO",
      `El período ${String(params.month).padStart(2, "0")}/${params.year} ya está cerrado. Para volver a calcularlo hay que reabrirlo primero.`,
      409
    );
  }

  await assertPreviousPeriodClosed(params.year, params.month);

  const calc = await calcularPeriodo(params.year, params.month);
  const tenantId = currentTenantId();

  const data = {
    tenantId,
    year: params.year,
    month: params.month,
    debitoFiscal: calc.debitoFiscal,
    creditoFiscal: calc.creditoFiscal,
    saldoTecnicoAnterior: calc.saldoTecnicoAnterior,
    saldoTecnico: calc.saldoTecnico,
    resultado: calc.resultado,
    status: VatSettlementStatus.CERRADO,
    closedAt: new Date(),
    closedByUserId: params.userId,
  };

  if (existing) {
    return prisma.vatSettlement.update({ where: { id: existing.id }, data });
  }
  return prisma.vatSettlement.create({ data });
}

/**
 * Reabre un periodo cerrado (accion explicita, separada de cualquier
 * lectura/recalculo): vuelve a BORRADOR para que se pueda corregir y
 * volver a cerrar. Los periodos posteriores que ya cerraron y arrastraron
 * su saldo a favor NO se recalculan solos -- si el saldo cambia, hay que
 * reabrirlos y cerrarlos de nuevo en orden.
 */
export async function reabrirLiquidacion(params: { year: number; month: number }): Promise<VatSettlement> {
  validatePeriod(params.year, params.month);

  const existing = await prisma.vatSettlement.findFirst({
    where: { ...tenantScope(), year: params.year, month: params.month },
  });

  if (!existing || existing.status !== VatSettlementStatus.CERRADO) {
    throw new AppError(
      "PERIODO_NO_CERRADO",
      `El período ${String(params.month).padStart(2, "0")}/${params.year} no está cerrado.`,
      409
    );
  }

  return prisma.vatSettlement.update({
    where: { id: existing.id },
    data: { status: VatSettlementStatus.BORRADOR },
  });
}
