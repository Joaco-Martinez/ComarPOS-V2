#include <Arduino.h>
#include <SPI.h>
#include <Wire.h>
#include <Ethernet.h>
#include <WiFi.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <WiFiClientSecure.h>
#include <Adafruit_GFX.h>
#include <time.h>
#include "mbedtls/md.h" // HMAC-SHA256 -- parte del core ESP32 (ESP-IDF), no hace falta agregarla a lib_deps

// ================= OLED (128x64, I2C) =================
// Volvio a GPIO8/9 -- es el unico par de pines que detecto el modulo de
// forma consistente en el scan I2C (0x3c, dos modulos distintos). Se
// probo mover a 5/6 pero ahi el scan dejo de detectar cualquier cosa, lo
// que apunta a un problema de cableado en ESE cambio puntual, no a que
// 8/9 este mal -- no tocar de nuevo sin retestear el scan primero.
#define OLED_SDA 8
#define OLED_SCL 9
#define OLED_WIDTH 128
#define OLED_HEIGHT 64
#define OLED_ADDR 0x3C

// Muchos modulos "OLED 128x64 I2C" vendidos como SSD1306 son en realidad
// SH1106 (chip distinto, memoria de video de 132 columnas en vez de 128) --
// responden al I2C sin error (oled.begin() da true, no aparece el log de
// "OLED no respondio") pero no dibujan nada con el driver de SSD1306. Si
// pasa eso, este es el primer sospechoso -- probar poniendo esto en 0 si
// el modulo termina siendo un SSD1306 de verdad.
#define PRINTBOX_OLED_DRIVER_SH1106 1

#if PRINTBOX_OLED_DRIVER_SH1106
  #include <Adafruit_SH110X.h>
  #define OLED_WHITE SH110X_WHITE
  Adafruit_SH1106G oled(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);
#else
  #include <Adafruit_SSD1306.h>
  #define OLED_WHITE SSD1306_WHITE
  Adafruit_SSD1306 oled(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);
#endif

bool oledOk = false;

// Contadores de tickets emitidos -- persisten en NVS (Preferences, mismo
// namespace "printbox" que la config de WiFi/pairing, ver
// loadTicketCounters()/saveTicketCounters() mas abajo) para sobrevivir
// tanto a un corte de luz como al interruptor de on/off. A proposito NO
// se tocan con el boton de factory reset (ver factoryResetWifiConfig()):
// son datos de uso del negocio, no configuracion de red -- borrar el
// pairing no tendria que borrar cuantos tickets se emitieron.
uint32_t ticketsTotal = 0;
uint32_t ticketsFacturados = 0;
uint32_t ticketsNoFacturados = 0;

enum class DeviceStatus { BOOTING, PAIRING, CONNECTING, READY, PRINTING, ERROR_ };

// ================= LEDS DE ESTADO =================
// Reemplazan al indicador visual del OLED (que quedo sin poder
// diagnosticar en hardware, ver historial) -- 3 LEDs simples con su
// resistencia limitadora (220-330 ohm) en serie hacia GND cada uno, sin
// nada de I2C de por medio.
#define LED_RED_PIN   15
#define LED_BLUE_PIN  16
#define LED_GREEN_PIN 17

DeviceStatus currentDeviceStatus = DeviceStatus::BOOTING;

// No bloqueante (nada de delay() aca) -- se llama en cada vuelta de
// loop(), el parpadeo sale solo de comparar millis() contra el estado
// actual. checkFactoryResetButton() se llama DESPUES de esta en loop() y,
// mientras el boton esta sostenido, pisa lo que esta funcion escribio ese
// mismo ciclo (ver ahi) -- es a proposito, el feedback del boton tiene
// prioridad visual sobre el estado normal del device.
void updateStatusLeds() {
  unsigned long now = millis();

  switch (currentDeviceStatus) {
    case DeviceStatus::READY: {
      digitalWrite(LED_GREEN_PIN, HIGH);
      digitalWrite(LED_RED_PIN, LOW);
      digitalWrite(LED_BLUE_PIN, LOW);
      break;
    }

    case DeviceStatus::PRINTING: {
      bool on = (now / 150) % 2 == 0; // parpadeo rapido -- "ready pero ocupado"
      digitalWrite(LED_GREEN_PIN, on ? HIGH : LOW);
      digitalWrite(LED_RED_PIN, LOW);
      digitalWrite(LED_BLUE_PIN, LOW);
      break;
    }

    case DeviceStatus::ERROR_: {
      digitalWrite(LED_RED_PIN, HIGH);
      digitalWrite(LED_BLUE_PIN, LOW);
      digitalWrite(LED_GREEN_PIN, LOW);
      break;
    }

    default: {
      // BOOTING, PAIRING, CONNECTING -- "todavia no conectado/emparejado"
      bool on = (now / 400) % 2 == 0;
      digitalWrite(LED_RED_PIN, on ? HIGH : LOW);
      digitalWrite(LED_BLUE_PIN, on ? HIGH : LOW);
      digitalWrite(LED_GREEN_PIN, LOW);
      break;
    }
  }
}

void showStatus(DeviceStatus status, const String &detail = "") {
  currentDeviceStatus = status;
  Serial.println("[status] " + detail);
  if (!oledOk) return;

  const char* title;
  switch (status) {
    case DeviceStatus::BOOTING:    title = "Iniciando...";     break;
    case DeviceStatus::PAIRING:    title = "Configurar";       break;
    case DeviceStatus::CONNECTING: title = "Conectando...";    break;
    case DeviceStatus::READY:      title = "Listo";            break;
    case DeviceStatus::PRINTING:   title = "Imprimiendo...";   break;
    case DeviceStatus::ERROR_:     title = "Error";            break;
    default:                       title = "";
  }

  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setTextColor(OLED_WHITE);
  oled.setCursor(0, 0);
  oled.println("ComarPOS PrintBox");
  oled.drawLine(0, 10, OLED_WIDTH, 10, OLED_WHITE);
  oled.setCursor(0, 18);
  oled.setTextSize(2);
  oled.println(title);
  oled.setTextSize(1);
  oled.setCursor(0, 42);
  oled.println(detail);

  // Solo en la pantalla de "Listo" -- en el resto de los estados (booteando,
  // conectando, pairing, imprimiendo, error) no hay lugar ni tiene sentido.
  if (status == DeviceStatus::READY) {
    oled.setCursor(0, 52);
    oled.println(
      "T:" + String(ticketsTotal) +
      " F:" + String(ticketsFacturados) +
      " NF:" + String(ticketsNoFacturados)
    );
  }

  oled.display();
}


#define W5500_CS    10
#define W5500_SCK   12
#define W5500_MISO  13
#define W5500_MOSI  11

// Boton de factory reset (WiFi/pairing) -- GPIO4 esta libre en el
// ESP32-S3-DevKitC-1 (no es pin de strapping de boot como el 0/3/45/46,
// ni de PSRAM/flash como el 26-32/35-37), asi que no hay riesgo de que
// interfiera con el arranque si llega a estar en LOW en el momento de
// prender el device. Wiring: un pulsador normal-abierto entre GPIO4 y
// GND, nada mas -- se usa el pull-up interno (INPUT_PULLUP, ver setup()),
// no hace falta resistencia externa.
#define FACTORY_RESET_PIN 4
#define FACTORY_RESET_HOLD_MS 5000UL


#define PRINTBOX_LOCAL_DEV 0

#define PRINTBOX_PRINT_TENANT_LOGO 1

// Imprime 4 tickets de prueba (Factura A, B, C y uno no fiscal) una sola
// vez por boot, apenas el device esta listo -- para probar de una el
// formato/corte contra la impresora real sin tener que hacer una venta de
// verdad. Poner en 0 antes de flashear un PrintBox que va a produccion en
// el local de un cliente real (si no, cada vez que se reinicie el device
// -- corte de luz, etc. -- va a gastar papel imprimiendo esto).
#define PRINTBOX_TEST_PRINT_ON_BOOT 0


#if PRINTBOX_LOCAL_DEV

  static const char* API_HOST = "192.168.0.174";
  static const uint16_t API_PORT = 5000;
#else
  static const char* API_HOST = "api.comarpos.com";
  static const uint16_t API_PORT = 443;
#endif
static const char* API_PAIR_PATH = "/printbox/pair";


#define PRINTBOX_CONFIG_VERSION 2

struct DeviceConfig {
  String tenantId;
  String deviceId;
  String token;
  IPAddress printerIp;
  String wifiSsid;
  String wifiPassword;
  bool valid = false;
};

Preferences prefs;
DeviceConfig cfg;

void loadTicketCounters() {
  prefs.begin("printbox", true);
  ticketsTotal = prefs.getUInt("tkTotal", 0);
  ticketsFacturados = prefs.getUInt("tkFact", 0);
  ticketsNoFacturados = prefs.getUInt("tkNoFact", 0);
  prefs.end();
}

void saveTicketCounters() {
  prefs.begin("printbox", false);
  prefs.putUInt("tkTotal", ticketsTotal);
  prefs.putUInt("tkFact", ticketsFacturados);
  prefs.putUInt("tkNoFact", ticketsNoFacturados);
  prefs.end();
}

EthernetClient printerClient; // W5500: solo el link punto a punto con la impresora, ver seccion W5500 mas arriba.
WiFiClient wifiClient;
WiFiClientSecure wifiClientSecure;

#if PRINTBOX_LOCAL_DEV
  Client& apiClient = wifiClient;
#else
  Client& apiClient = wifiClientSecure;
#endif


static const char* WIFI_AP_SSID = "PrintBox-Setup";
static const char* WIFI_AP_PASSWORD = "printbox123"; // min 8 caracteres, WPA2
WiFiServer wifiPairingServer(80);

// Pantalla dedicada para el estado de pairing -- showStatus() generico
// solo tiene lugar para un titulo grande + una linea de detalle, no
// alcanza para mostrar red + clave + URL a la vez. Se llama en vez de
// showStatus(PAIRING, ...) desde setup().
void showPairingScreen(const String &apIp) {
  currentDeviceStatus = DeviceStatus::PAIRING;
  Serial.println(
    "Sin emparejar. Conectate a la red WiFi \"" + String(WIFI_AP_SSID) +
    "\" (clave: " + String(WIFI_AP_PASSWORD) + ") y entra a http://" +
    apIp + "/ para configurarlo."
  );

  if (!oledOk) return;

  oled.clearDisplay();
  oled.setTextColor(OLED_WHITE);
  oled.setTextSize(1);

  oled.setCursor(0, 0);
  oled.println("Conectate a esta WiFi:");

  oled.setCursor(0, 10);
  oled.print("Red: ");
  oled.println(WIFI_AP_SSID);

  oled.setCursor(0, 20);
  oled.print("Clave: ");
  oled.println(WIFI_AP_PASSWORD);

  oled.drawLine(0, 30, OLED_WIDTH, 30, OLED_WHITE);

  oled.setCursor(0, 34);
  oled.println("Configurar en:");

  oled.setCursor(0, 44);
  oled.println("http://" + apIp);

  oled.display();
}

bool sendChunked(const uint8_t* data, size_t len, int chunkSize = 64, int delayMs = 30);
bool printTicketFromPayload(JsonDocument &doc);

// ================= IDENTIDAD DEL DISPOSITIVO =================
// El ESP32 tiene una MAC de fabrica unica por chip (efuse) -- la usamos
// para: (a) armar la MAC ethernet (evita que dos printbox en la misma red
// colisionen, cosa que pasaba con la MAC fija hardcodeada de la version de
// prueba), y (b) como hardwareId estable para el pairing.
void deriveMac(byte mac[6]) {
  uint64_t chipId = ESP.getEfuseMac();
  mac[0] = 0xDE; // bit "localmente administrado" para no pisar rangos de fabricantes reales
  mac[1] = (chipId >> 32) & 0xFF;
  mac[2] = (chipId >> 24) & 0xFF;
  mac[3] = (chipId >> 16) & 0xFF;
  mac[4] = (chipId >> 8) & 0xFF;
  mac[5] = chipId & 0xFF;
}

String getHardwareId() {
  uint64_t chipId = ESP.getEfuseMac();
  char buf[13];
  snprintf(buf, sizeof(buf), "%012llX", (unsigned long long)chipId);
  return String(buf);
}

