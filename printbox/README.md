# PrintBox

ESP32-S3 + W5500 (ethernet) + impresora térmica ESC/POS + OLED de estado.
Cuando hay que imprimir un ticket, el backend lo deja encolado
(`PrintJob`, estado `QUEUED`) y es **el ESP32 quien pregunta** por HTTP si
hay algo para él (`GET /printbox/devices/:id/poll`, long-poll) — el
PrintBox nunca acepta conexiones entrantes una vez emparejado, solo las
inicia. Mismo contrato de contenido de ticket que el viejo agente local de
Windows (`comarpos-local-agent`) que este dispositivo reemplaza, la
diferencia es quién llama a quién.

## Flujo end-to-end

1. **Alta en el panel** (ADMIN, tenant): `POST /printbox/devices { name }`
   crea un `PrintboxDevice` en estado `PENDING_PAIRING` y devuelve un
   `pairingCode` de 6 dígitos, válido 15 minutos.
2. **Pairing físico**: el ESP32, sin config guardada, levanta su propio
   punto de acceso WiFi (`PrintBox-Setup`, ver `WIFI_AP_SSID`/`WIFI_AP_PASSWORD`
   en `src/main.cpp`). Alguien en el local conecta el celu directo a esa
   red WiFi y entra a `http://192.168.4.1/` (IP fija del AP, no depende de
   ningún DHCP) para cargar tres cosas: el `pairingCode`, el SSID/password
   de la WiFi real del local (la que tiene salida a internet), y la IP de
   la impresora (conectada al PrintBox por el cable Ethernet/W5500 — ver
   el punto 5).
3. Con esos datos, el ESP32 se conecta a esa WiFi real (queda en modo
   AP+STA mientras dura el pairing) y, ya con internet, llama
   `POST /printbox/pair { pairingCode, hardwareId }` al backend central
   (mismo host para todos los tenants, ver `API_HOST` en `src/main.cpp`).
   El backend resuelve a qué tenant pertenece por el código, genera un
   token propio para ese device, guarda la IP con la que le llegó la
   request (`req.ip`, solo a fines de diagnóstico — ya no se usa para
   direccionar nada) y le devuelve el token.
4. El ESP32 guarda todo en NVS (`Preferences`, incluido el SSID/password
   de la WiFi) y reinicia. De ahí en adelante arranca directo en modo
   WiFi-estación (sin AP) y **no vuelve a levantar ningún servidor** — pasa
   a hacer polling saliente (ver punto 6).
5. **La impresora se conecta al PrintBox por cable** (W5500), en un link
   punto a punto — no hace falta que la impresora ni el ESP32 estén en la
   misma red WiFi/router del local. El PrintBox se pone a sí mismo una IP
   en la misma /24 que la de la impresora (ver `deriveLocalIpForPrinter`
   en `main.cpp`) y le manda el ticket por ESC/POS crudo (puerto 9100).
6. Venta cobrada → el backend crea un `PrintJob` en `QUEUED` y **no le
   pega a nadie** (`printboxService.publishTicket`). El ESP32, en su
   `loop()` principal, tiene una conexión de long-poll abierta a
   `GET /printbox/devices/:id/poll` (firmada con HMAC-SHA256, mismo
   esquema que el resto — ver "Seguridad: firma HMAC" más abajo); el
   backend mantiene esa request abierta hasta `POLL_MAX_WAIT_MS` (8s,
   `printbox.service.ts`) esperando, **sin re-consultar la DB a
   intervalos** — usa un `EventEmitter` en memoria que `publishTicket`
   dispara apenas crea el job, así que la única carga real en Postgres es
   un `SELECT` al entrar al poll y, si hace falta esperar, otro cuando el
   evento despierta la espera (0 queries mientras no hay nada para
   imprimir, sea cual sea cuántos PrintBox estén conectados). En cuanto
   aparece un `PrintJob` se lo devuelve en la respuesta (firmado igual que
   antes, cuando se mandaba por push). El ESP32 imprime y confirma el
   resultado con `POST /printbox/devices/:id/jobs/:jobId/ack` — ya no hay
   un ACK sincrónico en la misma conexión, es una request aparte.
7. Cada 60s el ESP32 manda además un heartbeat
   (`POST /printbox/devices/:id/heartbeat`, también firmado) puramente
   informativo — actualiza `lastSeenAt`/`deviceIp` para el panel, no
   condiciona el poll de impresión.

## Por qué pull y no push

