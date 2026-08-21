import crypto from "crypto";

// Firma HMAC-SHA256 para las requests entre el backend y el PrintBox, en
// las dos direcciones (backend -> ESP32 para /print/ticket, ESP32 ->
// backend para /heartbeat). El secreto es el token que ya se genera en el
// pairing (PrintboxDevice.tokenEncrypted) -- no hace falta uno nuevo.
//
// Esto NO es TLS: el contenido de la request sigue viajando sin cifrar.
// Lo que sí garantiza:
//   - Nadie sin el token puede fabricar una request válida (forgery).
//   - Nadie puede modificar el body en tránsito sin invalidar la firma
//     (tampering).
// Lo que NO cubre:
//   - Confidencialidad (alguien mirando el tráfico ve el contenido igual).
//   - Replay perfecto: una request capturada entera es válida hasta que
//     vence la ventana de tiempo (ver MAX_CLOCK_SKEW_MS). Para
//     /print/ticket un replay reimprime el mismo ticket -- molesto, no
//     grave. Para /heartbeat, como es idempotente, tampoco es grave.
// Documentado así en printbox/README.md -- si en algún momento hace falta
// más que esto, la respuesta real es TLS de punta a punta, no más capas
// arriba de HMAC.
//
// El timestamp va en SEGUNDOS (no ms) a propósito: el ESP32 arma el suyo
// con `time(nullptr)` (segundos, cabe en un unsigned long de 32 bits) --
// en ms se necesitaría un entero de 64 bits, que Arduino String no sabe
// formatear directo. Precision de segundos sobra dada la ventana de 5min.
const MAX_CLOCK_SKEW_SEC = 5 * 60; // 5 min, deja margen para el NTP del ESP32

function buildCanonicalString(method: string, path: string, timestamp: string, body: string) {
  return `${method}\n${path}\n${timestamp}\n${body}`;
}

export function signRequest(secret: string, method: string, path: string, timestamp: string, body: string) {
  const canonical = buildCanonicalString(method, path, timestamp, body);
  return crypto.createHmac("sha256", secret).update(canonical).digest("hex");
}

/**
 * Verifica firma + frescura del timestamp. Devuelve un mensaje de error
 * (string) si algo no valida, o null si todo OK -- así el caller no
 * necesita otro tipo de resultado solo para loguear por qué falló.
 */
export function verifyRequest(
  secret: string,
  method: string,
  path: string,
  timestamp: string,
  body: string,
  signature: string
): string | null {
  if (!timestamp || !signature) return "falta timestamp o firma";

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return "timestamp inválido";
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > MAX_CLOCK_SKEW_SEC) return "timestamp fuera de rango (reloj desincronizado o request vieja)";

  const expected = signRequest(secret, method, path, timestamp, body);
  const expectedBuf = Buffer.from(expected, "hex");
  const gotBuf = Buffer.from(signature, "hex");

  // timingSafeEqual tira si los buffers no tienen el mismo largo -- una
  // firma con largo distinto ya es invalida, no hace falta compararla.
  if (expectedBuf.length !== gotBuf.length || !crypto.timingSafeEqual(expectedBuf, gotBuf)) {
    return "firma inválida";
  }

  return null;
}