// ================= SEGURIDAD: FIRMA HMAC-SHA256 + HORA REAL (NTP) =================
// El ESP32 no puede hacer de servidor TLS de forma robusta (certificados,
// renovacion, memoria/CPU que eso implica en un microcontrolador) -- en
// vez de eso, cada request entre el backend y este device va firmada con
// HMAC-SHA256 usando el token del pairing como secreto compartido. Esto
// NO cifra nada (quien mire el trafico ve el contenido igual), pero
// garantiza que nadie sin el token puede fabricar ni modificar una
// request. Mismo esquema, mismo secreto, en las dos direcciones
// (heartbeat lo firma el ESP32, /print/ticket lo firma el backend) -- ver
// backend/src/services/printbox/printbox.hmac.ts, que es la otra mitad de
// esto y tiene que quedar BYTE A BYTE compatible con lo de aca.
//
// El timestamp de la firma va en SEGUNDOS desde epoch (no ms): un
// unsigned long de 32 bits alcanza hasta el año 2106, y evita tener que
// formatear un entero de 64 bits a mano (Arduino String no tiene
// constructor para eso). Para que el timestamp que manda el ESP32 en el
// heartbeat sea un segundo real (y no el tiempo desde que bootea, que es
// lo que da millis()), hace falta sincronizar la hora por NTP -- sin eso
// el backend rechaza el heartbeat por "timestamp fuera de rango" aunque
// la firma este perfecta.
bool ntpSynced = false;

void ensureNtpSynced() {
  if (ntpSynced) return;
  if (WiFi.status() != WL_CONNECTED) return;

  configTime(0, 0, "pool.ntp.org", "time.nist.gov");

  time_t now = time(nullptr);
  unsigned long start = millis();
  // 1700000000 ~ noviembre 2023 -- time(nullptr) devuelve algo chico
  // (cerca de 0) hasta que el NTP realmente sincronizo, asi que esto es
  // nada mas "¿ya paso a ser una fecha real?", no una fecha limite en si.
  while (now < 1700000000 && millis() - start < 8000) {
    delay(200);
    now = time(nullptr);
  }

  if (now >= 1700000000) {
    ntpSynced = true;
    Serial.println("NTP sincronizado.");
  } else {
    Serial.println("NTP no sincronizo a tiempo, reintento en el proximo heartbeat.");
  }
}

String currentTimestampSec() {
  return String((unsigned long)time(nullptr));
}

String hmacSha256Hex(const String &key, const String &message) {
  uint8_t hash[32];
  const mbedtls_md_info_t *mdInfo = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);

  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, mdInfo, 1); // 1 = HMAC
  mbedtls_md_hmac_starts(&ctx, (const unsigned char*)key.c_str(), key.length());
  mbedtls_md_hmac_update(&ctx, (const unsigned char*)message.c_str(), message.length());
  mbedtls_md_hmac_finish(&ctx, hash);
  mbedtls_md_free(&ctx);

  String hex;
  hex.reserve(64);
  char byteBuf[3];
  for (int i = 0; i < 32; i++) {
    snprintf(byteBuf, sizeof(byteBuf), "%02x", hash[i]);
    hex += byteBuf;
  }
  return hex;
}

// Mismo formato que buildCanonicalString() en printbox.hmac.ts -- si esto
// se desalinea de lo que arma el backend, todas las firmas dan invalidas.
String buildCanonicalString(const String &method, const String &path, const String &timestamp, const String &body) {
  return method + "\n" + path + "\n" + timestamp + "\n" + body;
}

String signRequest(const String &secret, const String &method, const String &path, const String &timestamp, const String &body) {
  return hmacSha256Hex(secret, buildCanonicalString(method, path, timestamp, body));
}

// ================= PREFERENCES (NVS) =================
bool loadConfig(DeviceConfig &c) {
  prefs.begin("printbox", true);
  bool valid = prefs.getBool("valid", false);
  int savedVersion = prefs.getInt("cfgVer", 0);

  if (valid && savedVersion != PRINTBOX_CONFIG_VERSION) {
    Serial.println("Config guardada de una version vieja del firmware (v" + String(savedVersion) + ", esperaba v" + String(PRINTBOX_CONFIG_VERSION) + ") -- la descarto y pido pairing de nuevo.");
    valid = false;
  }

  if (valid) {
    c.tenantId = prefs.getString("tenantId");
    c.deviceId = prefs.getString("deviceId");
    c.token = prefs.getString("token");
    c.printerIp = IPAddress(prefs.getUInt("printerIp", 0));
    c.wifiSsid = prefs.getString("wifiSsid");
    c.wifiPassword = prefs.getString("wifiPass");
    c.valid = true;
  }

  prefs.end();
  return valid;
}

void saveConfig(const DeviceConfig &c) {
  prefs.begin("printbox", false);
  prefs.putBool("valid", true);
  prefs.putInt("cfgVer", PRINTBOX_CONFIG_VERSION);
  prefs.putString("tenantId", c.tenantId);
  prefs.putString("deviceId", c.deviceId);
  prefs.putString("token", c.token);
  prefs.putUInt("printerIp", (uint32_t)c.printerIp);
  prefs.putString("wifiSsid", c.wifiSsid);
  prefs.putString("wifiPass", c.wifiPassword);
  prefs.end();
}

// Borra SOLO la config de WiFi/pairing (no los contadores de tickets, ver
// el comentario en ticketsTotal mas arriba) y reinicia -- despues del
// reboot cfg.valid da false y el device vuelve solo al modo AP/pairing
// (ver el "if (!configured)" en setup()), como si fuera la primera vez.
void factoryResetWifiConfig() {
  prefs.begin("printbox", false);
  prefs.remove("valid");
  prefs.remove("cfgVer");
  prefs.remove("tenantId");
  prefs.remove("deviceId");
  prefs.remove("token");
  prefs.remove("printerIp");
  prefs.remove("wifiSsid");
  prefs.remove("wifiPass");
  prefs.remove("logoUrl");
  prefs.end();

  LittleFS.remove("/logo.bin"); // si no, hasta el proximo logo distinto quedaria sirviendo el del tenant anterior

  Serial.println("================================");
  Serial.println("FACTORY RESET: config de WiFi/pairing borrada. Reiniciando...");
  Serial.println("================================");

  if (oledOk) {
    oled.clearDisplay();
    oled.setTextSize(1);
    oled.setTextColor(OLED_WHITE);
    oled.setCursor(0, 24);
    oled.setTextSize(2);
    oled.println("Reseteado");
    oled.display();
  }

  delay(800);
  ESP.restart();
}

// ================= HTTP MINIMO (pairing local) =================
// No usamos una lib de WebServer completa a proposito: WiFiServer ya viene
// con el core de WiFi y esto es un solo formulario. Si el pairing necesita
// mas de un endpoint en el futuro, ahi si vale la pena sumar una lib como
// ESPAsyncWebServer.
String urlDecode(const String &s) {
  String out;
  out.reserve(s.length());
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '+') {
      out += ' ';
    } else if (c == '%' && i + 2 < s.length()) {
      char hex[3] = { s[i + 1], s[i + 2], 0 };
      out += (char)strtol(hex, nullptr, 16);
      i += 2;
    } else {
      out += c;
    }
  }
  return out;
}

String extractFormValue(const String &body, const String &key) {
  int start = body.indexOf(key + "=");
  if (start < 0) return "";
  start += key.length() + 1;
  int end = body.indexOf('&', start);
  if (end < 0) end = body.length();
  return urlDecode(body.substring(start, end));
}

// Ambas (sendHtmlResponse/servePairingPage) son template en vez de estar
// duplicadas para EthernetClient/WiFiClient -- las dos implementan
// println()/etc. con la misma firma (heredado de Print), pero no comparten
// una clase base comun accesible por referencia, asi que una funcion
// generica que acepte "cualquier cosa con esos metodos" es mas simple que
// mantener dos copias casi identicas.
//
// Manda la respuesta con Content-Length explicito en vez de confiar en
// "Connection: close + cierre de socket = fin del body" -- ese patron
// funcionaba con el server de Ethernet, pero contra el stack WiFi del
// ESP32 (o el navegador/webview de captive portal del celu) el cierre del
// socket no siempre se interpreta como "se acabo la respuesta", y el
// navegador se queda esperando para siempre ("cargando" infinito). Con
// Content-Length el navegador sabe de antemano cuantos bytes esperar y
// no depende de la temporizacion del cierre de conexion.
template <typename ClientT>
void sendHtmlResponse(ClientT &client, const String &body) {
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: text/html; charset=utf-8");
  client.print("Content-Length: ");
  client.println(body.length());
  client.println("Connection: close");
  client.println();
  client.print(body);
  client.flush();
}

template <typename ClientT>
void servePairingPage(ClientT &client) {
  String body;
  body += "<!doctype html><html><body style='font-family:sans-serif;max-width:420px;margin:40px auto'>";
  body += "<h2>Configurar PrintBox</h2>";
  body += "<p>Pedile el código de pairing a quien lo esté dando de alta en el panel.</p>";
  body += "<form method='POST' action='/pair'>";
  body += "<label>Código de pairing</label><br>";
  body += "<input name='code' maxlength='6' style='font-size:1.5em;width:100%;box-sizing:border-box'><br><br>";
  body += "<label>Nombre de tu red WiFi (para conectarse a internet)</label><br>";
  body += "<input name='wifiSsid' style='width:100%;box-sizing:border-box'><br><br>";
  body += "<label>Contraseña de esa red WiFi</label><br>";
  body += "<input name='wifiPassword' type='password' style='width:100%;box-sizing:border-box'><br><br>";
  body += "<label>IP de la impresora (conectada por cable al PrintBox)</label><br>";
  body += "<input name='printerIp' placeholder='192.168.1.100' style='width:100%;box-sizing:border-box'><br><br>";
  body += "<button type='submit' style='width:100%;padding:10px'>Emparejar</button>";
  body += "</form></body></html>";
  sendHtmlResponse(client, body);
}

// El link Ethernet con la impresora es punto a punto (sin DHCP del otro
// lado, ver seccion W5500), asi que la IP local del ESP32 en ese link no
// puede pedirse por DHCP -- se deriva de la IP de la impresora asumiendo
// una /24 (el default de facto en impresoras de red), con un ultimo
// octeto fijo que casi seguro no colisiona con la propia impresora.
IPAddress deriveLocalIpForPrinter(const IPAddress &printerIp) {
  IPAddress local = printerIp;
  local[3] = (printerIp[3] == 250) ? 249 : 250;
  return local;
}

