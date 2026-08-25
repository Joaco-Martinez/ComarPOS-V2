const crypto = require('crypto');

// Espejo exacto de backend/src/services/printbox/printbox.hmac.ts -- mismo
// canonical string y mismo algoritmo, para que las firmas calcen. Si uno de
// los dos cambia de formato sin el otro, todas las firmas empiezan a dar
// invalidas (ver el comentario grande en ese archivo).
function buildCanonicalString(method, path, timestamp, body) {
  return `${method}\n${path}\n${timestamp}\n${body}`;
}

function signRequest(secret, method, path, timestamp, body) {
  const canonical = buildCanonicalString(method, path, timestamp, body);
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

// Timestamp en SEGUNDOS -- igual que el ESP32 (ver hmac.ts del backend).
function nowTimestamp() {
  return Math.floor(Date.now() / 1000).toString();
}

module.exports = { signRequest, nowTimestamp };
