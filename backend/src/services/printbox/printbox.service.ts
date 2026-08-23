import { EventEmitter } from "events";
import prisma from "../../prisma";
import { AppError } from "../../utils/asyncHandler";
import { decryptPrintboxSecret } from "./printbox.crypto";
import { signRequest, verifyRequest } from "./printbox.hmac";

const PRINT_TICKET_SIGN_METHOD = "POST";
const PRINT_TICKET_SIGN_PATH = "/print/ticket";

// Cuanto se mantiene abierta cada request de /poll esperando un job antes de
// contestar "nada por ahora" -- el ESP32 vuelve a preguntar apenas termina
// (ver pollForPrintJob() en main.cpp), asi que esto es la cota superior de
// latencia entre "se publico un PrintJob" y "el ESP32 se entera", no un
// intervalo de espera entre intentos. Si el proxy/load balancer delante de
// este backend tiene su propio timeout de request, tiene que ser mayor a
// esto (Railway no impone uno bajo por defecto).
//
// Deliberadamente corto (8s, no 20-30s como suele usarse en long-poll): el
// ESP32 hace TODO esto en el loop() principal, de forma bloqueante (no hay
// un segundo hilo/task) -- mientras espera la respuesta de /poll no lee el
// boton de factory reset ni refresca el OLED. Un valor mas largo demora en
// la misma medida esas dos cosas. Ver POLL_RESPONSE_TIMEOUT_MS en main.cpp,
// que tiene que ser mayor a esto.
const POLL_MAX_WAIT_MS = 8000;

// Aviso en memoria de "a este device le llegó un job" para que
// pollForPrintJob() no tenga que re-consultar la DB cada 1s por las dudas
// mientras espera (eso significaba 1 query/seg SOSTENIDA por cada PrintBox
// conectado, todo el dia, aunque nunca llegue un ticket -- no escala). Con
// esto, mientras no hay nada para imprimir la unica actividad de DB es un
// SELECT al entrar a la funcion; después el poll se queda dormido esperando
// este evento (o el timeout) sin tocar la base para nada.
//
// Funciona porque este backend corre como un solo proceso Node (ver
// backend/CLAUDE.md: "single-process REST API") -- publishTicket() y
// pollForPrintJob() ejecutan en la misma memoria. Si en algún momento esto
// pasa a correr en más de una instancia/replica detrás de un load balancer,
// dejar de funcionar en silencio (un job creado en la instancia A nunca
// despertaria un poll dormido en la instancia B, que igual lo va a servir
// en su SIGUIENTE poll gracias al SELECT inicial -- se degrada a "hasta
// POLL_MAX_WAIT_MS de latencia", no se pierde el ticket, pero deja de ser
// "casi instantáneo"). Si eso pasa, la solucion real es Postgres
// LISTEN/NOTIFY o un pub/sub compartido (Redis), no volver al polling.
const jobEvents = new EventEmitter();
jobEvents.setMaxListeners(0); // un listener por device conectado, sin límite artificial

function jobQueuedEvent(deviceId: string) {
  return `job-queued:${deviceId}`;
}

/** Resuelve true si el evento se disparó antes del timeout, false si no. */
function waitForJobEvent(deviceId: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const eventName = jobQueuedEvent(deviceId);
    const timer = setTimeout(() => {
      jobEvents.off(eventName, onQueued);
      resolve(false);
    }, timeoutMs);
    function onQueued() {
      clearTimeout(timer);
      resolve(true);
    }
    jobEvents.once(eventName, onQueued);
  });
}