bool pairWithBackend(const String &code, const IPAddress &printerIp, const String &wifiSsid, const String &wifiPassword) {
  Serial.println("Conectando a la red WiFi \"" + wifiSsid + "\"...");
  WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());

  unsigned long wifiStart = millis();
  wl_status_t wifiStatus = WiFi.status();
  while (millis() - wifiStart < 20000) {
    wifiStatus = WiFi.status();
    if (wifiStatus == WL_CONNECTED) break;
    if (wifiStatus == WL_CONNECT_FAILED || wifiStatus == WL_NO_SSID_AVAIL) {
      Serial.print("WiFi rechazo la conexion, status=");
      Serial.println((int)wifiStatus);
      break;
    }
    delay(250);
  }

  if (wifiStatus != WL_CONNECTED) {
    Serial.println("No se pudo conectar a esa red WiFi (revisá el nombre/contraseña, o que sea 2.4GHz -- el ESP32 no anda en WiFi de 5GHz).");
    return false;
  }
  Serial.println("WiFi OK, IP: " + WiFi.localIP().toString());

  Serial.println("Conectando al backend para hacer pairing (" + String(API_HOST) + ":" + String(API_PORT) + ")...");
  apiClient.setTimeout(5000);

  if (!apiClient.connect(API_HOST, API_PORT)) {
    Serial.println("No se pudo conectar al backend.");
    return false;
  }

  JsonDocument reqDoc;
  reqDoc["pairingCode"] = code;
  reqDoc["hardwareId"] = getHardwareId();
  String body;
  serializeJson(reqDoc, body);

  apiClient.print(String("POST ") + API_PAIR_PATH + " HTTP/1.1\r\n");
  apiClient.print(String("Host: ") + API_HOST + "\r\n");
  apiClient.print("Content-Type: application/json\r\n");
  apiClient.print("Content-Length: " + String(body.length()) + "\r\n");
  apiClient.print("Connection: close\r\n\r\n");
  apiClient.print(body);

  // Descarta headers de la respuesta, nos quedamos con el body. Igual que
  // el loop de mas abajo, tiene que chequear available() ademas de
  // connected() -- en una respuesta rapida/local el server puede cerrar
  // la conexion (Connection: close) apenas termina de escribir, antes de
  // que el ESP32 llegue a leer los bytes que ya estan en el buffer. Sin
  // el || available(), este loop cortaba de una (a veces apenas despues
  // de la status line) dejando el resto de los headers sin descartar --
  // ese resto terminaba pegado adelante del JSON en responseBody, lo
  // rompia como JSON valido, y el pairing se rechazaba aunque el backend
  // hubiera contestado ok:true.
  unsigned long start = millis();
  String line;
  while ((apiClient.connected() || apiClient.available()) && millis() - start < 10000) {
    line = apiClient.readStringUntil('\n');
    if (line == "\r") break;
  }

  String responseBody;
  while (apiClient.connected() || apiClient.available()) {
    if (apiClient.available()) {
      responseBody += (char)apiClient.read();
    }
    if (millis() - start > 10000) break;
  }
  apiClient.stop();

  JsonDocument resDoc;
  DeserializationError err = deserializeJson(resDoc, responseBody);
  if (err || resDoc["ok"] != true) {
    Serial.println("Pairing rechazado por el backend: " + responseBody);
    return false;
  }

  cfg.tenantId = resDoc["tenantId"].as<String>();
  cfg.deviceId = resDoc["deviceId"].as<String>();
  cfg.token = resDoc["token"].as<String>();

  cfg.printerIp = printerIp;
  cfg.wifiSsid = wifiSsid;
  cfg.wifiPassword = wifiPassword;
  cfg.valid = true;

  saveConfig(cfg);
  Serial.println("Pairing OK. tenantId=" + cfg.tenantId + " deviceId=" + cfg.deviceId);
  return true;
}

template <typename ClientT>
void handlePairingRequest(ClientT client) {
  if (!client) return;

  String requestLine = client.readStringUntil('\n');
  int contentLength = 0;
  String header;
  while (client.connected() && (header = client.readStringUntil('\n')) != "\r") {
    if (header.startsWith("Content-Length:")) {
      contentLength = header.substring(16).toInt();
    }
    if (header.length() <= 1) break;
  }

  if (requestLine.startsWith("POST /pair")) {
    String body;
    unsigned long start = millis();
    while ((int)body.length() < contentLength && client.connected() && millis() - start < 5000) {
      if (client.available()) body += (char)client.read();
    }

    String code = extractFormValue(body, "code");
    String printerIpStr = extractFormValue(body, "printerIp");
    String wifiSsid = extractFormValue(body, "wifiSsid");
    String wifiPassword = extractFormValue(body, "wifiPassword");
    IPAddress printerIp;
    printerIp.fromString(printerIpStr);

    bool ok = pairWithBackend(code, printerIp, wifiSsid, wifiPassword);

    if (ok) {
      sendHtmlResponse(client, String("<h3>Emparejado. Reiniciando...</h3>"));
      client.stop();
      delay(500);
      ESP.restart();
      return;
    }

    sendHtmlResponse(client, String("<h3>Código inválido o expirado. Volvé atrás e intentá de nuevo.</h3>"));
    showStatus(DeviceStatus::ERROR_, "Código inválido");
  } else {
    servePairingPage(client);
  }

  delay(1);
  client.stop();
}

void handleWifiPairingServer() {
  handlePairingRequest(wifiPairingServer.available());
}

// ================= POLL DE IMPRESION (pull, no push) =================
// El ESP32 le pregunta AL BACKEND si hay algo para imprimir (long-poll a
// GET /printbox/devices/:id/poll), en vez de que el backend le pegue
// directo por HTTP a este device. Cambio a proposito respecto de la
// version anterior (WiFiServer propio escuchando POST /print/ticket): un
// backend en Railway no puede abrir una conexion entrante hacia un ESP32
// detras de NAT en la LAN de un cliente sin port-forwarding, y eso no es
// viable para instalar en locales de terceros sin acceso al router -- ver
// "Por que pull y no push" en printbox/README.md y
// backend/src/services/printbox/printbox.service.ts#pollForPrintJob (la
// otra mitad de esto).
bool printTicketFromPayload(JsonDocument &doc);

// Cuanto esperamos por la respuesta de /poll antes de darla por perdida --
// tiene que ser mayor al POLL_MAX_WAIT_MS del backend (hoy 8s, ver
// printbox.service.ts) porque esa request se mantiene abierta ahi adentro
// esperando un job; este margen extra cubre la latencia de red/TLS de ida
// y vuelta. Nada de esto corre en un task aparte -- loop() se queda
// bloqueado hasta POLL_RESPONSE_TIMEOUT_MS por vuelta cuando no hay nada
// para imprimir, asi que el boton de factory reset y el refresco del OLED
// quedan congelados hasta por ese tiempo (funcionalmente el reset sigue
// andando bien -- checkFactoryResetButton() mide con millis() real, no por
// cantidad de vueltas de loop() -- pero el feedback visual/tactil puede
// tardar unos segundos de mas en reaccionar). POLL_MAX_WAIT_MS mas chico
// en el backend hace esto mas responsive a costa de reconectar TLS mas
// seguido; este es el trade-off elegido, ver comentario ahi.
#define POLL_RESPONSE_TIMEOUT_MS 12000UL

void ackPrintJob(const String &jobId, bool ok, const String &errorMsg) {
  if (!apiClient.connect(API_HOST, API_PORT)) {
    Serial.println("Ack: no se pudo conectar al backend.");
    return;
  }

  String path = "/printbox/devices/" + cfg.deviceId + "/jobs/" + jobId + "/ack";
  String timestamp = currentTimestampSec();
  String signature = signRequest(cfg.token, "POST", path, timestamp, "");

  // ok/error van SIN firmar a proposito (ver comentario espejo en
  // printbox.service.ts#ackPrintJob) -- errorMsg es siempre un literal
  // nuestro (nunca texto que venga de afuera), asi que no hace falta
  // escapar comillas/backslashes para armar este JSON a mano.
  String body = String("{\"ok\":") + (ok ? "true" : "false") + ",\"error\":\"" + errorMsg + "\"}";

  apiClient.print(String("POST ") + path + " HTTP/1.1\r\n");
  apiClient.print(String("Host: ") + API_HOST + "\r\n");
  apiClient.print("X-Pos-Timestamp: " + timestamp + "\r\n");
  apiClient.print("X-Pos-Signature: " + signature + "\r\n");
  apiClient.print("Content-Type: application/json\r\n");
  apiClient.print("Content-Length: " + String(body.length()) + "\r\n");
  apiClient.print("Connection: close\r\n\r\n");
  apiClient.print(body);

  unsigned long start = millis();
  while (apiClient.connected() && millis() - start < 5000) {
    if (apiClient.available()) apiClient.read(); // descartamos la respuesta, solo nos importa que salio
  }
  apiClient.stop();
}

// Railway/Cloudflare le meten "Transfer-Encoding: chunked" a la respuesta
// del poll (confirmado pegandole al endpoint a mano con curl/openssl) --
// el body real viene envuelto en el framing de chunked-encoding en vez de
// como texto plano: "<tamaño en hex>\r\n<datos>\r\n0\r\n\r\n" (uno o mas
// chunks, terminados por uno de tamaño 0). Si el body ya viene plano
// (empieza con "{", caso no observado hoy pero por las dudas -- ej. si
// algun dia cambia el proxy de por medio), se devuelve tal cual.
String dechunkHttpBody(const String &raw) {
  if (raw.length() == 0 || raw.charAt(0) == '{') return raw;

  String result;
  int pos = 0;
  while (pos < (int)raw.length()) {
    int lineEnd = raw.indexOf("\r\n", pos);
    if (lineEnd < 0) break;

    String sizeToken = raw.substring(pos, lineEnd);
    int semicolon = sizeToken.indexOf(';'); // extensiones de chunk (raras), se ignoran
    if (semicolon >= 0) sizeToken = sizeToken.substring(0, semicolon);
    sizeToken.trim();

    char *endPtr = nullptr;
    long chunkSize = strtol(sizeToken.c_str(), &endPtr, 16);
    if (endPtr == sizeToken.c_str() || chunkSize < 0) break; // no era un tamaño hex valido -- frenamos

    if (chunkSize == 0) break; // chunk final, no queda nada mas util

    int dataStart = lineEnd + 2;
    int dataEnd = dataStart + chunkSize;
    if (dataEnd > (int)raw.length()) {
      // chunk incompleto (se corto la conexion a mitad de un chunk) -- nos
      // quedamos con lo que hay, mejor eso que nada.
      result += raw.substring(dataStart);
      break;
    }

    result += raw.substring(dataStart, dataEnd);
    pos = dataEnd + 2; // +2 para saltar el "\r\n" que cierra este chunk
  }
  return result;
}

