# PrintBox — broker MQTT

Broker Mosquitto self-hosteado, con aislamiento entre tenants garantizado
por el broker (no por código de aplicación). Ver la nota de arquitectura
completa para el porqué: comparación long-poll vs MQTT y el esquema de
topics.

## Cómo funciona el aislamiento

- Cada tenant tiene **un solo** usuario/password MQTT (`tenant-{slug}`),
  generado automáticamente por el backend la primera vez que se pairea un
  PrintBox de ese tenant (`backend/src/services/printbox/printbox.provisioning.ts`).
- Todos los PrintBox de un mismo tenant comparten esas credenciales.
- El rol `printbox-tenant-device` (creado una sola vez por `entrypoint.sh`)
  tiene una ACL con el patrón `tenants/%u/devices/+/jobs` — `%u` lo sustituye
  Mosquitto por el username con el que se conectó el cliente. Un tenant
  **no puede suscribirse** al topic de otro tenant aunque quisiera: el
  broker rechaza la suscripción a nivel de protocolo.
- El backend se conecta con un usuario admin (`MQTT_ADMIN_USERNAME`) que sí
  tiene acceso a `tenants/+/devices/+/jobs` (todos los tenants), porque es
  el único que necesita publicar en cualquiera.

## Deploy

1. **Certificados TLS** (el listener 8883 los requiere — sin esto ningún
   PrintBox real, fuera de tu red local, debería conectarse en texto plano
   mandando credenciales). Poné en `./certs/`:
   - `ca.pem`, `server.pem`, `server.key`
   - Para producción: un cert real (Let's Encrypt/certbot, o reusar el que
     ya tengan para `*.comarpos.com.ar` si el broker cuelga de un
     subdominio propio, ej. `mqtt.comarpos.com.ar`).
   - Para probar local: generar uno self-signed con `mkcert` o `openssl req -x509 -newkey rsa:2048 -nodes -keyout server.key -out server.pem -days 365`.

2. **Variables de entorno**: `MQTT_ADMIN_USERNAME` / `MQTT_ADMIN_PASSWORD`
   (elegí un password largo — es la identidad que el backend usa para
   administrar el broker entero). Van tanto acá como en `backend/.env`
   (`MQTT_ADMIN_USERNAME`, `MQTT_ADMIN_PASSWORD`, `MQTT_URL`, `MQTT_PUBLIC_URL`).

3. **Correr**: `docker compose up -d --build` (local) o desplegar el
   `Dockerfile` como un servicio Docker en Railway, con:
   - Puerto 8883 expuesto (TCP proxy, no HTTP).
   - Un volumen persistente montado en `/mosquitto/data` — **si se pierde
     ese volumen se pierden todas las credenciales MQTT de todos los
     tenants** y hay que re-pairear todos los PrintBox. Confirmá que el
     backup de Railway (o el que sea) cubre este volumen, igual que ya
     cubre la base de datos.
   - Certs montados en `/mosquitto/certs` (volumen o secret files, según
     lo que soporte la plataforma).

## ⚠️ Sin probar contra un broker real todavía

Este setup (`entrypoint.sh`, comandos `mosquitto_ctrl dynsec ...`) está
escrito contra la sintaxis documentada de Mosquitto 2.x, pero **nadie lo
corrió todavía contra un broker vivo** — no había Docker disponible en el
entorno donde se armó. Antes de depender de esto en producción:

```bash
cd printbox/broker
MQTT_ADMIN_USERNAME=admin MQTT_ADMIN_PASSWORD=$(openssl rand -hex 16) docker compose up --build
# en otra terminal, confirmar que el rol se creó:
docker compose exec mosquitto mosquitto_ctrl -u admin -P <password> dynsec listRoles
```

Si `mosquitto_ctrl dynsec` tira error de sintaxis, es casi seguro un
nombre de subcomando/ACL-type que cambió de versión — correr
`mosquitto_ctrl dynsec help` dentro del container para ver la sintaxis
exacta de esa imagen y ajustar `entrypoint.sh`.
