/**
 * Copia solo las claves permitidas de un objeto que viene de req.body.
 * Los services tipan `data` con los campos esperados, pero en runtime el
 * controller les pasa el body crudo: sin esto un `tenantId` (o cualquier otra
 * columna) mandado a mano terminaba en el create/update de Prisma.
 */
export function pickFields<T extends object, K extends keyof T>(data: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) {
    if (data && Object.prototype.hasOwnProperty.call(data, key) && data[key] !== undefined) {
      out[key] = data[key];
    }
  }
  return out;
}