// Se llama en cada vuelta de loop() (ver mas abajo) -- abre una conexion,
// pregunta, y si el backend contesta con un job lo imprime y lo confirma
// (ackPrintJob). Si no hay nada, vuelve enseguida (el backend ya esperó
// hasta POLL_MAX_WAIT_MS de su lado antes de contestar vacio) y el proximo
// loop() vuelve a preguntar -- efectivamente esto es un long-poll
// encadenado sin pausa entre pregunta y pregunta.
void pollForPrintJob() {
  if (!apiClient.connect(API_HOST, API_PORT)) {
    Serial.println("Poll: no se pudo conectar al backend.");
    delay(1000); // evita un loop caliente reintentando conexion sin parar si el backend esta caido
    return;
  }

  // Default de Stream (1s) es mucho menor a lo que puede tardar el backend
  // en contestar (mantiene la conexion abierta hasta POLL_MAX_WAIT_MS de su
  // lado esperando un job) -- sin esto, readStringUntil() de mas abajo
  // corta la espera antes de tiempo y la tratamos como "nada para
  // imprimir" aunque el backend todavia este esperando.
  apiClient.setTimeout(POLL_RESPONSE_TIMEOUT_MS);

  String path = "/printbox/devices/" + cfg.deviceId + "/poll";
  String timestamp = currentTimestampSec();
  String signature = signRequest(cfg.token, "GET", path, timestamp, "");

  apiClient.print(String("GET ") + path + " HTTP/1.1\r\n");
  apiClient.print(String("Host: ") + API_HOST + "\r\n");
  apiClient.print("X-Pos-Timestamp: " + timestamp + "\r\n");
  apiClient.print("X-Pos-Signature: " + signature + "\r\n");
  apiClient.print("Connection: close\r\n\r\n");

  // Leemos TODO (headers + body) hasta que cierra la conexion, en vez de
  // parsear Content-Length linea por linea -- mismo patron ya probado en
  // pairWithBackend() (ver el comentario ahi sobre connected()||available()).
  // Se abandono el parseo manual de headers porque Railway/Cloudflare le
  // agregan ~30 headers de seguridad/tracing (CSP, HSTS, x-railway-*,
  // cf-*, etc. -- confirmado pegandole al endpoint a mano) y el parser
  // linea-por-linea se desalineaba con ese volumen sin que se pudiera
  // aislar bien la causa exacta sin acceso al hardware. Leer todo y cortar
  // por el primer "\r\n\r\n" es indiferente a cuantos headers manden.
  unsigned long start = millis();
  String raw;
  while ((apiClient.connected() || apiClient.available()) && millis() - start < POLL_RESPONSE_TIMEOUT_MS) {
    if (apiClient.available()) raw += (char)apiClient.read();
  }
  apiClient.stop();

  int firstLineEnd = raw.indexOf('\n');
  String statusLine = firstLineEnd >= 0 ? raw.substring(0, firstLineEnd) : raw;

  // 204 (nada para imprimir): nada que hacer, volvemos a preguntar en el
  // proximo loop().
  if (statusLine.indexOf("204") >= 0) {
    return;
  }

  int headerEnd = raw.indexOf("\r\n\r\n");
  String body = headerEnd >= 0 ? dechunkHttpBody(raw.substring(headerEnd + 4)) : "";

  if (body.length() == 0) {
    Serial.println("Poll: body vacio (raw=" + String(raw.length()) + " bytes, status=\"" + statusLine + "\"), lo descarto.");
    return;
  }

  JsonDocument pollDoc;
  DeserializationError pollErr = deserializeJson(pollDoc, body);
  if (pollErr) {
    Serial.println("Poll: JSON invalido (" + String(pollErr.c_str()) + "), raw=" + String(raw.length()) +
                    " body=" + String(body.length()) + " bytes. Primeros 60: [" + body.substring(0, 60) +
                    "] Ultimos 60: [" + body.substring(body.length() > 60 ? body.length() - 60 : 0) + "]");
    return;
  }

  String jobId = pollDoc["jobId"] | "";
  String jobBody = pollDoc["body"] | "";
  String jobTimestamp = pollDoc["timestamp"] | "";
  String jobSignature = pollDoc["signature"] | "";

  if (jobId.length() == 0 || jobBody.length() == 0) {
    Serial.println("Poll: respuesta sin jobId/body, la descarto.");
    return;
  }

  // Misma verificacion que antes hacia handlePrintRequest() contra un push
  // entrante -- el contrato de firma (method/path fijos "POST"
  // "/print/ticket") no cambio, solo cambio el transporte que la trae.
  if (ntpSynced) {
    long diffSec = labs((long)time(nullptr) - (long)jobTimestamp.toInt());
    if (diffSec > 300) { // 5 min, mismo margen que verifyRequest() en el backend
      Serial.println("Job con timestamp fuera de rango, lo rechazo.");
      ackPrintJob(jobId, false, "timestamp out of range");
      return;
    }
  }

  String expectedSignature = signRequest(cfg.token, "POST", "/print/ticket", jobTimestamp, jobBody);
  if (expectedSignature != jobSignature) {
    Serial.println("Job con firma invalida, lo rechazo.");
    ackPrintJob(jobId, false, "invalid signature");
    return;
  }

  JsonDocument ticketDoc;
  if (deserializeJson(ticketDoc, jobBody)) {
    ackPrintJob(jobId, false, "invalid json");
    return;
  }

  String saleId = ticketDoc["saleId"] | "";
  Serial.println("Job recibido: " + saleId);

  showStatus(DeviceStatus::PRINTING, saleId);
  bool ok = printTicketFromPayload(ticketDoc);

  if (ok) {
    // ticketDoc["invoice"] solo esta presente si la venta esta facturada de
    // verdad por AFIP (ver isInvoiced en printTicketFromPayload) -- mismo
    // criterio para contar como facturado/no facturado.
    bool wasInvoiced = !ticketDoc["invoice"].as<JsonObject>().isNull();
    ticketsTotal++;
    if (wasInvoiced) ticketsFacturados++; else ticketsNoFacturados++;
    saveTicketCounters();
  }

  showStatus(ok ? DeviceStatus::READY : DeviceStatus::ERROR_, ok ? cfg.tenantId : "No se pudo imprimir");

  ackPrintJob(jobId, ok, ok ? "" : "print failed");
}

// ================= IMPRESION =================
// Convierte UTF-8 a ASCII plano, plegando vocales acentuadas/ñ a su
// equivalente sin tilde y descartando cualquier otro caracter no-ASCII.
// La ESC/POS de la impresora usa un codepage de un solo byte (CP437/850/
// etc, varia segun el modelo) -- mandarle UTF-8 crudo hace que cualquier
// caracter fuera de ASCII se interprete mal contra esa tabla y salga un
// glifo random (nos paso con una tilde: termino imprimiendo un caracter
// chino en medio del ticket). Plegar a ASCII sacrifica la tilde pero
// garantiza texto legible sin importar que codepage tenga la impresora.
String utf8ToAscii(const String &in) {
  String out;
  out.reserve(in.length());

  size_t i = 0;
  while (i < in.length()) {
    uint8_t c = (uint8_t)in[i];

    if (c < 0x80) {
      out += (char)c;
      i += 1;
      continue;
    }

    int seqLen = 1;
    if ((c & 0xE0) == 0xC0) seqLen = 2;
    else if ((c & 0xF0) == 0xE0) seqLen = 3;
    else if ((c & 0xF8) == 0xF0) seqLen = 4;

    uint32_t codepoint = 0;
    if (seqLen == 2 && i + 1 < in.length()) {
      codepoint = ((c & 0x1F) << 6) | ((uint8_t)in[i + 1] & 0x3F);
    }

    char ascii = 0;
    switch (codepoint) {
      case 0xC1: ascii = 'A'; break; // Á
      case 0xE1: ascii = 'a'; break; // á
      case 0xC9: ascii = 'E'; break; // É
      case 0xE9: ascii = 'e'; break; // é
      case 0xCD: ascii = 'I'; break; // Í
      case 0xED: ascii = 'i'; break; // í
      case 0xD3: ascii = 'O'; break; // Ó
      case 0xF3: ascii = 'o'; break; // ó
      case 0xDA: ascii = 'U'; break; // Ú
      case 0xFA: ascii = 'u'; break; // ú
      case 0xDC: ascii = 'U'; break; // Ü
      case 0xFC: ascii = 'u'; break; // ü
      case 0xD1: ascii = 'N'; break; // Ñ
      case 0xF1: ascii = 'n'; break; // ñ
      case 0xA1: ascii = '!'; break; // ¡
      case 0xBF: ascii = '?'; break; // ¿
      default: ascii = 0; break;     // caracter fuera del rango soportado -- se descarta
    }

    if (ascii) out += ascii;
    i += seqLen;
  }

  return out;
}

// Formatea un monto con separador de miles "." y coma decimal, como
// cualquier ticket argentino real (ver los ejemplos que mando el cliente).
// Sin esto se estaba usando String(float, decimales) de Arduino tal cual,
// que no sabe de separador de miles y usa punto para los decimales -- salia
// "$78400.00" en vez de "$78.400,00", y ademas quedaba inconsistente con
// "Pago: ..." (ese si viaja ya formateado en es-AR desde el backend, ver
// getMetodoPago en ticket.service.ts).
String formatMoneyAR(double value, int decimals) {
  bool negative = value < 0;
  if (negative) value = -value;

  double factor = pow(10, decimals);
  long scaled = (long)(value * factor + 0.5); // redondeo, no truncar

  long intPart = scaled;
  for (int i = 0; i < decimals; i++) intPart /= 10;

  long fracPart = scaled - intPart * (long)round(factor);

  String intStr = String(intPart);
  String withThousands;
  int sinceSep = 0;

  for (int i = intStr.length() - 1; i >= 0; i--) {
    withThousands = intStr[i] + withThousands;
    sinceSep++;
    if (sinceSep % 3 == 0 && i != 0) {
      withThousands = "." + withThousands;
    }
  }

  String result = withThousands;

  if (decimals > 0) {
    String fracStr = String(fracPart);
    while ((int)fracStr.length() < decimals) fracStr = "0" + fracStr;
    result += "," + fracStr;
  }

  return negative ? ("-" + result) : result;
}

bool sendChunked(
  const uint8_t* data,
  size_t len,
  int chunkSize,
  int delayMs
) {

  size_t sent = 0;

  while (sent < len) {

    if (!printerClient.connected()) {
      Serial.print(
        "Conexion cortada durante envio. Offset: "
      );
      Serial.println(sent);

      return false;
    }

    size_t remaining = len - sent;

    size_t toSend =
      min(
        (size_t)chunkSize,
        remaining
      );

    size_t written =
      printerClient.write(
        data + sent,
        toSend
      );

    if (written == 0) {
      delay(1);
      continue;
    }

    sent += written;

    if (delayMs > 0) {
      delay(delayMs);
    }
  }

  return true;
}

bool sendLogoData(const uint8_t* data, size_t len) {

  size_t sent = 0;

  while (sent < len) {

    if (!printerClient.connected()) {
      Serial.println("ERROR: conexion perdida durante logo.");
      return false;
    }

    size_t remaining = len - sent;

    // Bloques pequeños para la TP450S.
    size_t chunk = min(
      (size_t)128,
      remaining
    );

    size_t written =
      printerClient.write(
        data + sent,
        chunk
      );

    if (written == 0) {
      delay(5);
      continue;
    }

    sent += written;

    // MUY IMPORTANTE:
    // no hacemos delay grande entre cada bloque.
    delay(1);
  }

  return true;
}

bool downloadToLittleFs(const String &url, const char* destPath) {
  // Bug real que estaba ahi desde el principio: esto asumia SIEMPRE https
  // en el puerto 443 (valido para Cloudinary), pero logoEscposUrl puede
  // apuntar a nuestro propio backend (API_PUBLIC_URL) -- que en modo local
  // dev es http plano en el puerto 5000, no https:443. Como el codigo
  // viejo no separaba el puerto del host, terminaba tratando
  // "192.168.0.174:5000" (con los dos puntos y todo) como si fuera un
  // hostname unico, y el DNS obviamente nunca lo resolvia. Ahora se
  // parsea el esquema/puerto de la URL de verdad y se elige http/https
  // segun corresponda, en vez de asumir siempre TLS:443.
  bool isHttps = url.startsWith("https://");

  int schemeEnd = url.indexOf("://");
  String rest = schemeEnd >= 0 ? url.substring(schemeEnd + 3) : url;
  int pathStart = rest.indexOf('/');
  String hostPort = pathStart >= 0 ? rest.substring(0, pathStart) : rest;
  String path = pathStart >= 0 ? rest.substring(pathStart) : "/";

  String host = hostPort;
  uint16_t port = isHttps ? 443 : 80;
  int colonIdx = hostPort.indexOf(':');
  if (colonIdx >= 0) {
    host = hostPort.substring(0, colonIdx);
    port = hostPort.substring(colonIdx + 1).toInt();
  }

  Client *client = isHttps ? (Client*)&wifiClientSecure : (Client*)&wifiClient;

  if (isHttps) {
    // TODO: pinnear la CA real en vez de setInsecure() (que no valida el
    // certificado del servidor -- deja pasar un MITM). Aceptable por
    // ahora porque esta descarga puntual solo trae un bitmap de logo no
    // sensible, y falla no-fatal si el host no responde.
    wifiClientSecure.setInsecure();
  }

  if (!client->connect(host.c_str(), port)) {
    Serial.println("No se pudo conectar para bajar " + url);
    return false;
  }

  client->print("GET " + path + " HTTP/1.1\r\n");
  client->print("Host: " + host + "\r\n");
  client->print("Connection: close\r\n\r\n");

  unsigned long headerStart = millis();
  int contentLength = -1;
  String line;
  // Mismo fix que en pairWithBackend(): hace falta || client->available()
  // ademas de connected(), si no en una respuesta rapida/local el loop
  // corta antes de terminar de descartar los headers.
  while ((client->connected() || client->available()) && millis() - headerStart < 10000) {
    line = client->readStringUntil('\n');
    if (line.startsWith("Content-Length:")) contentLength = line.substring(16).toInt();
    if (line == "\r") break;
  }

  if (contentLength <= 0) {
    Serial.println("Sin Content-Length, aborto descarga de " + url);
    client->stop();
    return false;
  }
  Serial.println("Descargando logo: Content-Length=" + String(contentLength) + " bytes");

  String tmpPath = String(destPath) + ".tmp";
  File f = LittleFS.open(tmpPath, "w");
  if (!f) {
    client->stop();
    return false;
  }

  // Timeout de body APARTE del de headers (antes compartian el mismo
  // reloj, asi que una respuesta de headers lenta le comia tiempo al
  // timeout del body sin necesidad).
  unsigned long bodyStart = millis();
  int received = 0;
  uint8_t buf[256];
  while (received < contentLength && millis() - bodyStart < 15000) {
    if (client->available()) {
      int n = client->read(buf, min((int)sizeof(buf), contentLength - received));
      if (n > 0) {
        f.write(buf, n);
        received += n;
      }
    }
  }
  f.close();
  client->stop();

  Serial.println("Descarga de logo: recibidos " + String(received) + "/" + String(contentLength) + " bytes");

  if (received != contentLength) {
    Serial.println("Descarga incompleta de " + url);
    LittleFS.remove(tmpPath);
    return false;
  }

  LittleFS.remove(destPath);
  LittleFS.rename(tmpPath, destPath);

  // Diagnostico: los primeros bytes del archivo ya descargado tienen que
  // ser el header de GS v 0 (1D 76 30 00 + ancho/alto en bytes little
  // endian) -- si esto no coincide, el problema es la descarga/el bitmap
  // en si, no como se imprime despues.
  File check = LittleFS.open(destPath, "r");
  if (check) {
    uint8_t head[8];
    int headLen = check.read(head, sizeof(head));
    check.close();
    String hex;
    for (int i = 0; i < headLen; i++) {
      char b[4];
      snprintf(b, sizeof(b), "%02X ", head[i]);
      hex += b;
    }
    Serial.println("Primeros bytes de " + String(destPath) + ": " + hex + "(esperado: 1D 76 30 00 ...)");
  }
  return true;
}