La versión anterior de esto (todavía visible en el historial de git) hacía
lo inverso: el backend le pegaba directo por HTTP a `deviceIp:80` (o a un
`remoteHost` cargado a mano). Andaba perfecto para probar en la LAN de un
cliente, pero no escala a producción real: **el backend corre en Railway**
(un datacenter en la nube) y el PrintBox vive en la LAN de un local,
típicamente detrás de NAT — sin acceso al router de cada cliente para
configurar port-forwarding (y muchos ISP residenciales/de PyME en
Argentina hacen CGNAT, donde ni siquiera es posible abrir un puerto por
más que el cliente lo autorice), el backend simplemente no tiene forma de
abrir una conexión entrante hacia el device.

El pull (el ESP32 pregunta hacia afuera, nunca acepta conexiones) da vuelta
el problema: una conexión saliente desde la LAN del cliente hacia
`api.comarpos.com` funciona en cualquier red hogareña/comercial sin tocar
un solo router, exactamente igual que cualquier navegador o app de
celular. Es el patrón estándar para IoT detrás de NAT arbitrario (llamado
"pull" o "long-poll"; MQTT es la variante más conocida de la misma idea —
ver más abajo por qué no se usó eso puntualmente).

**Bonus no buscado**: como el ticket ahora vive en una cola (`PrintJob`)
hasta que el ESP32 lo pide, un PrintBox apagado en el momento de la venta
ya no pierde el ticket — lo recibe apenas se reconecta. Esto estaba
anotado como pendiente/no resuelto en una versión anterior de este README
("sin cola/reintento si el PrintBox está apagado") y ahora sale gratis del
cambio de arquitectura.

**Por qué long-poll y no MQTT**: ya se probó MQTT acá (primero Mosquitto
en Docker, después un broker embebido en el propio backend) y se
descartó porque sumaba una pieza de infraestructura aparte para
mantener/pagar/monitorear. Long-poll sobre el mismo HTTPS+HMAC que ya
existía para pairing/heartbeat no necesita nada nuevo del lado de
infraestructura — el costo real es una conexión HTTP "colgada" por device
conectado (barato para Node: es un socket + una promise esperando, no un
hilo), y **no** una consulta a la base de datos por segundo por device:
`pollForPrintJob` usa un `EventEmitter` en memoria (`jobEvents` en
`printbox.service.ts`) para despertar el poll exactamente cuando
`publishTicket` crea un job, en vez de re-consultar Postgres a ciegas
mientras espera. Esto asume un solo proceso Node (ver comentario en el
código) — si el backend pasara a correr en varias réplicas detrás de un
load balancer, un job creado en la réplica A no despertaría un poll
dormido en la réplica B (igual llegaría, pero recién en el siguiente ciclo
de poll de ese device, no al instante); ahí la solución real sería
Postgres LISTEN/NOTIFY o Redis pub/sub, no volver a re-consultar por
intervalo. A la escala de unos pocos locales ninguna de las dos cosas
(conexiones colgadas, réplicas) es un problema real; con miles de PrintBox
activos sí conviene revisar esto de nuevo.

**Trade-off aceptado**: todo esto corre en el `loop()` principal del
ESP32, sin un task/hilo aparte — mientras `pollForPrintJob()` espera la
respuesta del backend (hasta `POLL_RESPONSE_TIMEOUT_MS`, 12s), el resto
del dispositivo (botón de factory reset, refresco del OLED) queda
congelado hasta por ese tiempo. El reset en sí sigue funcionando bien
(mide con `millis()` real, no por vueltas de loop), pero el feedback
visual puede tardar unos segundos de más en reaccionar. Ver los
comentarios en `POLL_MAX_WAIT_MS`/`POLL_RESPONSE_TIMEOUT_MS` si hace falta
ajustar ese balance.

## Seguridad: firma HMAC (no TLS)

El ESP32 no puede hacer de servidor TLS de forma robusta (certificados,
renovación, el costo de CPU/memoria que eso implica en un
microcontrolador). En vez de eso, **todas las requests entre el backend y
el PrintBox van firmadas con HMAC-SHA256**, usando el token del pairing
como secreto compartido (nunca viaja en texto plano en ningún header —
antes sí, se cambió a propósito). Mismo esquema en varias direcciones: el
ESP32 firma su heartbeat, su `/poll` y su `/ack`; el backend firma el
ticket que va adentro de la respuesta de `/poll` (canónicamente sigue
siendo un `POST /print/ticket`, aunque ya no viaje como un POST real —
ver "Por qué pull y no push"). La lógica vive espejada en
`backend/src/services/printbox/printbox.hmac.ts` (backend) y la sección
"SEGURIDAD" de `main.cpp` (firmware) — si una de las dos cambia de formato
sin la otra, todas las firmas empiezan a dar inválidas.

