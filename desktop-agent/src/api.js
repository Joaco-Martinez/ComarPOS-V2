const { signRequest, nowTimestamp } = require('./hmac');

// Mismo contrato que backend/src/controllers/printbox.controller.ts /
// backend/src/routes/printbox.routes.ts -- este agente es, a ojos del
// backend, un PrintboxDevice mas (kind DESKTOP_AGENT), asi que reusa
// exactamente los mismos 4 endpoints publicos que ya usa el firmware del
// ESP32 (pair/heartbeat/poll/ack). Ver printbox/README.md para el detalle
// del protocolo -- esto es la version en JS del mismo cliente.

function trimSlash(url) {
  return url.replace(/\/$/, '');
}

async function pair(apiUrl, pairingCode, hardwareId) {
  const res = await fetch(`${trimSlash(apiUrl)}/printbox/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairingCode, hardwareId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data?.message || `No se pudo emparejar (HTTP ${res.status})`);
  }
  return data; // { deviceId, deviceName, tenantId, token }
}

function signedHeaders(token, method, path, body) {
  const timestamp = nowTimestamp();
  const signature = signRequest(token, method, path, timestamp, body);
  return { 'X-Pos-Timestamp': timestamp, 'X-Pos-Signature': signature };
}

async function heartbeat(apiUrl, deviceId, token) {
  const path = `/printbox/devices/${deviceId}/heartbeat`;
  const res = await fetch(`${trimSlash(apiUrl)}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...signedHeaders(token, 'POST', path, '') },
    body: '{}',
  });
  if (!res.ok) throw new Error(`Heartbeat rechazado (HTTP ${res.status})`);
}

// Long-poll: el backend mantiene la conexion abierta hasta ~8s esperando un
// PrintJob (ver POLL_MAX_WAIT_MS en printbox.service.ts) antes de contestar
// 204. timeoutMs acá es mayor a eso a proposito, para no cortar la request
// nosotros mismos antes de que el backend conteste.
async function poll(apiUrl, deviceId, token, { timeoutMs = 15000 } = {}) {
  const path = `/printbox/devices/${deviceId}/poll`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${trimSlash(apiUrl)}${path}`, {
      method: 'GET',
      headers: signedHeaders(token, 'GET', path, ''),
      signal: controller.signal,
    });
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`Poll fallo (HTTP ${res.status})`);
    const data = await res.json();
    return data; // { jobId, body, timestamp, signature }
  } finally {
    clearTimeout(timer);
  }
}

// Verifica la firma que el backend puso sobre el payload del ticket (mismo
// canonical string que /print/ticket, ver printbox.service.ts#pollForPrintJob)
// antes de imprimir nada -- defensa en profundidad: aunque ya viaja por
// HTTPS, esto asegura que el contenido no fue alterado en el camino y que
// realmente vino de nuestro backend (con el token de este device).
function verifyJobSignature(token, job) {
  const expected = signRequest(token, 'POST', '/print/ticket', job.timestamp, job.body);
  return expected === job.signature;
}

async function ackJob(apiUrl, deviceId, token, jobId, ok, errorMessage) {
  const path = `/printbox/devices/${deviceId}/jobs/${jobId}/ack`;
  const res = await fetch(`${trimSlash(apiUrl)}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...signedHeaders(token, 'POST', path, '') },
    body: JSON.stringify({ ok, error: errorMessage }),
  });
  if (!res.ok) throw new Error(`Ack rechazado (HTTP ${res.status})`);
}

module.exports = { pair, heartbeat, poll, verifyJobSignature, ackJob };