// Valida que el archivo tenga forma de comando GS v 0 valido ANTES de
// mandarlo a la impresora -- header correcto (1D 76 30 00) y tamano total
// exactamente igual a 8 (header) + widthBytes*heightPx (el bitmap
// completo, ni de mas ni de menos). Sin esto, si la descarga vino
// truncada/corrupta (o el bitmap que arma el backend esta mal formado por
// el motivo que sea), el firmware lo manda igual y la impresora imprime
// esos bytes crudos como texto -- un cuadro entero de caracteres random
// en el ticket. Con esta validacion, en vez de eso, se salta el logo
// calladamente: peor un ticket sin logo que uno ilegible.
bool isValidRasterFile(const char* path) {
  if (!LittleFS.exists(path)) return false;

  File f = LittleFS.open(path, "r");
  if (!f) return false;

  uint8_t head[8];
  int headLen = f.read(head, sizeof(head));
  size_t fileSize = f.size();
  f.close();

  if (headLen < 8) return false;
  if (head[0] != 0x1D || head[1] != 0x76 || head[2] != 0x30 || head[3] != 0x00) return false;

  uint16_t widthBytes = head[4] | (head[5] << 8);
  uint16_t heightPx = head[6] | (head[7] << 8);
  size_t expectedSize = 8 + (size_t)widthBytes * (size_t)heightPx;

  if (widthBytes == 0 || heightPx == 0 || fileSize != expectedSize) {
    Serial.println("Logo con tamano invalido: archivo=" + String(fileSize) + " bytes, esperado=" + String(expectedSize) + " bytes (widthBytes=" + String(widthBytes) + " heightPx=" + String(heightPx) + ")");
    return false;
  }

  return true;
}

bool ensureTenantLogoCached(const String &logoEscposUrl) {
  if (logoEscposUrl.length() == 0) return false;

  prefs.begin("printbox", true);
  String cachedUrl = prefs.getString("logoUrl", "");
  prefs.end();

  if (cachedUrl == logoEscposUrl && LittleFS.exists("/logo.bin")) {
    return isValidRasterFile("/logo.bin");
  }

  Serial.println("Logo del tenant nuevo/cambiado, descargando...");
  if (!downloadToLittleFs(logoEscposUrl, "/logo.bin")) return false;

  if (!isValidRasterFile("/logo.bin")) {
    Serial.println("Logo descargado pero no tiene forma de bitmap valido -- no se imprime.");
    LittleFS.remove("/logo.bin");
    return false;
  }

  prefs.begin("printbox", false);
  prefs.putString("logoUrl", logoEscposUrl);
  prefs.end();
  return true;
}

bool printCachedFile(const char* path) {

  if (!LittleFS.exists(path)) {
    Serial.println("ERROR: no existe el logo.");
    return false;
  }

  File f = LittleFS.open(path, "r");

  if (!f) {
    Serial.println("ERROR: no se pudo abrir logo.");
    return false;
  }

  size_t fileSize = f.size();

  if (fileSize < 8) {
    Serial.println("ERROR: logo demasiado pequeno.");
    f.close();
    return false;
  }

  // ============================================================
  // HEADER GS v 0
  // ============================================================

  uint8_t header[8];

  if (f.read(header, 8) != 8) {
    Serial.println("ERROR leyendo header del logo.");
    f.close();
    return false;
  }

  if (
    header[0] != 0x1D ||
    header[1] != 0x76 ||
    header[2] != 0x30 ||
    header[3] != 0x00
  ) {
    Serial.println("ERROR: logo no es GS v 0.");
    f.close();
    return false;
  }

  uint16_t sourceWidthBytes =
    (uint16_t)header[4] |
    ((uint16_t)header[5] << 8);

  uint16_t sourceWidth =
    sourceWidthBytes * 8;

  uint16_t sourceHeight =
    (uint16_t)header[6] |
    ((uint16_t)header[7] << 8);

  size_t expectedSize =
    8 +
    ((size_t)sourceWidthBytes * sourceHeight);

  if (
    sourceWidthBytes == 0 ||
    sourceHeight == 0 ||
    fileSize != expectedSize
  ) {
    Serial.println("ERROR: bitmap invalido.");
    f.close();
    return false;
  }

  Serial.println("================================");
  Serial.println("LOGO ORIGINAL");
  Serial.println("Width : " + String(sourceWidth) + " px");
  Serial.println("Height: " + String(sourceHeight) + " px");
  Serial.println("================================");

  // ============================================================
  // TAMAÑO FÍSICO OBJETIVO
  //
  // 35 mm @ 203 DPI ≈ 280 px (280 es multiplo de 8 -> sin padding)
  //
  // Queremos que el logo entre en un cuadrado de 280 x 280 px
  // manteniendo SIEMPRE la proporción original.
  // ============================================================

  const uint16_t TARGET_SIZE = 280;

  float scaleX =
    (float)TARGET_SIZE / (float)sourceWidth;

  float scaleY =
    (float)TARGET_SIZE / (float)sourceHeight;

  // Mantener proporción.
  float scale =
    min(scaleX, scaleY);

  uint16_t targetWidth =
    max(
      (uint16_t)1,
      (uint16_t)round(sourceWidth * scale)
    );

  uint16_t targetHeight =
    max(
      (uint16_t)1,
      (uint16_t)round(sourceHeight * scale)
    );

  Serial.println("================================");
  Serial.println("LOGO REDIMENSIONADO");
  Serial.println("Target width : " + String(targetWidth) + " px");
  Serial.println("Target height: " + String(targetHeight) + " px");
  Serial.println("================================");

  // ============================================================
  // VALIDACIÓN
  // ============================================================

  if (
    targetWidth > TARGET_SIZE ||
    targetHeight > TARGET_SIZE
  ) {
    Serial.println("ERROR: logo excede 35x35mm.");
    f.close();
    return false;
  }

  // ============================================================
  // CARGAR BITMAP ORIGINAL EN RAM
  // ============================================================

  size_t sourceDataSize =
    (size_t)sourceWidthBytes *
    sourceHeight;

  uint8_t* sourceBitmap =
    (uint8_t*)malloc(sourceDataSize);

  if (!sourceBitmap) {
    Serial.println("ERROR: no hay RAM para bitmap original.");
    f.close();
    return false;
  }

  f.seek(8);

  if (
    f.read(
      sourceBitmap,
      sourceDataSize
    ) != sourceDataSize
  ) {
    Serial.println("ERROR leyendo bitmap.");
    free(sourceBitmap);
    f.close();
    return false;
  }

  f.close();

  // ============================================================
  // ANCHO EN BYTES DEL LOGO REDIMENSIONADO
  // ============================================================

  uint16_t targetWidthBytes =
    (targetWidth + 7) / 8;

  // ============================================================
  // CENTRADO
  // ============================================================

  uint8_t center[] = {
    0x1B,
    0x61,
    0x01
  };

  if (!sendLogoData(center, sizeof(center))) {
    free(sourceBitmap);
    return false;
  }

  delay(20);

  // ============================================================
  // ESC * MODE 33
  //
  // Procesamos 24 filas por bloque.
  // ============================================================

  const uint16_t BAND_HEIGHT = 24;

  uint8_t* band =
    (uint8_t*)malloc(
      (size_t)targetWidthBytes *
      BAND_HEIGHT
    );

  if (!band) {
    Serial.println("ERROR: no hay RAM para banda.");
    free(sourceBitmap);
    return false;
  }

  memset(
    band,
    0,
    (size_t)targetWidthBytes * BAND_HEIGHT
  );

  // ESC 3 n: fija el line spacing a n/180" = BAND_HEIGHT dots, para que
  // matchee exacto con la altura de cada banda ESC *. Sin esto el LF de
  // fin de banda usa el spacing por defecto de la impresora (~1/6",
  // mas ancho que la banda) y queda un hueco blanco entre banda y
  // banda -- eso es lo que se ve como lineas horizontales en el logo.
  uint8_t tightLineSpacing[] = { 0x1B, 0x33, (uint8_t)BAND_HEIGHT };

  if (!sendLogoData(tightLineSpacing, sizeof(tightLineSpacing))) {
    free(band);
    free(sourceBitmap);
    return false;
  }

  // Buffer de la banda completa (targetWidth columnas x 3 bytes) para
  // mandarla de una sola vez -- antes se hacia un sendLogoData() de 3
  // bytes POR COLUMNA (hasta 280 escrituras TCP sueltas por banda), que
  // es lo que dejaba la impresion "cortada": la TP450S no llega a
  // reensamblar tantos paquetes chicos seguidos sin perder alguno.
  uint8_t* columnData =
    (uint8_t*)malloc((size_t)targetWidth * 3);

  if (!columnData) {
    Serial.println("ERROR: no hay RAM para columnas.");
    free(band);
    free(sourceBitmap);
    return false;
  }

  uint16_t currentY = 0;

  while (currentY < targetHeight) {

    uint16_t rowsThisBand =
      min(
        BAND_HEIGHT,
        (uint16_t)(targetHeight - currentY)
      );

    memset(
      band,
      0,
      (size_t)targetWidthBytes *
      BAND_HEIGHT
    );

    // ==========================================================
    // REDIMENSIONAMIENTO
    //
    // Para cada pixel destino buscamos el pixel correspondiente
    // del bitmap original.
    // ==========================================================

    for (
      uint16_t y = 0;
      y < rowsThisBand;
      y++
    ) {

      uint16_t targetY =
        currentY + y;

      uint16_t sourceY =
        (uint32_t)targetY *
        sourceHeight /
        targetHeight;

      if (sourceY >= sourceHeight) {
        sourceY = sourceHeight - 1;
      }

      for (
        uint16_t x = 0;
        x < targetWidth;
        x++
      ) {

        uint16_t sourceX =
          (uint32_t)x *
          sourceWidth /
          targetWidth;

        if (sourceX >= sourceWidth) {
          sourceX = sourceWidth - 1;
        }

        uint16_t sourceByte =
          sourceX / 8;

        uint8_t sourceBit =
          7 - (sourceX % 8);

        uint8_t pixel =
          sourceBitmap[
            (size_t)sourceY *
            sourceWidthBytes +
            sourceByte
          ];

        bool black =
          (pixel & (1 << sourceBit)) != 0;

        if (black) {

          uint16_t destByte =
            x / 8;

          uint8_t destBit =
            7 - (x % 8);

          band[
            (size_t)y *
            targetWidthBytes +
            destByte
          ] |=
            (1 << destBit);
        }
      }
    }

    // ==========================================================
    // ESC * MODE 33
    // ==========================================================

    uint8_t command[5];

    command[0] = 0x1B;
    command[1] = 0x2A;
    command[2] = 33;

    command[3] =
      targetWidth & 0xFF;

    command[4] =
      (targetWidth >> 8) & 0xFF;

    if (!sendLogoData(
      command,
      sizeof(command)
    )) {
      uint8_t resetLineSpacing[] = { 0x1B, 0x32 };
      sendLogoData(resetLineSpacing, sizeof(resetLineSpacing));
      free(columnData);
      free(band);
      free(sourceBitmap);
      return false;
    }

    // ==========================================================
    // DATOS VERTICALES
    // ==========================================================

    memset(
      columnData,
      0,
      (size_t)targetWidth * 3
    );

    for (
      uint16_t x = 0;
      x < targetWidth;
      x++
    ) {

      for (
        uint16_t y = 0;
        y < rowsThisBand;
        y++
      ) {

        uint16_t byteIndex =
          y / 8;

        uint8_t bitIndex =
          7 - (y % 8);

        uint16_t sourceByte =
          x / 8;

        uint8_t sourceBit =
          7 - (x % 8);

        uint8_t pixel =
          band[
            (size_t)y *
            targetWidthBytes +
            sourceByte
          ];

        if (
          pixel &
          (1 << sourceBit)
        ) {

          if (byteIndex < 3) {
            columnData[(size_t)x * 3 + byteIndex] |=
              (1 << bitIndex);
          }
        }
      }
    }

    // Toda la banda (targetWidth * 3 bytes) en un solo sendLogoData()
    // en vez de una llamada por columna.
    if (!sendLogoData(
      columnData,
      (size_t)targetWidth * 3
    )) {
      uint8_t resetLineSpacing[] = { 0x1B, 0x32 };
      sendLogoData(resetLineSpacing, sizeof(resetLineSpacing));
      free(columnData);
      free(band);
      free(sourceBitmap);
      return false;
    }

    // ==========================================================
    // FIN DE BANDA
    // ==========================================================

    uint8_t lf = 0x0A;

    if (!sendLogoData(&lf, 1)) {
      uint8_t resetLineSpacing[] = { 0x1B, 0x32 };
      sendLogoData(resetLineSpacing, sizeof(resetLineSpacing));
      free(columnData);
      free(band);
      free(sourceBitmap);
      return false;
    }

    currentY += rowsThisBand;

    // MUY PEQUEÑA PAUSA
    delay(3);
  }

  // ============================================================
  // LIMPIEZA
  // ============================================================

  // Restaurar line spacing por defecto (ESC 2) -- si queda en
  // BAND_HEIGHT, el resto del ticket (texto normal) se imprime con las
  // lineas pegadas entre si.
  uint8_t resetLineSpacing[] = { 0x1B, 0x32 };
  sendLogoData(resetLineSpacing, sizeof(resetLineSpacing));

  free(columnData);
  free(band);
  free(sourceBitmap);

  Serial.println("================================");
  Serial.println("LOGO IMPRESO");
  Serial.println(
    "Tamano final: " +
    String(targetWidth) +
    " x " +
    String(targetHeight) +
    " px"
  );
  Serial.println("Aproximadamente 35 x 35 mm");
  Serial.println("================================");

  delay(20);

  return true;
}