**Qué cubre**: nadie sin el token puede fabricar una request válida
(forgery) ni modificar una en tránsito sin invalidar la firma
(tampering). El timestamp firmado (con una ventana de 5 minutos, ver
`MAX_CLOCK_SKEW_SEC`/`diffSec` en cada lado) además evita que una request
capturada quede reutilizable indefinidamente.

**Qué NO cubre — y es importante tenerlo claro**: esto no es cifrado. El
contenido de cada ticket (montos, nombre del cliente, etc.) viaja **sin
cifrar** por la red — cualquiera mirando el tráfico lo puede leer, aunque
no pueda fabricar ni modificar requests. Para confidencialidad real hace
falta TLS de punta a punta, que quedó descartado a propósito por el costo
en el ESP32 (ver "Por qué HTTP directo y no MQTT" — mismo tipo de
trade-off). Aceptable para una LAN de confianza o una red punto a punto
con el cliente; para un dato genuinamente sensible via internet abierto,
esto no alcanza.

El timestamp que firma el ESP32 (en el heartbeat) necesita que el reloj
esté sincronizado por NTP (`ensureNtpSynced()` en `main.cpp`) — si el NTP
todavía no sincronizó cuando toca mandar un heartbeat, el backend lo va a
rechazar por "timestamp fuera de rango", pero se autocorrige solo en el
próximo intento (60s después). La verificación del lado del ESP32 (para
`/print/ticket`, que firma el *backend*) no depende de tener NTP —
reusa el timestamp que vino en el header para recalcular la firma — pero
si ya sincronizó, aprovecha para rechazar requests viejas también de ese lado.

## Estructura

- `src/main.cpp` — todo el firmware (pairing local, WiFi, NVS, poll de
  impresión saliente, heartbeat, firma HMAC, impresión ESC/POS, OLED,
  cache del logo del tenant).
- `backend/src/services/printbox/printbox.service.ts` — cola de
  `PrintJob` + el long-poll (`pollForPrintJob`) + el ack (`ackPrintJob`).
- `backend/src/services/printbox/printbox.hmac.ts` — la mitad del esquema
  de firma que vive del lado del backend.
- No hay broker/servicio aparte que deployar — todo el "transporte" es
  HTTP(S) directo entre el ESP32 y este mismo backend.

## ⚠️ Estado real: escrito, no probado contra hardware real de punta a punta