/** Busca el QUEUED mas viejo del device y lo marca PUBLISHED atomicamente. */
async function claimNextQueuedJob(deviceId: string) {
  const job = await prisma.printJob.findFirst({
    where: { deviceId, status: "QUEUED" },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return null;

  // updateMany + chequear count en vez de update() a secas: si por lo que
  // sea hay dos polls concurrentes del mismo device (no debería pasar, pero
  // es gratis cubrirlo), que solo uno se lleve el job.
  const claimed = await prisma.printJob.updateMany({
    where: { id: job.id, status: "QUEUED" },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  if (claimed.count === 0) return claimNextQueuedJob(deviceId); // otro poll se lo llevó justo antes

  return job;
}

async function getActiveDeviceWithToken(deviceId: string) {
  const device = await prisma.printboxDevice.findFirst({
    where: { id: deviceId, status: "ACTIVE" },
  });

  if (!device?.tokenEncrypted) {
    throw new AppError("INVALID_TOKEN", "Device no encontrado o sin token.", 401);
  }

  return { device, token: decryptPrintboxSecret(device.tokenEncrypted) };
}

export const printboxService = {
  /** Dispositivo a usar cuando no se especifica uno: el unico ACTIVE del tenant. */
  async resolveDefaultDevice(tenantId: string) {
    return prisma.printboxDevice.findFirst({
      where: { tenantId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
  },

  async listDevices(tenantId: string) {
    return prisma.printboxDevice.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
    });
  },

  /**
   * Encola un ticket para imprimir. NO le pega al ESP32 -- el ESP32 es
   * quien inicia la conexion (long-poll a GET /printbox/devices/:id/poll,
   * ver pollForPrintJob() en printbox.service.ts/main.cpp), asi que esto
   * solo crea el PrintJob en QUEUED y listo. Cambio a propósito respecto de
   * la version anterior (que le pegaba directo a deviceIp:80 por HTTP): un
   * backend en Railway no puede abrir una conexion entrante hacia un
   * dispositivo detras de NAT en la LAN de un cliente sin port-forwarding
   * (inviable para instalar en locales de terceros sin acceso al router) --
   * ver "Por que pull y no push" en printbox/README.md.
   *
   * Efecto secundario bueno de este cambio: como el job queda en la cola
   * hasta que el ESP32 pregunta, un PrintBox apagado en el momento de la
   * venta ya no pierde el ticket -- lo recibe apenas vuelve a conectarse
   * (antes esto estaba en "Que quedo pendiente" del README como no
   * resuelto).
   */
  async publishTicket(params: {
    tenantId: string;
    deviceId: string;
    saleId?: string;
    payload: unknown;
  }) {
    const { tenantId, deviceId, saleId, payload } = params;

    const device = await prisma.printboxDevice.findFirst({
      where: { id: deviceId, tenantId, status: "ACTIVE" },
    });

    if (!device?.tokenEncrypted) {
      throw new AppError(
        "DEVICE_NOT_PAIRED",
        "Este PrintBox todavía no está emparejado (o fue revocado).",
        409
      );
    }

    const job = await prisma.printJob.create({
      data: { tenantId, deviceId, saleId, payload: payload as any, status: "QUEUED" },
    });

    // Si hay un pollForPrintJob() de este device durmiendo ahora mismo
    // esperando el evento, esto lo despierta al toque (sin esto, igual lo
    // recibiría en su próximo poll, pero recién después de esperar el
    // timeout completo -- ver el comentario grande de jobEvents más arriba).
    jobEvents.emit(jobQueuedEvent(deviceId));

    return job;
  },

  /**
   * Long-poll del ESP32 preguntando "¿tenés algo para mí?". Autenticado con
   * la misma firma HMAC que el heartbeat (ver printbox.hmac.ts), sobre
   * method=GET y el path de este mismo endpoint, body vacío.
   *
   * Devuelve null si no hay nada tras esperar hasta POLL_MAX_WAIT_MS -- el
   * caller (controller) responde 204 en ese caso y el ESP32 vuelve a
   * preguntar en su próximo ciclo de loop().
   *
   * El payload del job se firma ACÁ, en el momento de entregarlo (no cuando
   * se creó el PrintJob) -- así el timestamp siempre está fresco aunque el
   * job haya esperado en la cola varios minutos a que el device se
   * reconecte (la ventana de tolerancia del lado del ESP32 es de 5 min, ver
   * MAX_CLOCK_SKEW_SEC). El ESP32 valida esta firma exactamente igual que
   * cuando el backend se la mandaba por push (mismo method/path
   * "POST /print/ticket" en el string canónico) -- el contrato de firma no
   * cambió, solo cambió el transporte que la entrega.
   */
  async pollForPrintJob(deviceId: string, timestamp: string, signature: string, path: string) {
    const { device, token } = await getActiveDeviceWithToken(deviceId);

    const error = verifyRequest(token, "GET", path, timestamp, "", signature);
    if (error) {
      throw new AppError("INVALID_SIGNATURE", `Firma inválida: ${error}`, 401);
    }

    await prisma.printboxDevice.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });

    // Primero un chequeo directo (cubre el caso de un job que ya estaba en
    // cola de una vuelta anterior, por ej. el device estuvo desconectado).
    // Si no hay nada, nos quedamos esperando el evento en vez de
    // re-consultar la DB a ciegas -- ver el comentario de jobEvents más
    // arriba sobre por qué.
    let job = await claimNextQueuedJob(deviceId);

    if (!job) {
      const remainingMs = POLL_MAX_WAIT_MS; // ya gastamos poco tiempo en los awaits de arriba, no vale la pena medirlo con precision
      const gotEvent = await waitForJobEvent(deviceId, remainingMs);
      if (gotEvent) job = await claimNextQueuedJob(deviceId);
    }

    if (!job) return null;

    const bodyStr = JSON.stringify(job.payload);
    const jobTimestamp = Math.floor(Date.now() / 1000).toString();
    const jobSignature = signRequest(token, PRINT_TICKET_SIGN_METHOD, PRINT_TICKET_SIGN_PATH, jobTimestamp, bodyStr);

    return { jobId: job.id, body: bodyStr, timestamp: jobTimestamp, signature: jobSignature };
  },

  /**
   * El ESP32 avisa el resultado de un job despues de intentar imprimirlo
   * (reemplaza al ACK sincronico que antes venia en la misma respuesta HTTP
   * del push). Firmado igual que el heartbeat (POST, path de este endpoint,
   * body vacío) -- el ok/error van sueltos en el JSON, sin firmar: total,
   * lo peor que un forgery de esto logra es marcar mal un PrintJob en la
   * auditoria interna, no fabricar ni alterar una impresion real (eso lo
   * sigue cubriendo la firma de pollForPrintJob).
   */
  async ackPrintJob(
    deviceId: string,
    jobId: string,
    timestamp: string,
    signature: string,
    path: string,
    ok: boolean,
    errorMessage?: string
  ) {
    const { device, token } = await getActiveDeviceWithToken(deviceId);

    const error = verifyRequest(token, "POST", path, timestamp, "", signature);
    if (error) {
      throw new AppError("INVALID_SIGNATURE", `Firma inválida: ${error}`, 401);
    }

    const job = await prisma.printJob.findFirst({ where: { id: jobId, deviceId } });
    if (!job) {
      throw new AppError("JOB_NOT_FOUND", "PrintJob no encontrado.", 404);
    }

    await prisma.$transaction([
      prisma.printJob.update({
        where: { id: jobId },
        data: {
          status: ok ? "ACKED" : "FAILED",
          ackedAt: ok ? new Date() : undefined,
          error: ok ? null : String(errorMessage ?? "print failed").slice(0, 500),
        },
      }),
      prisma.printboxDevice.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date() },
      }),
    ]);
  },
};
