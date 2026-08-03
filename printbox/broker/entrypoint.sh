#!/bin/sh
# Bootstrap idempotente del broker:
#   1. Si no existe el datastore de dynamic-security, lo crea con el admin
#      (MQTT_ADMIN_USERNAME/PASSWORD) — offline, no necesita el broker corriendo.
#   2. Levanta mosquitto en segundo plano.
#   3. Si el rol compartido "printbox-tenant-device" no existe todavía, lo
#      crea con su ACL (aislamiento por tenant vía %u, ver README.md).
#   4. Pasa a primer plano el proceso de mosquitto (PID 1 real del container).
set -e

DATA_DIR=/mosquitto/data
DYNSEC_FILE="$DATA_DIR/dynamic-security.json"
ROLE_NAME=printbox-tenant-device

: "${MQTT_ADMIN_USERNAME:?Falta la env var MQTT_ADMIN_USERNAME}"
: "${MQTT_ADMIN_PASSWORD:?Falta la env var MQTT_ADMIN_PASSWORD}"

mkdir -p "$DATA_DIR"

if [ ! -f "$DYNSEC_FILE" ]; then
  echo "[bootstrap] Primer arranque: creando datastore dynamic-security..."
  mosquitto_ctrl dynsec init "$DYNSEC_FILE" "$MQTT_ADMIN_USERNAME" "$MQTT_ADMIN_PASSWORD"
fi

mosquitto -c /mosquitto/config/mosquitto.conf &
MOSQ_PID=$!

echo "[bootstrap] Esperando a que el broker acepte conexiones..."
i=0
until mosquitto_pub -h localhost -p 1883 -u "$MQTT_ADMIN_USERNAME" -P "$MQTT_ADMIN_PASSWORD" -t '$bootstrap/ping' -m ok >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "[bootstrap] El broker no levantó a tiempo, aborto el setup del rol (mosquitto sigue corriendo)."
    wait "$MOSQ_PID"
    exit 1
  fi
  sleep 1
done

CTRL="mosquitto_ctrl -h localhost -p 1883 -u $MQTT_ADMIN_USERNAME -P $MQTT_ADMIN_PASSWORD dynsec"

if ! $CTRL listRoles 2>/dev/null | grep -q "$ROLE_NAME"; then
  echo "[bootstrap] Creando rol $ROLE_NAME y su ACL..."
  $CTRL createRole "$ROLE_NAME"
  # %u = username MQTT del cliente conectado (= tenant-{slug}, ver
  # printbox.provisioning.ts). Un tenant solo puede tocar SU propio topic,
  # nunca el de otro, aunque el codigo del backend tenga un bug.
  $CTRL addRoleACL "$ROLE_NAME" subscribePattern "tenants/%u/devices/+/jobs" allow
  $CTRL addRoleACL "$ROLE_NAME" publishClientReceive "tenants/%u/devices/+/jobs" allow
  $CTRL addRoleACL "$ROLE_NAME" publishClientSend "tenants/%u/devices/+/jobs/ack" allow
else
  echo "[bootstrap] Rol $ROLE_NAME ya existe, no toco nada."
fi

echo "[bootstrap] Listo. Broker corriendo."
wait "$MOSQ_PID"
