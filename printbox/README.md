# PrintBox

ESP32-S3 + W5500 (ethernet) + impresora térmica ESC/POS + OLED de estado.
Recibe tickets por MQTT y los imprime, sin exponer nada a internet (todo
sale desde el dispositivo, nunca entra). Ver la nota de arquitectura para
el porqué de MQTT sobre long-polling/URL-por-negocio.

## Flujo end-to-end

1. **Alta en el panel** (ADMIN, tenant): `POST /printbox/devices { name }`
   crea un `PrintboxDevice` en estado `PENDING_PAIRING` y devuelve un
   `pairingCode` de 6 dígitos, válido 15 minutos.
2. **Pairing físico**: el ESP32, sin config guardada, levanta un servidor
   HTTP en su IP de DHCP. Alguien en el local entra a esa IP desde el
   celu/PC, escribe el `pairingCode` + la IP de la impresora en la misma
   red.
3. El ESP32 llama `POST /printbox/pair { pairingCode, hardwareId }` al
   backend central (mismo host para todos los tenants, ver
   `API_HOST` en `src/main.cpp`). El backend resuelve a qué tenant
   pertenece por el código, genera (o reusa) las credenciales MQTT del
   tenant, y se las devuelve junto con el topic.
4. El ESP32 guarda todo en NVS (`Preferences`) y reinicia. De ahí en
   adelante: conecta por ethernet, se suscribe a
   `tenants/{tenantId}/devices/{deviceId}/jobs` por MQTT y queda
   esperando — sin volver a necesitar el servidor de pairing.
5. Venta cobrada → backend publica el `PrintJob` en ese topic → el ESP32
   lo recibe casi instantáneo → imprime → publica un ack.

## Estructura

- `src/main.cpp` — todo el firmware (pairing local, NVS, MQTT, impresión,
  OLED, cache del logo del tenant).
- `include/trust_anchors.h` — **placeholder sin completar**, ver el
  comentario adentro. Sin esto el firmware no puede hablar TLS de verdad.
- `broker/` — Mosquitto self-hosteado (docker), con el modelo de
  aislamiento por tenant. Ver `broker/README.md`.

## ⚠️ Estado real: escrito, no probado contra hardware

Todo este firmware se escribió sin acceso a un ESP32-S3 + W5500 + OLED +
impresora física, ni a PlatformIO instalado en este entorno — no compiló
ni se flasheó todavía. Antes de confiar en esto:

1. **Compilar**: `pio run` (o VS Code + extensión PlatformIO) adentro de
   `printbox/`. Lo más probable que rompa primero: nombres exactos de la
   librería SSLClient en el registro (`platformio.ini` ya deja una nota),
   y los pines del OLED (`OLED_SDA`/`OLED_SCL` en `main.cpp` son un
   default típico de ESP32-S3, no confirmados contra esta placa puntual).
2. **Certificados TLS**: completar `include/trust_anchors.h` de verdad
   (instrucciones adentro) — sin esto ni el pairing ni MQTT van a conectar.
3. **Probar el broker** primero (`broker/README.md` tiene los pasos) antes
   de emparejar un device real.
4. **Flashear y emparejar un solo dispositivo** de prueba antes de pensar
   en fabricar/desplegar varios.

## Qué quedó pendiente (a propósito, para no inflar esto más)

- El logo de ComarPOS es **texto** ESC/POS (doble tamaño, bold), no un
  bitmap real — no había un archivo de logo para convertir. El mecanismo
  para reemplazarlo por un bitmap de verdad ya existe (mismo camino que el
  logo del tenant, `logoRaster.service.ts` en el backend) — falta nada más
  que el asset y apuntar `comarposFooterEscPos()` a esos bytes en vez de
  al texto.
- No hay pantalla de "error persistente / reintentar pairing" en el OLED
  más allá de un mensaje de una línea — suficiente para debug, no para un
  operador no técnico todavía.