Este firmware se probó parcialmente contra un ESP32-S3 + W5500 + impresora
física real (ver más abajo el bug de ESP32+W5500 que se encontró y
parcheó), pero el flujo de impresión en sí — primero el push por HTTP
directo (reemplazo del MQTT), después el pull/long-poll actual (ver "Por
qué pull y no push") — todavía no se probó en hardware, se escribió
después de esas pruebas. El cambio de push a pull en particular es
reciente y grande (toca firmware y backend), así que antes de confiar en
esto conviene remarcar que necesita una pasada de pruebas end-to-end
propia, no asumir que "ya andaba antes":

1. **Compilar**: `pio run` (o VS Code + extensión PlatformIO) adentro de
   `printbox/`. Lo que puede romper: los pines del OLED
   (`OLED_SDA`/`OLED_SCL` en `main.cpp` son un default típico de
   ESP32-S3, no confirmados contra esta placa puntual). **La primera vez**
   que se instalan las libs, `patch_ethernet_esp32_fixes.py` (ver más abajo)
   puede no encontrar todavía los archivos a parchear — si ves ese aviso en
   el log de build, corré `pio run` una segunda vez.
2. **Bug conocido ESP32+W5500: bytes corruptos en la transmisión.**
   Causa raíz confirmada (no fue timing, ni la velocidad de SPI): la
   función `SPI.transfer(buf, len)` en su variante "de bloque" (todo el
   buffer de una) está rota en el driver SPI del núcleo de ESP32 — corrompe
   bytes sueltos en medio de transferencias grandes. Es un bug conocido,
   reportado muchas veces contra `arduino-libraries/Ethernet` en esta
   combinación puntual de hardware, con la causa raíz y el fix confirmados
   por la comunidad
   ([hilo con el diagnóstico y el patch que funcionó](https://github.com/PaulStoffregen/Ethernet/issues/39#issuecomment-711109000),
   también reportado en
   [#120](https://github.com/arduino-libraries/Ethernet/issues/120) y
   [#124](https://github.com/arduino-libraries/Ethernet/issues/124)).
   La librería `Ethernet2` (más vieja) no tiene este bug porque nunca usó
   la variante de bloque, siempre mandó/leyó byte por byte.
   `extra_scripts = pre:patch_ethernet_esp32_fixes.py` (en `platformio.ini`)
   parchea `w5100.cpp` para forzar byte-a-byte en el chip W5500 (en vez de
   la variante de bloque) automáticamente en cada build — no hay forma de
   hacerlo con un `build_flags -D` nomás, ver el comentario adentro de ese
   script.
3. **TLS en modo producción**: `wifiClientSecure.setInsecure()` (en
   `main.cpp`) hace que el pairing/heartbeat/logo por HTTPS no validen el
   certificado del servidor — funciona, pero es vulnerable a un MITM en
   la red WiFi del local. Antes de ir a producción real, reemplazar por
   `wifiClientSecure.setCACert(...)` con la CA real de `api.comarpos.com`.
   En modo local dev (`PRINTBOX_LOCAL_DEV=1`, default) esto no aplica
   porque no se usa TLS para nada salvo la descarga del logo.
4. **Levantar el backend** (`npm run dev` en `backend/`, ver su `.env`
   para las vars de PrintBox) — no hace falta ningún paso aparte: el
   ESP32 es quien pregunta, así que alcanza con que el backend esté
   arriba y sea alcanzable desde donde esté el device (ver "Modo local
   dev" para el caso de desarrollo).
5. **Flashear y emparejar un solo dispositivo** de prueba antes de pensar
   en fabricar/desplegar varios.

## Modo local dev (sin TLS) — probar de punta a punta

`main.cpp` tiene `#define PRINTBOX_LOCAL_DEV 1` cerca del principio (sección
"MODO LOCAL DEV vs PRODUCCION"). El pairing/heartbeat/poll/ack son el
**mismo código** en dev y en producción (pull-based de punta a punta, ver
"Por qué pull y no push") — lo único que cambia con este flag es contra
qué host/puerto/protocolo hablan. Con `PRINTBOX_LOCAL_DEV` en 1:

- Todo habla HTTP plano (puerto 5000) contra `API_HOST` **por WiFi** — hoy
  `API_HOST` apunta a `192.168.0.174` (la IP de la PC de desarrollo en su
  red local, sacada con `ipconfig`). **Si tu PC tiene otra IP, cambiala
  ahí, y la WiFi que cargues en el pairing tiene que ser la misma red que
  esa PC** (si no, el ESP32 no tiene forma de llegarle a nada). A
  diferencia del esquema viejo, no hace falta que el backend pueda
  alcanzar al ESP32 — solo al revés.
- La descarga del logo del tenant (`downloadToLittleFs`) sigue usando TLS
  siempre (le pega a Cloudinary, un host real de internet) — con
  `setInsecure()` (ver el punto de TLS en producción más arriba) funciona
  sin pinnear nada, pero no rompe si falla: el firmware ya trata la falta
  de logo como no-fatal y sigue con la marca de ComarPOS nomás.

Antes de pasar a producción real (device fuera de la LAN de desarrollo):
pasar `PRINTBOX_LOCAL_DEV` a `0` y recompilar (vuelve a usar HTTPS/443) —
eso es todo, no hace falta port-forwarding/DDNS/VPN de ningún lado gracias
al modelo pull (ver "Por qué pull y no push" más arriba).

**Variables relevantes en `backend/.env`**: `API_PUBLIC_URL` (para el
pairing/heartbeat y para armar la URL del logo rasterizado),
`PRINTBOX_CREDENTIALS_SECRET` (encripta el token de cada device en
`PrintboxDevice.tokenEncrypted`). Ya está completada con un valor de
prueba generado para esta corrida — regenerarla antes de ir a producción.

## Qué quedó pendiente (a propósito, para no inflar esto más)

- **`PrintboxDevice.remoteHost` es un campo legacy del esquema push
  anterior** — ya no se usa para nada (ver "Por qué pull y no push") y no
  tiene UI de edición en el panel. Se dejó la columna en la DB en vez de
  migrarla para no tocar el schema de prod sin necesidad; se puede quitar
  del todo en una migración dedicada si en algún momento molesta.
- **`pollForPrintJob()`/`ackPrintJob()` corren en el `loop()` principal
  del ESP32, sin task/hilo aparte** — mientras esperan respuesta del
  backend (hasta `POLL_RESPONSE_TIMEOUT_MS`, 12s), el botón de factory
  reset y el refresco del OLED quedan sin atender hasta por ese tiempo
  (el reset en sí sigue siendo correcto porque mide con `millis()` real,
  no por vueltas de loop — ver "Por qué pull y no push"). Si en algún
  momento esto molesta en la práctica, la solución es mover el poll a un
  segundo task de FreeRTOS (el ESP32-S3 tiene los dos núcleos para eso),
  no bajar el timeout — bajarlo demasiado solo cambia el problema por
  reconectar TLS todo el tiempo.
- **Si el PrintBox está apagado o sin internet en el momento de la
  venta, el ticket se queda esperando en la cola** (`PrintJob.status =
  QUEUED`) hasta que el device vuelve a conectarse y hace poll — no hay
  vencimiento/expiración de un job viejo todavía, así que un PrintBox que
  vuelve después de mucho tiempo (horas/días) va a imprimir de una todos
  los tickets acumulados en orden. Si hace falta, agregar un TTL que
  marque como `FAILED` los `QUEUED` más viejos que cierto umbral.
- **Las requests van firmadas (HMAC) pero no cifradas** (ver "Seguridad:
  firma HMAC" más arriba) — nadie sin el token puede fabricar o modificar
  una request, pero el contenido de cada ticket viaja en texto plano.
  Alguien mirando el tráfico de la red (LAN, o el tramo hacia
  `api.comarpos.com` si intercepta antes del TLS) puede leer los datos de
  cada venta. Aceptable como primer paso; para confidencialidad real hace
  falta TLS de punta a punta, no implementado por el costo que eso tiene
  en el ESP32.
- **El QR de las ventas facturadas por AFIP nunca se probó contra hardware
  real** (`printQrCode` en `main.cpp`, comando ESC/POS `GS ( k` modelo 2).
  Es el comando estándar que la mayoría de las impresoras térmicas de red
  soportan, pero varía por fabricante/firmware — si el modelo puntual no lo
  soporta, sale texto/basura en vez de un QR (o no imprime nada) en esa
  parte puntual del ticket, sin romper el resto. Antes de confiar en esto
  para un cliente real: facturar una venta de prueba por AFIP y mirar si el
  QR sale legible.
- **El texto que va al ticket se pliega a ASCII plano** (`utf8ToAscii` en
  `main.cpp`): á/é/í/ó/ú/ñ pierden el acento (á→a, ñ→n, etc.), cualquier
  otro caracter fuera de ese rango se descarta directo. Es a propósito: la
  impresora usa un codepage de un solo byte que varía según el modelo, y
  mandarle UTF-8 crudo saca glifos random (nos pasó: un caracter chino en
  medio de un ticket real). Si hace falta imprimir con tildes de verdad,
  hay que saber el codepage exacto de la impresora (`ESC t n`) y mapear a
  ese en vez de plegar a ASCII.
- El logo de ComarPOS es **texto** ESC/POS (doble tamaño, bold), no un
  bitmap real — no había un archivo de logo para convertir. El mecanismo
  para reemplazarlo por un bitmap de verdad ya existe (mismo camino que el
  logo del tenant, `logoRaster.service.ts` en el backend) — falta nada más
  que el asset y apuntar `comarposFooterEscPos()` a esos bytes en vez de
  al texto.
- No hay pantalla de "error persistente / reintentar pairing" en el OLED
  más allá de un mensaje de una línea — suficiente para debug, no para un
  operador no técnico todavía.
- El AP de setup (`WIFI_AP_PASSWORD` en `main.cpp`) usa una clave fija
  horneada en el firmware, igual para todos los PrintBox — aceptable
  porque solo está prendido mientras el device no está emparejado (una
  ventana corta, y la única forma de aprovecharlo es estar físicamente
  cerca del local), pero no es una clave por-device. Si en algún momento
  hace falta más que eso, generar una clave derivada del hardwareId y
  mostrarla en el OLED en vez de hardcodearla.
- **La reconexión de WiFi (`ensureWifiConnected` en `main.cpp`) es un
  reintento simple cada 5s**, sin backoff ni límite de intentos — para un
  device que vive enchufado 24/7 en un local esto es razonable, pero si el
  WiFi del local cae por mucho tiempo el ESP32 va a estar reintentando
  indefinidamente (no hay una alarma/aviso más allá del OLED en
  "Conectando...").
- **`wifiClientSecure.setInsecure()` no valida el certificado del servidor**
  (ver el punto de TLS en producción más arriba) — pendiente reemplazar
  por una CA pinneada antes de un despliegue real fuera de una red de
  confianza.
