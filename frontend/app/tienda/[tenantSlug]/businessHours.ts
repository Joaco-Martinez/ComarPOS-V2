export type BusinessHoursDay = { day: number; enabled: boolean; open: string; close: string };

export const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const DAY_NAMES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function defaultBusinessHours(): BusinessHoursDay[] {
  return Array.from({ length: 7 }, (_, day) => ({
    day,
    enabled: day !== 0,
    open: '09:00',
    close: '18:00',
  }));
}

/** Normaliza lo que venga de la API (puede ser null/shape vieja/incompleta) a las 7 filas esperadas. */
export function normalizeBusinessHours(value: unknown): BusinessHoursDay[] {
  if (!Array.isArray(value)) return defaultBusinessHours();

  const byDay = new Map<number, BusinessHoursDay>();
  for (const row of value) {
    if (row && typeof row === 'object' && typeof (row as any).day === 'number') {
      const r = row as any;
      byDay.set(r.day, {
        day: r.day,
        enabled: !!r.enabled,
        open: typeof r.open === 'string' ? r.open : '09:00',
        close: typeof r.close === 'string' ? r.close : '18:00',
      });
    }
  }

  return Array.from({ length: 7 }, (_, day) => byDay.get(day) ?? { day, enabled: false, open: '09:00', close: '18:00' });
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Estado "abierto ahora" en base a la hora local del navegador de quien mira la tienda. */
export function getOpenStatus(hours: BusinessHoursDay[], now = new Date()): { isOpenNow: boolean; todayLabel: string } {
  const today = hours.find((h) => h.day === now.getDay());
  if (!today || !today.enabled) return { isOpenNow: false, todayLabel: 'Cerrado hoy' };

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = toMinutes(today.open);
  const closeMinutes = toMinutes(today.close);
  const isOpenNow = nowMinutes >= openMinutes && nowMinutes < closeMinutes;

  return { isOpenNow, todayLabel: `Hoy ${today.open} a ${today.close}` };
}
