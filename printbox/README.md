# PrintBox

ESP32-S3 + W5500 (ethernet) + impresora térmica ESC/POS + OLED de estado.
El backend le pega directo por HTTP (`POST /print/ticket`) cuando hay que
imprimir un ticket — el ESP32 es, ni más ni menos, un servidor HTTP chiquito
que sabe hacer una cosa. Mismo contrato que el viejo agente local de
Windows (`comarpos-local-agent`) que este dispositivo reemplaza, así que el
backend no tuvo que aprender un protocolo nuevo, solo un destino nuevo.

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
   request (`req.ip`, no algo que el ESP32 auto-reporte) y le devuelve el
   token.
4. El ESP32 guarda todo en NVS (`Preferences`, incluido el SSID/password
   de la WiFi) y reinicia. De ahí en adelante arranca directo en modo
   WiFi-estación (sin AP) y levanta su propio servidor HTTP en el puerto
   80, esperando `POST /print/ticket` — sin volver a necesitar el
   servidor de pairing (mismo `WiFiServer`, cambia de rol).
5. **La impresora se conecta al PrintBox por cable** (W5500), en un link
   punto a punto — no hace falta que la impresora ni el ESP32 estén en la
   misma red WiFi/router del local. El PrintBox se pone a sí mismo una IP
   en la misma /24 que la de la impresora (ver `deriveLocalIpForPrinter`
   en `main.cpp`) y le manda el ticket por ESC/POS crudo (puerto 9100).
6. Venta cobrada → backend le pega por HTTP directo a `deviceIp:80/print/ticket`
   (la request va firmada con HMAC-SHA256 usando el token del pairing como
   secreto, no el token en texto plano — ver "Seguridad: firma HMAC" más
   abajo) → el ESP32 verifica la firma, imprime (por el cable a la
   impresora) → le contesta `200 {"ok":true}` al backend en la misma
   respuesta HTTP — no hay ack por separado, la respuesta HTTP ES el ack.
7. Cada 60s el ESP32 manda un heartbeat (`POST /printbox/devices/:id/heartbeat`,
   también firmado) para que el backend sepa que sigue vivo y, sobre todo,
   para actualizar `deviceIp` si el DHCP local le cambió la IP después del
   pairing.

## Por qué HTTP directo y no MQTT

La primera versión de esto usaba un broker MQTT (primero Mosquitto en
Docker, después uno embebido en el propio backend) para que el ESP32 nunca
tuviera que aceptar conexiones entrantes. Se cambió a HTTP directo a
propósito: para probar en la LAN de un cliente es mucho más simple pegarle
a una IP:puerto que mantener un broker, y el ESP32 corriendo su propio
servidor es exactamente lo que ya hacía el agente local de Windows que
esto reemplaza (mismo contrato `POST /print/ticket`, ver
`comarpos-local-agent`). El costo es que el ESP32 tiene que ser alcanzable
desde el backend — hoy eso significa "misma LAN", y en producción real
(backend en Railway, PrintBox en el local del cliente) hace falta algo
tipo port-forwarding/DDNS/dominio propio para el PrintBox, o una VPN entre
ambos. No implementado todavía — ver "Qué quedó pendiente".

## Seguridad: firma HMAC (no TLS)

El ESP32 no puede hacer de servidor TLS de forma robusta (certificados,
renovación, el costo de CPU/memoria que eso implica en un
microcontrolador). En vez de eso, **todas las requests entre el backend y
el PrintBox van firmadas con HMAC-SHA256**, usando el token del pairing
como secreto compartido (nunca viaja en texto plano en ningún header —
antes sí, se cambió a propósito). Mismo esquema en las dos direcciones:
el ESP32 firma su heartbeat, el backend firma cada `/print/ticket`. La
lógica vive espejada en `backend/src/services/printbox/printbox.hmac.ts`
(backend) y la sección "SEGURIDAD" de `main.cpp` (firmware) — si una de
las dos cambia de formato sin la otra, todas las firmas empiezan a dar
inválidas.

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

- `src/main.cpp` — todo el firmware (pairing local, WiFi, NVS, servidor
  HTTP de impresión, heartbeat, firma HMAC, impresión ESC/POS, OLED,
  cache del logo del tenant).
- `backend/src/services/printbox/printbox.hmac.ts` — la mitad del esquema
  de firma que vive del lado del backend (firma `/print/ticket`, verifica
  el heartbeat).
- No hay broker/servicio aparte que deployar — el backend le pega directo
  al ESP32.

## ⚠️ Estado real: escrito, no probado contra hardware real de punta a punta