String escPrintMode(bool bold, bool doubleHeight, bool doubleWidth) {
  uint8_t mode = 0;
  if (bold) mode |= 0x08;
  if (doubleHeight) mode |= 0x10;
  if (doubleWidth) mode |= 0x20;
  String s = "\x1B\x21";
  s += (char)mode;
  return s;
}

// Texto de marca ComarPOS: horneado en el firmware, no depende de nada
// que mande el backend -- se imprime siempre, en todo tenant. Discreto a
// proposito (bold, tamano normal, no doble alto/ancho) -- pedido
// explicito: tiene que estar, pero sin molestar / sin dominar el ticket.
// (Upgrade futuro: reemplazar por un bitmap real del isologo, mismo
// mecanismo que el logo del tenant, ver printbox/README.md).
String comarposFooterEscPos() {
  String s;
  s += "\x1B\x61\x01";     // centrado
  s += escPrintMode(true, false, false); // bold, tamano normal
  s += "ComarPOS | www.comarpos.com\n";
  s += escPrintMode(false, false, false);
  return s;
}

// QR nativo ESC/POS (comando GS-paren-k, modelo 2) -- la impresora lo genera y
// renderiza ella misma, no hace falta armar el bitmap en el ESP32. Solo se
// llama cuando la venta esta facturada de verdad por AFIP (doc["invoice"]
// presente, ver ticket.service.ts).
void printQrCode(const String &data) {
  size_t len = data.length();
  if (len == 0 || len > 999) return;

  uint8_t selectModel[] = {0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00};
  sendChunked(selectModel, sizeof(selectModel));

  uint8_t setSize[] = {0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x05}; // modulo tamano 5
  sendChunked(setSize, sizeof(setSize));

  uint8_t setEcc[] = {0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31}; // correccion nivel M
  sendChunked(setEcc, sizeof(setEcc));

  size_t storeLen = len + 3;
  uint8_t storeHeader[] = {
    0x1D, 0x28, 0x6B,
    (uint8_t)(storeLen & 0xFF), (uint8_t)((storeLen >> 8) & 0xFF),
    0x31, 0x50, 0x30
  };
  sendChunked(storeHeader, sizeof(storeHeader));
  sendChunked((const uint8_t*)data.c_str(), len);

  uint8_t printQr[] = {0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30};
  sendChunked(printQr, sizeof(printQr));
}

// NOTA: la causa real de los bytes corruptos en tickets reales (letras
// comidas, caracteres sueltos random) resulto ser un bug conocido de
// ESP32+W5500: SPI.transfer(buf, len) en bloque esta rota en el driver SPI
// de ESP32 -- ver platformio.ini (extra_scripts) y
// patch_ethernet_esp32_fixes.py (parchea la libreria Ethernet para forzar
// byte-a-byte en vez de la variante de bloque). Todo lo de acá abajo
// (conexion persistente, pacing mas lento en sendChunked) se escribio
// ANTES de encontrar esa causa real, como mitigaciones de
// timing que no la resolvian del todo -- se dejan igual como margen
// extra, no hacen daño, pero el fix real es el del patch de la libreria.
unsigned long lastPrinterRetryAt = 0;

// Reconecta a la impresora solo si hace falta (si printTicketFromPayload ya
// cerro la conexion al terminar el ticket anterior, ver el
// printerClient.stop() ahi -- la TP450S necesita el cierre de socket para
// disparar el corte, asi que ya NO se mantiene una conexion persistente
// entre tickets). La pausa post-conexion de abajo sigue evitando la
// ventana de "recien conectada, todavia no lista" que corrompia los
// primeros bytes (ver nota arriba sobre la causa de fondo).
void ensurePrinterConnected() {
  if (cfg.printerIp == IPAddress((uint32_t)0)) return;
  if (printerClient.connected()) return;
  if (millis() - lastPrinterRetryAt < 5000) return; // no reintentar mas de una vez cada 5s
  lastPrinterRetryAt = millis();

  Serial.println("Conectando a la impresora...");
  if (printerClient.connect(cfg.printerIp, 9100)) {
    Serial.println("Impresora conectada.");
    delay(300);
  } else {
    Serial.println("No se pudo conectar a la impresora.");
  }
}

bool printTicketFromPayload(JsonDocument &doc) {
  if (cfg.printerIp == IPAddress((uint32_t)0)) {
    Serial.println("No hay IP de impresora configurada.");
    return false;
  }

  ensurePrinterConnected();
  if (!printerClient.connected()) {
    Serial.println("ERROR: impresora no conectada.");
    return false;
  }

  JsonObject invoice = doc["invoice"].as<JsonObject>();
  bool isInvoiced = !invoice.isNull();

 String init;

init += "\x1B\x40";
init += escPrintMode(false, false, false);
init += "\x1B\x61\x01";

bool ok = sendChunked(
  (const uint8_t*)init.c_str(),
  init.length(),
  64,
  5
);

#if PRINTBOX_PRINT_TENANT_LOGO

  if (ok) {

    const char* logoEscposUrl =
      doc["business"]["logoEscposUrl"] | "";

    if (
      strlen(logoEscposUrl) &&
      ensureTenantLogoCached(String(logoEscposUrl))
    ) {

      File logoCheck =
        LittleFS.open("/logo.bin", "r");

      if (logoCheck) {

        Serial.println(
          "Imprimiendo /logo.bin, tamano en cache: " +
          String(logoCheck.size()) +
          " bytes"
        );

        logoCheck.close();
      }

      if (!printCachedFile("/logo.bin")) {

  Serial.println(
    "ERROR: no se pudo imprimir el logo."
  );

} else {
  delay(500);
}
    }
  }

#endif

  String t;

  // ---- Encabezado: letra+numero de factura si esta facturada, o el
  // aviso de "no fiscal" si no -- nunca los dos.
  t += "\x1B\x61\x01"; // centrado
  if (isInvoiced) {
    t += escPrintMode(true, true, true); // bold + doble alto + doble ancho, solo para la letra
    t += String((const char*)(invoice["letra"] | "")) + "\n";
    t += escPrintMode(false, false, false);
    t += "Factura " + String((const char*)(invoice["letra"] | "")) + "-" + String((const char*)(invoice["numero"] | "")) + "\n";
  } else {
    t += escPrintMode(true, false, false);
    t += "COMPROBANTE NO FISCAL\n";
    t += escPrintMode(false, false, false);
  }
  // utf8ToAscii() acá tambien -- el formato de fecha en es-AR mete un
  // espacio angosto especial (U+202F, 3 bytes en UTF-8) entre "p." y "m."
  // de "p. m.", y esos bytes crudos sin convertir eran justo el glifo
  // random (tipo caracter chino) que aparecia siempre pegado a la hora en
  // los tickets reales -- este campo se habia quedado afuera de la
  // conversion que ya se le aplica a todo el resto del texto.
  t += "Fecha: " + utf8ToAscii(String((const char*)(doc["createdAt"] | ""))) + "\n";
  t += "------------------------------------------\n";

  // ---- Datos del negocio.
  t += escPrintMode(true, false, false);
  t += utf8ToAscii(String((const char*)(doc["business"]["name"] | ""))) + "\n";
  t += escPrintMode(false, false, false);

  const char* address = doc["business"]["address"] | "";
  if (strlen(address)) t += utf8ToAscii(String(address)) + "\n";
  const char* ivaCondition = doc["business"]["ivaCondition"] | "";
  if (strlen(ivaCondition)) t += utf8ToAscii(String(ivaCondition)) + "\n";
  const char* cuit = doc["business"]["cuit"] | "";
  if (strlen(cuit)) t += "CUIT: " + String(cuit) + "\n";
  const char* iibb = doc["business"]["iibb"] | "";
  if (strlen(iibb)) t += "Ingresos Brutos: " + String(iibb) + "\n";
  const char* activityStart = doc["business"]["activityStart"] | "";
  if (strlen(activityStart)) t += "Inicio de actividades: " + String(activityStart) + "\n";
  const char* phone = doc["business"]["phone"] | "";
  if (strlen(phone)) t += "Tel: " + String(phone) + "\n";
  t += "------------------------------------------\n";

  // ---- Cliente: "CONSUMIDOR FINAL" solo si la venta no tiene un cliente
  // asociado -- client.name ya viene resuelto asi desde ticket.service.ts
  // (getNombreCliente).
  t += "\x1B\x61\x00"; // izquierda
  t += utf8ToAscii(String((const char*)(doc["client"]["name"] | "CONSUMIDOR FINAL"))) + "\n";
  t += String((const char*)(doc["saleId"] | "")) + "\n";
  const char* seller = doc["sellerName"] | "";
  if (strlen(seller)) t += "Cajero: " + utf8ToAscii(String(seller)) + "\n";
  t += "------------------------------------------\n";

  for (JsonObject item : doc["items"].as<JsonArray>()) {
    String name = utf8ToAscii(String((const char*)(item["name"] | "Producto")));
    float subtotalItem = item["subtotal"] | 0.0f;

    // Productos vendidos por peso mandan quantityKg ademas de quantity
    // (quantity ahi es un Int que no representa el peso real, ver
    // SaleItem.quantity/quantityKg en schema.prisma) -- si esta presente
    // hay que mostrar ESE valor con decimales, no el entero.
    String qtyStr;
    if (!item["quantityKg"].isNull()) {
      float kg = item["quantityKg"] | 0.0f;
      qtyStr = formatMoneyAR(kg, 3) + " kg";
    } else {
      long qty = item["quantity"] | 0;
      qtyStr = String(qty);
    }

    t += qtyStr + " x " + name + "  $" + formatMoneyAR(subtotalItem, 2) + "\n";
  }

  t += "------------------------------------------\n";

  // ---- Subtotal sin IVA + IVA por alicuota (siempre, facturado o no --
  // pedido explicito: el ticket tiene que mostrar el IVA igual).
  t += "Subtotal (sin IVA): $" + formatMoneyAR(doc["netoSum"] | 0.0f, 2) + "\n";
  for (JsonObject ivaEntry : doc["ivaBreakdown"].as<JsonArray>()) {
    float rate = ivaEntry["rate"] | 0.0f;
    float amount = ivaEntry["amount"] | 0.0f;
    String rateStr = String(rate, 1);
    rateStr.replace(".", ",");
    t += "IVA " + rateStr + "%: $" + formatMoneyAR(amount, 2) + "\n";
  }

  float discount = doc["discount"] | 0.0f;
  if (discount > 0.01f) {
    t += "Descuento: -$" + formatMoneyAR(discount, 2) + "\n";
  }

  t += escPrintMode(true, false, false);
  t += "TOTAL: $" + formatMoneyAR(doc["total"] | 0.0f, 2) + "\n";
  t += escPrintMode(false, false, false);
  t += "------------------------------------------\n";
  t += "Pago: " + utf8ToAscii(String((const char*)(doc["paymentMethod"] | ""))) + "\n";

  if (isInvoiced) {
    t += "CAE: " + String((const char*)(invoice["cae"] | "")) + "\n";
  }

  t += "\x1B\x61\x01";
  t += "\n";
  const char* footer = doc["footer"] | "Gracias por su compra!";
  t += utf8ToAscii(String(footer)) + "\n";
  t += "\n";

  // Chunks mas chicos y mas separados (32/60, igual que footerBrand mas
  // abajo) -- el valor anterior de esta llamada (128/5) contradecia el
  // comentario que tenia al lado (decia "mas chicos y mas separados que
  // antes (era 64/40)" pero en realidad dejaba chunks MAS GRANDES y con
  // MENOS delay que el 64/40 con el que comparaba) y coincide exacto con
  // el sintoma reportado en un ticket real: se comia la primera letra de
  // alguna palabra (ej. "Consumidor Final" salio "onsumidor Final").
 ok = ok && sendChunked(
  (const uint8_t*)t.c_str(),
  t.length(),
  32,
  60
);

  // QR nativo, solo si esta facturada de verdad (nunca en un ticket no
  // fiscal -- pedido explicito).
  if (ok && isInvoiced) {
    const char* qrUrl = invoice["qrUrl"] | "";
    if (strlen(qrUrl)) {
      printQrCode(String(qrUrl));
      sendChunked((const uint8_t*)"\n", 1);
    }
  }

  // Marca ComarPOS: lo ultimo que se ve antes del corte, pase lo que pase
  // con el logo del tenant (que ya se intento arriba de todo, al
  // principio -- falla no-fatal si no hay logo o la descarga no anduvo).
  if (ok) {
    String footerBrand = comarposFooterEscPos();
    footerBrand += "\x1B\x64\x08"; // feed -- mas margen que antes (era 5) para que la
                                    // cuchilla tenga papel de sobra debajo del ultimo
                                    // texto impreso
    // GS V 66 n (forma de 2 parametros, "feed n lineas y corte total") en
    // vez de la forma vieja de 1 parametro "GS V 0" -- la TP450S (clon
    // ESC/POS) no reconoce esa forma vieja y se queda esperando el
    // segundo byte que nunca llega, asi que nunca corta.
    footerBrand += "\x1D\x56\x42\x00"; // corte total
    // "Empujon" post-corte: en la TP450S el corte queda en cola y recien
    // se ejecuta cuando le llega el SIGUIENTE byte de datos (bug de
    // firmware de la placa clon, procesa el comando N al recibir el N+1)
    // -- sin esto, el corte de este ticket se disparaba con el primer
    // byte del ticket SIGUIENTE, es decir, literal "al principio" del que
    // sigue en vez de al final del actual. Un ESC @ (re-init, no imprime
    // nada visible) alcanza para que lo ejecute ya, en este mismo job.
    footerBrand += "\x1B\x40";
    ok = sendChunked((const uint8_t*)footerBrand.c_str(), footerBrand.length(), 32, 60);
  }

  if (ok) {
    // Tiempo real de impresion antes de responderle al backend.
    delay(1500);
  }

  // Cerramos la conexion por ticket (no se mantiene persistente entre
  // tickets) y le damos un respiro antes de que ensurePrinterConnected()
  // pueda reabrir para el proximo -- si reconectamos demasiado rapido, la
  // placa puede llegar a tratar la reconexion como continuacion del mismo
  // job en vez de uno nuevo.
  printerClient.stop();
  delay(500);

  // El throttle de ensurePrinterConnected() (maximo un intento cada 5s) es
  // para no clavar reintentos en loop() cuando la impresora esta
  // desconectada/apagada de verdad -- pero lastPrinterRetryAt ya quedo
  // seteado desde que ESTE ticket se conecto, hace unos segundos. Sin este
  // reset, el PROXIMO ticket (por ejemplo imprimiendo varios seguidos, ver
  // printBootTestTickets()) se encontraba con "printerClient no
  // conectada" y directamente no llegaba a imprimir nada -- el throttle
  // bloqueaba la reconexion que nosotros mismos acabamos de forzar con el
  // stop() de arriba.
  lastPrinterRetryAt = 0;

  return ok;
}

