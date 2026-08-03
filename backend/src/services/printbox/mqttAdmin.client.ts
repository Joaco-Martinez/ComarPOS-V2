import mqtt, { MqttClient } from "mqtt";
import crypto from "crypto";

// Un unico cliente MQTT del lado del backend, usado tanto para publicar
// PrintJob (plano de datos) como para administrar usuarios/roles via el
// plugin dynamic-security de Mosquitto (plano de control). Es un cliente
// de confianza total: su rol en el broker tiene permiso sobre
// tenants/+/devices/+/jobs (todos los tenants), a diferencia de las
// credenciales por-tenant que solo ven tenants/{suPropioSlug}/devices/+/jobs.
let client: MqttClient | null = null;

function getClient(): MqttClient {
  if (client) return client;

  const url = process.env.MQTT_URL;
  const username = process.env.MQTT_ADMIN_USERNAME;
  const password = process.env.MQTT_ADMIN_PASSWORD;

  if (!url || !username || !password) {
    throw new Error(
      "MQTT_URL / MQTT_ADMIN_USERNAME / MQTT_ADMIN_PASSWORD no están configurados (ver printbox/README.md)."
    );
  }

  client = mqtt.connect(url, {
    username,
    password,
    clientId: `comarpos-backend-${crypto.randomBytes(4).toString("hex")}`,
    reconnectPeriod: 3000,
    connectTimeout: 10000,
  });

  client.on("error", (err) => {
    console.error("❌ MQTT backend client error:", err.message);
  });

  return client;
}

export function printboxMqttConfigured() {
  return Boolean(process.env.MQTT_URL && process.env.MQTT_ADMIN_USERNAME && process.env.MQTT_ADMIN_PASSWORD);
}

export function subscribeRaw(topicFilter: string, onMessage: (topic: string, payload: Buffer) => void) {
  const c = getClient();

  const attach = () => {
    c.subscribe(topicFilter, { qos: 1 });
    c.on("message", onMessage);
  };

  if (c.connected) attach();
  else c.once("connect", attach);
}

export function publishPrintboxMessage(topic: string, payload: unknown, qos: 0 | 1 | 2 = 1) {
  return new Promise<void>((resolve, reject) => {
    const c = getClient();

    const send = () => {
      c.publish(topic, JSON.stringify(payload), { qos, retain: false }, (err) => {
        if (err) return reject(err);
        resolve();
      });
    };

    if (c.connected) return send();
    c.once("connect", send);
    c.once("error", reject);
  });
}

const DYNSEC_COMMAND_TOPIC = "$CONTROL/dynamic-security/v1";
const DYNSEC_RESPONSE_TOPIC = "$CONTROL/dynamic-security/v1/response";
const DYNSEC_TIMEOUT_MS = 8000;

/**
 * Ejecuta comandos del plugin dynamic-security de Mosquitto (crear
 * usuarios/roles, asignar roles) publicando en el topic de control y
 * esperando la respuesta correlacionada. Requiere que el cliente admin
 * tenga el rol dynsec por defecto (el primero que corre
 * `mosquitto_ctrl dynsec init`, ver printbox/broker/README.md).
 */
export function dynsecCommand(commands: Array<Record<string, unknown>>): Promise<any> {
  return new Promise((resolve, reject) => {
    const c = getClient();
    const correlationData = crypto.randomBytes(8).toString("hex");
    const commandsWithCorrelation = commands.map((cmd) => ({ ...cmd, correlationData }));

    const timeout = setTimeout(() => {
      c.removeListener("message", onMessage);
      reject(new Error("Timeout esperando respuesta del broker (dynamic-security)."));
    }, DYNSEC_TIMEOUT_MS);

    function onMessage(topic: string, message: Buffer) {
      if (topic !== DYNSEC_RESPONSE_TOPIC) return;

      let body: any;
      try {
        body = JSON.parse(message.toString());
      } catch {
        return;
      }

      const matches = body?.responses?.some((r: any) => r.correlationData === correlationData);
      if (!matches) return;

      clearTimeout(timeout);
      c.removeListener("message", onMessage);

      const failed = body.responses.find((r: any) => r.error);
      if (failed) {
        return reject(new Error(`dynamic-security: ${failed.error}`));
      }

      resolve(body);
    }

    const send = () => {
      c.subscribe(DYNSEC_RESPONSE_TOPIC, { qos: 1 }, (subErr) => {
        if (subErr) {
          clearTimeout(timeout);
          return reject(subErr);
        }

        c.on("message", onMessage);
        c.publish(DYNSEC_COMMAND_TOPIC, JSON.stringify({ commands: commandsWithCorrelation }), { qos: 1 });
      });
    };

    if (c.connected) return send();
    c.once("connect", send);
    c.once("error", reject);
  });
}