Este firmware se probó parcialmente contra un ESP32-S3 + W5500 + impresora
física real (ver más abajo el bug de ESP32+W5500 que se encontró y
parcheó), pero el flujo HTTP directo (reemplazo del MQTT) todavía no se
probó en hardware — se escribió después de esas pruebas. Antes de confiar
en esto:

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
   `wifiClientSecure.setCACert(...)` con la CA real de `api.comarpos.com.ar`.
   En modo local dev (`PRINTBOX_LOCAL_DEV=1`, default) esto no aplica
   porque no se usa TLS para nada salvo la descarga del logo.
4. **Levantar el backend** (`npm run dev` en `backend/`, ver su `.env`
   para las vars de PrintBox) — no hace falta ningún paso aparte, el
   backend ya sabe pegarle directo al PrintBox por su IP.
5. **Flashear y emparejar un solo dispositivo** de prueba antes de pensar
   en fabricar/desplegar varios.

## Modo local dev (sin TLS) — probar de punta a punta

`main.cpp` tiene `#define PRINTBOX_LOCAL_DEV 1` cerca del principio (sección
"MODO LOCAL DEV vs PRODUCCION"). Con eso en 1:

- El pairing/heartbeat hablan HTTP plano (puerto 5000) contra `API_HOST`
  **por WiFi** — hoy `API_HOST` apunta a `192.168.0.174` (la IP de la PC
  de desarrollo en su red local, sacada con `ipconfig`). **Si tu PC tiene
  otra IP, cambiala ahí, y la WiFi que cargues en el pairing tiene que ser
  la misma red que esa PC** (si no, el ESP32 no tiene forma de llegarle,
  ni al pairing ni después a nada).
- El backend, para mandar tickets, le pega a `http://<deviceIp>:80/print/ticket`
  — `deviceIp` es la IP con la que el ESP32 le llegó al backend en el
  pairing/heartbeat, tiene que ser una IP de la LAN alcanzable desde donde
  corre el backend (si el backend corre en tu PC y el ESP32 está en la
  misma red, esto ya funciona solo).
- La descarga del logo del tenant (`downloadToLittleFs`) sigue usando TLS
  siempre (le pega a Cloudinary, un host real de internet) — con
  `setInsecure()` (ver el punto de TLS en producción más arriba) funciona
  sin pinnear nada, pero no rompe si falla: el firmware ya trata la falta
  de logo como no-fatal y sigue con la marca de ComarPOS nomás.

Antes de pasar a producción real (device fuera de la LAN del comercio):
pasar `PRINTBOX_LOCAL_DEV` a `0` y recompilar (vuelve a usar HTTPS/443), Y
resolver cómo el backend le llega al PrintBox desde afuera de esa LAN (ver
"Por qué HTTP directo y no MQTT" más arriba — no implementado todavía).

**Variables relevantes en `backend/.env`**: `API_PUBLIC_URL` (para el
pairing/heartbeat y para armar la URL del logo rasterizado),
`PRINTBOX_CREDENTIALS_SECRET` (encripta el token de cada device en
`PrintboxDevice.tokenEncrypted`). Ya está completada con un valor de
prueba generado para esta corrida — regenerarla antes de ir a producción.

## Qué quedó pendiente (a propósito, para no inflar esto más)

- **Alcance fuera de la LAN**: `PrintboxDevice.remoteHost` (cargable a
  mano desde el panel) permite pisar la IP local automática con un host
  propio (`printbox-x.tudominio.com[:puerto]`) — pero seguís necesitando
  DNS + port-forwarding configurados a mano de tu lado en cada local. No
  hay DDNS automático ni descubrimiento — si la IP pública del local
  cambia, hay que actualizar el DNS vos (o el cliente).
- **Sin cola/reintento si el PrintBox está apagado o inalcanzable en el
  momento de la venta**: a diferencia del viejo esquema con broker (que
  guardaba el mensaje y lo entregaba cuando el device volvía a conectar),
  ahora el POST falla en el momento (`PrintJob.status = FAILED`) y no hay
  reintento automático — si la impresora estaba apagada, ese ticket no
  sale solo cuando vuelva a prender. Si hace falta, se puede agregar un
  cron que reintente los `PrintJob` en `FAILED` reciente.
- **Las requests van firmadas (HMAC) pero no cifradas** (ver "Seguridad:
  firma HMAC" más arriba) — nadie sin el token puede fabricar o modificar
  una request, pero el contenido de cada ticket viaja en texto plano.
  Alguien mirando el tráfico de la red (LAN o, si se usa `remoteHost`,
  potencialmente en el camino por internet) puede leer los datos de cada
  venta. Aceptable como primer paso; para confidencialidad real hace falta
  TLS de punta a punta, no implementado por el costo que eso tiene en el
  ESP32.
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
