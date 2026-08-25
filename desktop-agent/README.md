# ComarPOS Agent

App de escritorio (Electron, bandeja del sistema) para tenants que tienen
PC conectada a la impresora pero no un PrintBox (ESP32) físico. Mismo
protocolo de emparejamiento/impresión que `printbox/` — a ojos del backend
es un `PrintboxDevice` más (`kind: DESKTOP_AGENT`), así que **no hace falta
ningún endpoint nuevo**: reusa `POST /printbox/pair`,
`GET /printbox/devices/:id/poll`, `POST /printbox/devices/:id/jobs/:jobId/ack`
y `POST /printbox/devices/:id/heartbeat` tal cual (ver `printbox/README.md`
para el detalle del protocolo — pairing por código de 6 dígitos, long-poll
firmado con HMAC-SHA256, cola de `PrintJob`).

## Por qué imprime distinto al ESP32

El ESP32 arma comandos ESC/POS crudos y se los manda directo a la IP de la
impresora por el puerto 9100 (ver `printbox/src/main.cpp`). Esta app, en
cambio, **imprime a través del driver de Windows** de la impresora ya
instalada (`webContents.print()` en `src/printer.js`) — más robusto entre
marcas/modelos (el driver del fabricante resuelve codepage/ancho de papel
por su cuenta, en vez de tener que mapear eso a mano como sí hace el
firmware, ver "Que quedó pendiente" en `printbox/README.md`), a costa de
necesitar que la impresora esté instalada como impresora de Windows de
antemano (la mayoría de las térmicas USB modernas lo hacen solas al
conectarlas).

El contenido del ticket es el mismo JSON (`buildTicketPayload` en
`backend/src/services/ticket.service.ts`) que ya recibe el ESP32 — 
`src/ticketTemplate.js` lo convierte a HTML en vez de a ESC/POS, pero son
las mismas secciones (negocio, cliente, items, totales, IVA, medios de
pago, CAE/QR de AFIP si está facturado, envío, footer).

## Estructura

- `src/main.js` — proceso principal: tray, ventana de configuración/pairing,
  arranca el agente en `app.whenReady()`, auto-inicio con Windows.
- `src/worker.js` — el loop (equivalente a `loop()` en `main.cpp`): long-poll
  a `/poll`, imprime, hace `ack`, heartbeat cada 60s.
- `src/api.js` — cliente HTTP de los 4 endpoints, firma HMAC de cada request.
- `src/hmac.js` — espejo exacto de `backend/src/services/printbox/printbox.hmac.ts`.
- `src/config.js` — config local (`app.getPath('userData')/config.json`):
  `apiUrl`, `deviceId`, `token`, `hardwareId`, `printerName`.
- `src/printer.js` — listar impresoras de Windows / imprimir HTML silencioso.
- `src/ticketTemplate.js` — payload JSON → HTML del ticket (incluye QR de AFIP
  vía el paquete `qrcode`).
- `src/setup.html` + `src/setup-renderer.js` + `src/preload.js` — ventana de
  pairing/configuración (contextIsolation, sin nodeIntegration en el
  renderer — todo pasa por IPC/`preload.js`).

## Desarrollar

```bash
cd desktop-agent
npm install
npm start
```

## Generar el instalador (Windows, NSIS)

```bash
npm run dist
```

Genera `dist-installer/ComarPOS-Agent-Setup.exe`. Copiar ese archivo a
`frontend/public/downloads/ComarPOS-Agent-Setup.exe` para que quede
descargable desde el panel (`[tenant]/configuracion/printbox`, botón
"Descargar agente para Windows").

**El instalador no está firmado** (falta un certificado de code-signing) —
Windows SmartScreen puede mostrar una advertencia la primera vez que alguien
lo ejecuta ("Windows protegió su PC"). Es esperable en un instalador sin
firmar; para sacar eso hace falta comprar un certificado de firma de código
y firmarlo en el build (`electron-builder` lo soporta vía `certificateFile`/
`certificatePassword`, no configurado todavía).

## Qué queda pendiente (a propósito, para no inflar esto más)

- Sin firma de código (ver arriba) — SmartScreen advierte al instalar.
- Sin auto-actualización (no hay `electron-updater` configurado) — una
  versión nueva del agente requiere descargar e instalar el `.exe` de nuevo
  a mano en cada PC.
- `apiUrl` está hardcodeado a producción (`https://api.comarpos.com`,
  `DEFAULT_API_URL` en `config.js`) — no hay UI para cambiarlo, a propósito
  (el usuario final no debería necesitar tocarlo nunca).
- El tamaño de página del ticket es fijo (`76mm` en `ticketTemplate.js`, ver
  el CSS) — no hay selector de 58mm/80mm en la UI. Si hace falta, agregar un
  campo mas en `config.js` (`paperWidthMm`) y parametrizar el CSS.
- Igual que el ESP32 (ver `printbox/README.md`): un job viejo en la cola se
  imprime igual apenas el agente vuelve a conectarse, sin TTL/vencimiento.
