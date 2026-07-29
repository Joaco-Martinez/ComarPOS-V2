const TZ = 'America/Argentina/Buenos_Aires';
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function partsAR(v: string | Date = new Date()) {
  const d = toDate(v) ?? new Date();
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  return {
    year:  p.find((x) => x.type === 'year')?.value  ?? '1970',
    month: p.find((x) => x.type === 'month')?.value ?? '01',
    day:   p.find((x) => x.type === 'day')?.value   ?? '01',
  };
}

export function todayInputAR() {
  const { year, month, day } = partsAR();
  return `${year}-${month}-${day}`;
}

export function firstDayOfMonthAR() {
  const { year, month } = partsAR();
  return `${year}-${month}-01`;
}

export function toDateInputAR(v?: string | Date | null) {
  if (!v) return '';
  if (typeof v === 'string' && ISO_RE.test(v.slice(0, 10))) return v.slice(0, 10);
  const d = toDate(v);
  if (!d) return '';
  const { year, month, day } = partsAR(d);
  return `${year}-${month}-${day}`;
}

export function startOfDayAR(v: string | Date) {
  const s = typeof v === 'string' && ISO_RE.test(v.slice(0, 10)) ? v.slice(0, 10) : toDateInputAR(v);
  return new Date(`${s}T00:00:00.000-03:00`);
}

export function endOfDayAR(v: string | Date) {
  const s = typeof v === 'string' && ISO_RE.test(v.slice(0, 10)) ? v.slice(0, 10) : toDateInputAR(v);
  return new Date(`${s}T23:59:59.999-03:00`);
}

export function isSameDayAR(a?: string | Date | null, b?: string | Date | null) {
  if (!a || !b) return false;
  return toDateInputAR(a) === toDateInputAR(b);
}

export function formatDateAR(v?: string | Date | null) {
  const d = toDate(v);
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

export function formatDateTimeAR(v?: string | Date | null) {
  const d = toDate(v);
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

export function formatShortDateAR(v?: string | Date | null) {
  const d = toDate(v);
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(d);
}

export function formatTimeAR(v?: string | Date | null) {
  const d = toDate(v);
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}
