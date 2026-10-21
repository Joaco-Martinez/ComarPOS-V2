/**
 * Desglose de IVA por alicuota para los comprobantes A/B (y sus notas de
 * credito). Antes se declaraba TODO al 21% (importe / 1.21), aunque la venta
 * tuviera productos al 10,5%, 27% o 0% -- AFIP recibia un IVA distinto al real.
 *
 * Funcion pura (sin DB), testeada en __tests__/ivaAlicuotas.test.ts. Trabaja
 * en centavos enteros para que se cumpla exacto lo que valida AFIP:
 *   sum(BaseImp) = ImpNeto, sum(Importe) = ImpIVA, ImpNeto + ImpIVA = ImpTotal.
 */

/** Codigo AFIP (tabla "Alicuotas de IVA") por porcentaje. */
export const AFIP_IVA_ID: Record<string, number> = {
  "0": 3,
  "2.5": 9,
  "5": 8,
  "10.5": 4,
  "21": 5,
  "27": 6,
};

export type IvaAlicuota = {
  rate: number;
  id: number;
  baseImp: number;
  importe: number;
};

export type IvaDesglose = {
  neto: number;
  iva: number;
  alicuotas: IvaAlicuota[];
};

const toCents = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100);
const fromCents = (c: number) => c / 100;

function afipIdFor(rate: number): number {
  const id = AFIP_IVA_ID[String(rate)];
  if (id === undefined) {
    throw new Error(`Alícuota de IVA ${rate}% no admitida por AFIP (válidas: 0, 2.5, 5, 10.5, 21 y 27).`);
  }
  return id;
}

/**
 * Reparte `importeTotal` (IVA incluido) entre las alicuotas de los items, en
 * proporcion a sus subtotales -- asi un descuento/recargo de la venta se
 * prorratea entre las alicuotas. Sin items con importe (dato viejo, venta
 * sin items), todo va al 21% como antes.
 */
export function calcularIvaPorAlicuota(
  items: { subtotal: number; ivaRate?: number | null }[],
  importeTotal: number
): IvaDesglose {
  const totalCents = toCents(importeTotal);

  const grossByRate = new Map<number, number>();
  for (const item of items) {
    const rate = item.ivaRate ?? 21;
    const cents = toCents(item.subtotal || 0);
    if (cents <= 0) continue;
    grossByRate.set(rate, (grossByRate.get(rate) ?? 0) + cents);
  }

  const itemsCents = [...grossByRate.values()].reduce((a, b) => a + b, 0);
  if (grossByRate.size === 0 || itemsCents <= 0) {
    grossByRate.clear();
    grossByRate.set(21, totalCents);
  }

  const baseCents = [...grossByRate.values()].reduce((a, b) => a + b, 0);
  const rates = [...grossByRate.keys()].sort((a, b) => a - b);

  // Prorrateo al total real; la alicuota de mayor importe absorbe el
  // redondeo para que la suma de brutos sea exactamente el total.
  const scaled = new Map<number, number>();
  let assigned = 0;
  for (const rate of rates) {
    const cents = Math.round((grossByRate.get(rate)! * totalCents) / baseCents);
    scaled.set(rate, cents);
    assigned += cents;
  }
  const biggest = rates.reduce((best, r) => (scaled.get(r)! > scaled.get(best)! ? r : best), rates[0]);
  scaled.set(biggest, scaled.get(biggest)! + (totalCents - assigned));

  const alicuotas: IvaAlicuota[] = [];
  let netoCents = 0;
  let ivaCents = 0;
  for (const rate of rates) {
    const gross = scaled.get(rate)!;
    if (gross === 0) continue;
    const base = Math.round(gross / (1 + rate / 100));
    const iva = gross - base;
    netoCents += base;
    ivaCents += iva;
    alicuotas.push({ rate, id: afipIdFor(rate), baseImp: fromCents(base), importe: fromCents(iva) });
  }

  return { neto: fromCents(netoCents), iva: fromCents(ivaCents), alicuotas };
}

/** Bloque <ar:Iva> del FECAESolicitar. */
export function ivaXml(alicuotas: IvaAlicuota[]): string {
  if (alicuotas.length === 0) return "";
  return `
              <ar:Iva>${alicuotas
                .map(
                  (a) => `
                <ar:AlicIva>
                  <ar:Id>${a.id}</ar:Id>
                  <ar:BaseImp>${a.baseImp.toFixed(2)}</ar:BaseImp>
                  <ar:Importe>${a.importe.toFixed(2)}</ar:Importe>
                </ar:AlicIva>`
                )
                .join("")}
              </ar:Iva>`;
}
