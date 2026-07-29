/**
 * Monitoreo de errores con Sentry - opt-in. Sin SENTRY_DSN configurado, este
 * modulo no hace nada (Sentry.init nunca se llama, cero overhead, cero
 * llamadas de red). Para activarlo: crear una cuenta gratis en sentry.io,
 * un proyecto Node/Express, y poner el DSN en SENTRY_DSN.
 */
import * as Sentry from "@sentry/node";

export const sentryEnabled = Boolean(process.env.SENTRY_DSN);

export function initSentry() {
  if (!sentryEnabled) return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  });

  console.log("🛰️  Sentry inicializado");
}

export { Sentry };