#if PRINTBOX_TEST_PRINT_ON_BOOT

// Arma a mano un payload con la MISMA forma que manda ticket.service.ts
// (ver buildTicketPayload en el backend) para poder probar el formato real
// sin depender de una venta ni del backend estar levantado. business.cuit
// y el CAE son todo ceros/de relleno a proposito, para que no se pueda
// confundir con un comprobante fiscal de verdad.
void buildTestTicketPayload(
  JsonDocument &doc,
  const char* letra,        // "A", "B", "C" o "" (no fiscal)
  const char* numero,
  const char* clientName,
  const char* sellerName,
  const char* paymentMethod
) {
  doc.clear();

  bool invoiced = strlen(letra) > 0;

  doc["saleId"] = "TICKET-TEST-" + String(letra) + String(random(1000, 9999));
  doc["createdAt"] = "15/08/2026, 12:00";
  doc["paymentMethod"] = String(paymentMethod);
  doc["sellerName"] = String(sellerName);

  doc["business"]["name"] = "PRINTBOX - TICKET DE PRUEBA";
  doc["business"]["address"] = "Autotest de boot -- no es una venta real";
  doc["business"]["ivaCondition"] = "IVA Responsable Inscripto";
  doc["business"]["cuit"] = "00-00000000-0";
  doc["business"]["iibb"] = "";
  doc["business"]["activityStart"] = "";
  doc["business"]["phone"] = "";
  // Sin logoEscposUrl a proposito: este test no depende de que el backend
  // este levantado, asi que se salta el logo (ver strlen() check mas
  // arriba en printTicketFromPayload).

  doc["client"]["name"] = String(clientName);

  JsonArray items = doc["items"].to<JsonArray>();

  JsonObject item1 = items.add<JsonObject>();
  item1["name"] = "Coca-Cola 1.5L";
  item1["quantity"] = 3;
  item1["subtotal"] = 9450.0;

  JsonObject item2 = items.add<JsonObject>();
  item2["name"] = "Alfajor Jorgito Triple";
  item2["quantity"] = 10;
  item2["subtotal"] = 8500.0;

  // Un item por peso en el mismo ticket de prueba, para poder chequear de
  // una el formato "0,750 kg x ..." contra la impresora real (ver
  // quantityKg en el loop de items de printTicketFromPayload).
  JsonObject item3 = items.add<JsonObject>();
  item3["name"] = "Jamon Cocido x Kg";
  item3["quantity"] = 1;
  item3["quantityKg"] = 0.750;
  item3["subtotal"] = 7350.0;

  float netoSum = 25300.0 / 1.21;
  float ivaAmount = 25300.0 - netoSum;

  doc["netoSum"] = netoSum;
  JsonArray ivaBreakdown = doc["ivaBreakdown"].to<JsonArray>();
  JsonObject ivaEntry = ivaBreakdown.add<JsonObject>();
  ivaEntry["rate"] = 21.0;
  ivaEntry["amount"] = ivaAmount;

  doc["discount"] = 0.0;
  doc["total"] = 25300.0;

  if (invoiced) {
    doc["invoice"]["letra"] = String(letra);
    doc["invoice"]["numero"] = String(numero);
    doc["invoice"]["cae"] = "00000000000000";
    doc["invoice"]["qrUrl"] = "https://comarpos.com.ar/test-ticket";
    doc["footer"] = "Gracias por su compra";
  } else {
    doc["footer"] = "Comprobante no valido como factura";
  }
}

// Se llama una unica vez, apenas el device queda READY (ver loop()) --
// imprime Factura A, B, C y un comprobante no fiscal, uno atras del otro,
// para poder chequear formato + corte de una sin hacer 4 ventas de prueba
// a mano desde el POS.
void printBootTestTickets() {
  Serial.println("================================");
  Serial.println("TEST DE BOOT: imprimiendo 4 tickets de prueba");
  Serial.println("(A, B, C y no fiscal -- PRINTBOX_TEST_PRINT_ON_BOOT)");
  Serial.println("================================");

  JsonDocument doc;

  buildTestTicketPayload(doc, "A", "0001-00000001", "Cliente de Prueba A", "Cajero Test", "TARJETA: 25.300,00");
  printTicketFromPayload(doc);

  buildTestTicketPayload(doc, "B", "0001-00000002", "Cliente de Prueba B", "Cajero Test", "EFECTIVO: 25.300,00");
  printTicketFromPayload(doc);

  buildTestTicketPayload(doc, "C", "0001-00000003", "Cliente de Prueba C", "Cajero Test", "MERCADOPAGO: 25.300,00");
  printTicketFromPayload(doc);

  buildTestTicketPayload(doc, "", "", "Consumidor Final", "Cajero Test", "EFECTIVO: 25.300,00");
  printTicketFromPayload(doc);

  Serial.println("TEST DE BOOT: listo.");
}

#endif

// ================= DIAGNOSTICO SPI CRUDO DEL W5500 =================
// Ethernet.hardwareStatus() a veces dice "no hardware" por cosas de la
// libreria (constructor W5x00lwIP vs Ethernet clasica, timing interno,
// etc.) sin que eso signifique necesariamente que no hay nada conectado.
// Esto lee directo, a mano, el registro VERSIONR (0x0039, banco de
// registros comunes, modo variable-length -- ver datasheet W5500 seccion
// "SPI Frame") -- si el chip esta ahi y responde, tiene que devolver
// exactamente 0x04, sin pasar por la libreria Ethernet en absoluto. Un SPI
// a 1MHz (mas lento que el que usa la libreria despues) para descartar
// problemas de integridad de senal en cables largos como causa aparte.
uint8_t readW5500VersionRegisterRaw() {
  pinMode(W5500_CS, OUTPUT);
  digitalWrite(W5500_CS, HIGH);
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE0));
  digitalWrite(W5500_CS, LOW);
  SPI.transfer(0x00); // address high byte
  SPI.transfer(0x39); // address low byte (VERSIONR)
  SPI.transfer(0x00); // control byte: banco comun, lectura, modo variable
  uint8_t version = SPI.transfer(0x00); // dummy write para clockear el read
  digitalWrite(W5500_CS, HIGH);
  SPI.endTransaction();
  return version;
}

// Escanea el bus I2C completo (direcciones 1-126) y lista que responde --
// diagnostico puro, no depende de que el driver del OLED (SSD1306/SH1106)
// este bien elegido ni de nada de Adafruit_GFX. Sirve para descartar de
// una si el problema es la direccion/el wiring (nada responde, o responde
// en una direccion distinta a OLED_ADDR) o si es otra cosa (si aparece
// justo en 0x3C pero la pantalla sigue en blanco con los dos drivers
// probados, el problema esta en otro lado -- RES flotante, contraste,
// modulo distinto de lo esperado, etc.).
void scanI2CBus() {
  Serial.println("Escaneando bus I2C...");
  int found = 0;

  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    uint8_t err = Wire.endTransmission();

    if (err == 0) {
      Serial.println("  Responde en 0x" + String(addr, HEX));
      found++;
    }
  }

  if (found == 0) {
    Serial.println("  Nada respondio en el bus -- revisar SDA/SCL/VCC/GND del OLED.");
  } else {
    Serial.println("Fin del escaneo I2C (" + String(found) + " dispositivo(s)).");
  }
}

