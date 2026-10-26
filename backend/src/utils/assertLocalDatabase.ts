/**
 * Freno para scripts destructivos o de datos de prueba (reset.ts,
 * seed-full.ts): se niegan a correr contra una base que no sea local. El
 * .env de desarrollo puede apuntar a la base de Railway, y un `npm run reset`
 * por error borraria produccion entera.
 *
 * Para correrlo igual contra una base remota (a proposito) hay que pasar
 * ALLOW_REMOTE_DB_DESTRUCTIVE=true en el entorno de esa ejecucion.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal", "postgres", "db"]);

export function assertLocalDatabase(scriptName: string) {
  const dbUrl = process.env.DATABASE_URL || "";
  if (!dbUrl) throw new Error("Falta DATABASE_URL");

  if (process.env.ALLOW_REMOTE_DB_DESTRUCTIVE === "true") {
    console.warn(`⚠️ ${scriptName}: ALLOW_REMOTE_DB_DESTRUCTIVE=true, se saltea el chequeo de base local.`);
    return;
  }

  let host = "";
  try {
    host = new URL(dbUrl).hostname.replace(/^\[|\]$/g, "");
  } catch {
    throw new Error(`${scriptName}: DATABASE_URL invalida`);
  }

  if (process.env.NODE_ENV === "production" || !LOCAL_HOSTS.has(host)) {
    throw new Error(
      `${scriptName}: bloqueado, DATABASE_URL apunta a "${host}" (no es una base local). ` +
        "Si de verdad queres correrlo ahi, usa ALLOW_REMOTE_DB_DESTRUCTIVE=true."
    );
  }
}
