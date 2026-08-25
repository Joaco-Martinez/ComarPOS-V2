const config = require('./config');
const api = require('./api');
const { buildTicketHtml } = require('./ticketTemplate');
const { printHtml } = require('./printer');

// Loop principal: mismo patron que loop() en printbox/main.cpp (el ESP32),
// version JS -- mientras haya pairing guardado, hace long-poll a
// /printbox/devices/:id/poll (el propio poll() ya se queda esperando hasta
// ~8s del lado del backend, ver POLL_MAX_WAIT_MS en printbox.service.ts),
// imprime lo que llegue y vuelve a preguntar. Sin pairing, espera 3s entre
// chequeos en vez de golpear el backend en loop cerrado.
const HEARTBEAT_INTERVAL_MS = 60000;
const ERROR_BACKOFF_MS = 5000;
const UNPAIRED_CHECK_MS = 3000;

let running = false;
let stopped = false;
let statusListener = () => {};
let lastHeartbeat = 0;

function setStatusListener(fn) {
  statusListener = fn || (() => {});
}

async function processJob(cfg, job) {
  const { deviceId, token, apiUrl, printerName } = cfg;
  let payload;

  try {
    if (!api.verifyJobSignature(token, job)) {
      throw new Error('Firma inválida en el ticket recibido');
    }
    payload = JSON.parse(job.body);
  } catch (err) {
    await api.ackJob(apiUrl, deviceId, token, job.jobId, false, String(err.message || err)).catch(() => {});
    statusListener({ type: 'error', message: `Ticket inválido: ${err.message}` });
    return;
  }

  try {
    const html = await buildTicketHtml(payload);
    await printHtml(html, printerName);
    await api.ackJob(apiUrl, deviceId, token, job.jobId, true);
    statusListener({ type: 'printed', saleId: payload.saleId, at: Date.now() });
  } catch (err) {
    await api.ackJob(apiUrl, deviceId, token, job.jobId, false, String(err.message || err)).catch(() => {});
    statusListener({ type: 'error', message: `No se pudo imprimir: ${err.message}` });
  }
}

async function tick(cfg) {
  if (Date.now() - lastHeartbeat > HEARTBEAT_INTERVAL_MS) {
    lastHeartbeat = Date.now();
    api.heartbeat(cfg.apiUrl, cfg.deviceId, cfg.token).catch((err) => {
      statusListener({ type: 'error', message: `Heartbeat: ${err.message}` });
    });
  }

  const job = await api.poll(cfg.apiUrl, cfg.deviceId, cfg.token);
  if (job) await processJob(cfg, job);
}

async function start() {
  if (running) return;
  running = true;
  stopped = false;

  while (!stopped) {
    const cfg = config.getConfig();
    if (!cfg.deviceId || !cfg.token) {
      statusListener({ type: 'unpaired' });
      await new Promise((r) => setTimeout(r, UNPAIRED_CHECK_MS));
      continue;
    }

    try {
      await tick({
        apiUrl: cfg.apiUrl || config.DEFAULT_API_URL,
        deviceId: cfg.deviceId,
        token: cfg.token,
        printerName: cfg.printerName,
      });
      statusListener({ type: 'connected' });
    } catch (err) {
      statusListener({ type: 'error', message: err.message });
      await new Promise((r) => setTimeout(r, ERROR_BACKOFF_MS));
    }
  }

  running = false;
}

function stop() {
  stopped = true;
}

module.exports = { start, stop, setStatusListener };