// ================= SETUP / LOOP =================
void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println("================================");
  Serial.println("PrintBox — boot");
  Serial.println("================================");

  pinMode(FACTORY_RESET_PIN, INPUT_PULLUP);

  pinMode(LED_RED_PIN, OUTPUT);
  pinMode(LED_BLUE_PIN, OUTPUT);
  pinMode(LED_GREEN_PIN, OUTPUT);
  digitalWrite(LED_RED_PIN, LOW);
  digitalWrite(LED_BLUE_PIN, LOW);
  digitalWrite(LED_GREEN_PIN, LOW);

  Wire.begin(OLED_SDA, OLED_SCL);
  scanI2CBus();
#if PRINTBOX_OLED_DRIVER_SH1106
  oledOk = oled.begin(OLED_ADDR, true);
#else
  oledOk = oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
#endif
  if (!oledOk) {
    Serial.println("OLED no respondió en " + String(OLED_ADDR, HEX) + " (revisar wiring/dirección I2C).");
  } else {
    // Prueba binaria: pantalla entera blanca, sin texto ni cursor de por
    // medio -- si esto no se ve, el problema es electrico/de hardware
    // (RES flotante, modo de alimentacion del panel, modulo defectuoso),
    // no de fuente/texto/logica de dibujo.
    Serial.println("Test OLED: pantalla completa blanca por 3s...");
    oled.clearDisplay();
    oled.fillScreen(OLED_WHITE);
    oled.display();
    delay(3000);
    oled.clearDisplay();
    oled.display();
  }
  showStatus(DeviceStatus::BOOTING, "");

  if (!LittleFS.begin(true)) {
    Serial.println("LittleFS no pudo montar (se formateó e igual falló) -- logo de tenant sin cache.");
  }

  byte mac[6];
  deriveMac(mac);

  SPI.begin(W5500_SCK, W5500_MISO, W5500_MOSI, W5500_CS);

  // Chequeo de hardware puro (no depende de la libreria Ethernet, que
  // recien inicializa el chip de verdad adentro de Ethernet.begin() --
  // llamar Ethernet.hardwareStatus()/linkStatus() antes de eso da falso
  // negativo aunque el chip este perfecto, porque nunca se corrio su
  // deteccion interna). Ver readW5500VersionRegisterRaw().
  uint8_t rawVersion = readW5500VersionRegisterRaw();
  Serial.print("W5500 VERSIONR crudo (esperado 0x04): 0x");
  Serial.println(rawVersion, HEX);
  if (rawVersion != 0x04) {
    Serial.println("  -> no coincide: o no hay nada respondiendo (0x00/0xFF fijo) o hay ruido/linea flotante (valor que cambia entre reinicios).");
  }

  Ethernet.init(W5500_CS);

  Serial.print("HardwareId: ");
  Serial.println(getHardwareId());

  // wifiClientSecure se comparte entre apiClient (modo produccion) y
  // downloadToLittleFs (logo del tenant, siempre) -- setInsecure() una sola
  // vez acá alcanza para los dos usos. Ver el TODO en downloadToLittleFs
  // sobre reemplazar esto por una CA real pinneada.
  wifiClientSecure.setInsecure();

  bool configured = loadConfig(cfg);
  loadTicketCounters();

  if (!configured) {
    // AP propio del ESP32 para la config inicial: la IP del gateway del AP
    // (192.168.4.1, default del core ESP32) siempre es alcanzable desde el
    // celu apenas te conectas a esa red, sin depender de ningun DHCP
    // externo. El formulario ahi adentro carga el codigo de pairing, la IP
    // de la impresora, y el SSID/password de la WiFi real del local -- esa
    // ultima es la que el device usa para salir a internet, tanto durante
    // el pairing (ver pairWithBackend) como despues en operacion normal.
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAP(WIFI_AP_SSID, WIFI_AP_PASSWORD);
    IPAddress apIp = WiFi.softAPIP();
    wifiPairingServer.begin();

    showPairingScreen(apIp.toString());
  } else {
    Serial.println("Config cargada. tenantId=" + cfg.tenantId + " deviceId=" + cfg.deviceId);
    showStatus(DeviceStatus::CONNECTING, "WiFi...");

    WiFi.mode(WIFI_STA);
    WiFi.begin(cfg.wifiSsid.c_str(), cfg.wifiPassword.c_str());

    // Recien acá conocemos la IP de la impresora (viene del pairing), asi
    // que recien acá tiene sentido levantar el link Ethernet punto a punto
    // con ella -- antes de emparejar no hay nada del otro lado del cable
    // que sepamos direccionar.
    IPAddress printerLocalIp = deriveLocalIpForPrinter(cfg.printerIp);
    Ethernet.begin(mac, printerLocalIp, IPAddress(0, 0, 0, 0), IPAddress(0, 0, 0, 0), IPAddress(255, 255, 255, 0));
    Serial.println("IP local del ESP32 para el link con la impresora: " + printerLocalIp.toString());

    // Recien acá Ethernet.begin() corrio la deteccion real del chip
    // (w5100.init()) -- antes de esto hardwareStatus()/linkStatus() daban
    // falso negativo aunque el chip estuviera bien.
    if (Ethernet.hardwareStatus() == EthernetNoHardware) {
      Serial.println("Ethernet.begin() no reconoce el W5500 pese a responder al test crudo -- revisar version de la libreria Ethernet.");
    } else if (Ethernet.linkStatus() == LinkOFF) {
      Serial.println("W5500 OK pero el link esta OFF -- revisar que el cable a la impresora este bien conectado de los dos lados y que la impresora este prendida.");
    }

    // A diferencia del modo pairing, acá NO se levanta wifiPairingServer --
    // ya emparejado, el ESP32 no acepta conexiones entrantes para nada: la
    // impresion funciona por poll saliente (pollForPrintJob() en loop()),
    // ver "POLL DE IMPRESION" mas arriba.
  }
}

unsigned long lastWifiRetryAt = 0;

unsigned long factoryResetHeldSince = 0;

// Se llama en cada vuelta de loop(), pairing o no -- asi el boton sirve
// hasta para desatascar un device que quedo mal emparejado, no solo
// cuando ya esta operando normal. Hay que sostenerlo FACTORY_RESET_HOLD_MS
// (5s) seguidos para que dispare -- soltarlo antes cancela sin tocar
// nada. Es a proposito que no dispare al toque: es destructivo
// (desempareja el device) y este boton puede quedar accesible sin tapa en
// el gabinete.
//
// Feedback mientras se sostiene: los 3 LEDs parpadean juntos una vez por
// segundo -- 5 parpadeos = los 5 segundos que hay que aguantar, y el reset
// se dispara justo al completarse el 5to. Pisa lo que haya escrito
// updateStatusLeds() ese mismo ciclo (se llama antes, en loop()).
void checkFactoryResetButton() {
  bool pressed = (digitalRead(FACTORY_RESET_PIN) == LOW);

  if (!pressed) {
    factoryResetHeldSince = 0;
    return;
  }

  if (factoryResetHeldSince == 0) {
    factoryResetHeldSince = millis();
    return;
  }

  unsigned long heldFor = millis() - factoryResetHeldSince;

  if (heldFor >= FACTORY_RESET_HOLD_MS) {
    factoryResetWifiConfig(); // no vuelve -- termina en ESP.restart()
    return;
  }

  bool ledOn = (heldFor % 1000) < 500; // medio segundo prendido / medio apagado, por cada parpadeo
  digitalWrite(LED_RED_PIN, ledOn ? HIGH : LOW);
  digitalWrite(LED_BLUE_PIN, ledOn ? HIGH : LOW);
  digitalWrite(LED_GREEN_PIN, ledOn ? HIGH : LOW);

  if (oledOk) {
    unsigned long remainingSec = (FACTORY_RESET_HOLD_MS - heldFor) / 1000 + 1;
    oled.clearDisplay();
    oled.setTextSize(1);
    oled.setTextColor(OLED_WHITE);
    oled.setCursor(0, 0);
    oled.println("Reset de fabrica");
    oled.drawLine(0, 10, OLED_WIDTH, 10, OLED_WHITE);
    oled.setCursor(0, 20);
    oled.setTextSize(2);
    oled.println(String(remainingSec) + "s");
    oled.setTextSize(1);
    oled.setCursor(0, 50);
    oled.println("Soltar para cancelar");
    oled.display();
  }
}

void ensureWifiConnected() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (millis() - lastWifiRetryAt < 5000) return; // no reintentar mas de una vez cada 5s
  lastWifiRetryAt = millis();
  Serial.println("WiFi caído, reconectando a \"" + cfg.wifiSsid + "\"...");
  WiFi.begin(cfg.wifiSsid.c_str(), cfg.wifiPassword.c_str());
}

unsigned long lastHeartbeatAt = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 60000;

// Aviso periodico "estoy vivo, esta es mi IP actual" -- el backend guarda
// deviceIp a partir de req.ip de esta misma request (no de nada que
// mandemos en el body), asi que alcanza con pegarle al endpoint. Sirve
// sobre todo para el caso de que el DHCP local le cambie la IP al ESP32
// despues del pairing. Firmado con HMAC (ver seccion "SEGURIDAD" mas
// arriba) en vez de mandar el token plano -- si el NTP todavia no
// sincronizo, el timestamp va a estar mal y el backend lo va a rechazar
// por "fuera de rango", pero se autocorrige solo en el proximo intento
// (60s despues) una vez que ensureNtpSynced() consiga sincronizar.
void sendHeartbeat() {
  if (millis() - lastHeartbeatAt < HEARTBEAT_INTERVAL_MS) return;
  lastHeartbeatAt = millis();

  ensureNtpSynced();

  if (!apiClient.connect(API_HOST, API_PORT)) {
    Serial.println("Heartbeat: no se pudo conectar al backend.");
    return;
  }

  String path = "/printbox/devices/" + cfg.deviceId + "/heartbeat";
  String timestamp = currentTimestampSec();
  String signature = signRequest(cfg.token, "POST", path, timestamp, "");

  apiClient.print(String("POST ") + path + " HTTP/1.1\r\n");
  apiClient.print(String("Host: ") + API_HOST + "\r\n");
  apiClient.print("X-Pos-Timestamp: " + timestamp + "\r\n");
  apiClient.print("X-Pos-Signature: " + signature + "\r\n");
  apiClient.print("Content-Length: 0\r\n");
  apiClient.print("Connection: close\r\n\r\n");

  unsigned long start = millis();
  while (apiClient.connected() && millis() - start < 5000) {
    if (apiClient.available()) apiClient.read(); // descartamos la respuesta, solo nos importa que salio
  }
  apiClient.stop();
}

bool wasReady = false;

void loop() {
  updateStatusLeds();         // primero -- checkFactoryResetButton() lo pisa si el boton esta sostenido
  checkFactoryResetButton();  // antes que nada mas -- tiene que andar este device este emparejado o no

  if (!cfg.valid) {
    handleWifiPairingServer();
    return;
  }

  ensureWifiConnected();
  if (WiFi.status() != WL_CONNECTED) {
    wasReady = false;
    showStatus(DeviceStatus::CONNECTING, "WiFi...");
    delay(200);
    return;
  }

  if (!wasReady) {
    wasReady = true;
    showStatus(DeviceStatus::READY, cfg.tenantId);
    ensureNtpSynced(); // intentar temprano, antes de que llegue el primer ticket
  }

  // Se mantiene conectada de antemano (no solo cuando llega un ticket) --
  // asi el "recien conectado, todavia no lista" pasa acá en background,
  // nunca demorando/arriesgando un ticket real. No-op si ya esta conectada
  // o si no hay IP de impresora configurada.
  ensurePrinterConnected();

#if PRINTBOX_TEST_PRINT_ON_BOOT
  static bool testTicketsPrinted = false;
  if (!testTicketsPrinted && printerClient.connected()) {
    testTicketsPrinted = true; // una sola vez por boot, sin importar si algun ticket fallo
    printBootTestTickets();
  }
#endif

  sendHeartbeat();
  pollForPrintJob();
}
