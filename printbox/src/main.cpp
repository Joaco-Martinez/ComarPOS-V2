#include <Arduino.h>
#include <SPI.h>
#include <Wire.h>
#include <Ethernet.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <SSLClient.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#include "trust_anchors.h"

// ================= OLED (SSD1306 128x64, I2C) =================
// TODO: confirmar estos pines contra el wiring real -- son los tipicos de
// un ESP32-S3 devkit, no vinieron de un datasheet especifico de esta placa.
#define OLED_SDA 8
#define OLED_SCL 9
#define OLED_WIDTH 128
#define OLED_HEIGHT 64
#define OLED_ADDR 0x3C

Adafruit_SSD1306 oled(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);
bool oledOk = false;

enum class DeviceStatus { BOOTING, PAIRING, CONNECTING, READY, PRINTING, ERROR_ };

void showStatus(DeviceStatus status, const String &detail = "") {
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
  oled.setTextColor(SSD1306_WHITE);
  oled.setCursor(0, 0);
  oled.println("ComarPOS PrintBox");
  oled.drawLine(0, 10, OLED_WIDTH, 10, SSD1306_WHITE);
  oled.setCursor(0, 18);
  oled.setTextSize(2);
  oled.println(title);
  oled.setTextSize(1);
  oled.setCursor(0, 42);
  oled.println(detail);
  oled.display();
}

// ================= W5500 =================
#define W5500_CS    10
#define W5500_SCK   12
#define W5500_MISO  13
#define W5500_MOSI  11

// ================= BACKEND CENTRAL =================
// Fijo de fabrica, igual para todos los printbox. El tenant se resuelve en
// el backend a partir del pairingCode, no hace falta un host por negocio
// (ver la nota de arquitectura: nada de print.<negocio>.comarpos.com.ar).
static const char* API_HOST = "api.comarpos.com.ar"; // TODO: confirmar dominio real de prod
static const uint16_t API_PORT = 443;
static const char* API_PAIR_PATH = "/printbox/pair";

// ================= ESTADO / CONFIG =================
struct DeviceConfig {
  String tenantId;
  String deviceId;
  String mqttHost;
  uint16_t mqttPort = 8883;
  String mqttUsername;
  String mqttPassword;
  String jobsTopic;
  String ackTopic;
  IPAddress printerIp;
  bool valid = false;
};

Preferences prefs;
DeviceConfig cfg;

EthernetClient netClient;
SSLClient sslClient(netClient, TAs, (size_t)TAs_NUM, A0);
PubSubClient mqtt(sslClient);
EthernetServer pairingServer(80);

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

// ================= PREFERENCES (NVS) =================
bool loadConfig(DeviceConfig &c) {
  prefs.begin("printbox", true);
  bool valid = prefs.getBool("valid", false);

  if (valid) {
    c.tenantId = prefs.getString("tenantId");
    c.deviceId = prefs.getString("deviceId");
    c.mqttHost = prefs.getString("mqttHost");
    c.mqttPort = prefs.getUShort("mqttPort", 8883);
    c.mqttUsername = prefs.getString("mqttUser");
    c.mqttPassword = prefs.getString("mqttPass");
    c.jobsTopic = prefs.getString("jobsTopic");
    c.ackTopic = prefs.getString("ackTopic");
    c.printerIp = IPAddress(prefs.getUInt("printerIp", 0));
    c.valid = true;
  }

  prefs.end();
  return valid;
}

void saveConfig(const DeviceConfig &c) {
  prefs.begin("printbox", false);
  prefs.putBool("valid", true);
  prefs.putString("tenantId", c.tenantId);
  prefs.putString("deviceId", c.deviceId);
  prefs.putString("mqttHost", c.mqttHost);
  prefs.putUShort("mqttPort", c.mqttPort);
  prefs.putString("mqttUser", c.mqttUsername);
  prefs.putString("mqttPass", c.mqttPassword);
  prefs.putString("jobsTopic", c.jobsTopic);
  prefs.putString("ackTopic", c.ackTopic);
  prefs.putUInt("printerIp", (uint32_t)c.printerIp);
  prefs.end();
}

// ================= HTTP MINIMO (pairing local) =================
// No usamos una lib de WebServer completa a proposito: EthernetServer ya
// viene con la lib Ethernet y esto es un solo formulario. Si el pairing
// necesita mas de un endpoint en el futuro, ahi si vale la pena sumar
// EthernetWebServer.
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

void servePairingPage(EthernetClient &client) {
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: text/html; charset=utf-8");
  client.println("Connection: close");
  client.println();
  client.println("<!doctype html><html><body style='font-family:sans-serif;max-width:420px;margin:40px auto'>");
  client.println("<h2>Configurar PrintBox</h2>");
  client.println("<p>Pedile el código de pairing a quien lo esté dando de alta en el panel.</p>");
  client.println("<form method='POST' action='/pair'>");
  client.println("<label>Código de pairing</label><br>");
  client.println("<input name='code' maxlength='6' style='font-size:1.5em;width:100%;box-sizing:border-box'><br><br>");
  client.println("<label>IP de la impresora en esta red</label><br>");
  client.println("<input name='printerIp' placeholder='192.168.1.100' style='width:100%;box-sizing:border-box'><br><br>");
  client.println("<button type='submit' style='width:100%;padding:10px'>Emparejar</button>");
  client.println("</form></body></html>");
}

bool parseMqttUrl(const String &url, String &host, uint16_t &port) {
  // Espera algo como "mqtts://host:8883"
  int schemeEnd = url.indexOf("://");
  String rest = schemeEnd >= 0 ? url.substring(schemeEnd + 3) : url;
  int colon = rest.indexOf(':');
  if (colon < 0) return false;
  host = rest.substring(0, colon);
  port = rest.substring(colon + 1).toInt();
  return host.length() > 0 && port > 0;
}

bool pairWithBackend(const String &code, const IPAddress &printerIp) {
  Serial.println("Conectando al backend para hacer pairing...");

  if (!sslClient.connect(API_HOST, API_PORT)) {
    Serial.println("No se pudo conectar al backend (TLS).");
    return false;
  }

  JsonDocument reqDoc;
  reqDoc["pairingCode"] = code;
  reqDoc["hardwareId"] = getHardwareId();
  String body;
  serializeJson(reqDoc, body);

  sslClient.print(String("POST ") + API_PAIR_PATH + " HTTP/1.1\r\n");
  sslClient.print(String("Host: ") + API_HOST + "\r\n");
  sslClient.print("Content-Type: application/json\r\n");
  sslClient.print("Content-Length: " + String(body.length()) + "\r\n");
  sslClient.print("Connection: close\r\n\r\n");
  sslClient.print(body);

  // Descarta headers de la respuesta, nos quedamos con el body.
  unsigned long start = millis();
  String line;
  while (sslClient.connected() && millis() - start < 10000) {
    line = sslClient.readStringUntil('\n');
    if (line == "\r") break;
  }

  String responseBody;
  while (sslClient.connected() || sslClient.available()) {
    if (sslClient.available()) {
      responseBody += (char)sslClient.read();
    }
    if (millis() - start > 10000) break;
  }
  sslClient.stop();

  JsonDocument resDoc;
  DeserializationError err = deserializeJson(resDoc, responseBody);
  if (err || resDoc["ok"] != true) {
    Serial.println("Pairing rechazado por el backend: " + responseBody);
    return false;
  }

  cfg.tenantId = resDoc["tenantId"].as<String>();
  cfg.deviceId = resDoc["deviceId"].as<String>();
  cfg.mqttUsername = resDoc["mqttUsername"].as<String>();
  cfg.mqttPassword = resDoc["mqttPassword"].as<String>();
  cfg.jobsTopic = resDoc["jobsTopic"].as<String>();
  cfg.ackTopic = resDoc["ackTopic"].as<String>();

  String mqttUrl = resDoc["mqttUrl"].as<String>();
  if (!parseMqttUrl(mqttUrl, cfg.mqttHost, cfg.mqttPort)) {
    Serial.println("mqttUrl inesperada: " + mqttUrl);
    return false;
  }

  cfg.printerIp = printerIp;
  cfg.valid = true;

  saveConfig(cfg);
  Serial.println("Pairing OK. tenantId=" + cfg.tenantId + " deviceId=" + cfg.deviceId);
  return true;
}

void handlePairingServer() {
  EthernetClient client = pairingServer.available();
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
    IPAddress printerIp;
    printerIp.fromString(printerIpStr);

    bool ok = pairWithBackend(code, printerIp);

    client.println("HTTP/1.1 200 OK");
    client.println("Content-Type: text/html; charset=utf-8");
    client.println("Connection: close");
    client.println();

    if (ok) {
      client.println("<h3>Emparejado. Reiniciando...</h3>");
      client.stop();
      delay(500);
      ESP.restart();
      return;
    }

    client.println("<h3>Código inválido o expirado. Volvé atrás e intentá de nuevo.</h3>");
    showStatus(DeviceStatus::ERROR_, "Código inválido");
  } else {
    servePairingPage(client);
  }

  delay(1);
  client.stop();
}

// ================= MQTT =================
bool printTicketFromPayload(JsonDocument &doc);

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String json;
  json.reserve(length);
  for (unsigned int i = 0; i < length; i++) json += (char)payload[i];

  JsonDocument doc;
  if (deserializeJson(doc, json)) {
    Serial.println("Job MQTT con JSON invalido, lo descarto.");
    return;
  }

  String jobId = doc["jobId"].as<String>();
  Serial.println("Job recibido: " + jobId);

  showStatus(DeviceStatus::PRINTING, jobId);
  bool ok = printTicketFromPayload(doc);
  showStatus(ok ? DeviceStatus::READY : DeviceStatus::ERROR_, ok ? cfg.tenantId : "No se pudo imprimir");

  JsonDocument ack;
  ack["jobId"] = jobId;
  ack["ok"] = ok;
  String ackBody;
  serializeJson(ack, ackBody);
  mqtt.publish(cfg.ackTopic.c_str(), ackBody.c_str());
}

void ensureMqttConnected() {
  if (mqtt.connected()) return;

  mqtt.setServer(cfg.mqttHost.c_str(), cfg.mqttPort);
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(4096); // el default de PubSubClient (256) se queda corto con tickets de varios items

  String clientId = "printbox-" + cfg.deviceId;
  Serial.println("Conectando a MQTT (" + cfg.mqttHost + ")...");

  if (mqtt.connect(clientId.c_str(), cfg.mqttUsername.c_str(), cfg.mqttPassword.c_str())) {
    Serial.println("MQTT conectado, suscripto a " + cfg.jobsTopic);
    mqtt.subscribe(cfg.jobsTopic.c_str(), 1);
  } else {
    Serial.print("MQTT connect() fallo, rc=");
    Serial.println(mqtt.state());
    delay(2000);
  }
}

// ================= IMPRESION =================
bool sendChunked(const uint8_t* data, size_t len, int chunkSize, int delayMs) {
  size_t sent = 0;
  while (sent < len) {
    if (!netClient.connected()) {
      Serial.print("!! Conexion cortada durante el envio, offset: ");
      Serial.println(sent);
      return false;
    }

    size_t toSend = min((size_t)chunkSize, len - sent);
    size_t written = netClient.write(data + sent, toSend);

    if (written == 0) {
      delay(50);
      continue;
    }

    sent += written;
    delay(delayMs);
  }
  return true;
}

// ================= LOGO DEL TENANT (cacheado en LittleFS) =================
// El backend ya lo manda como bitmap ESC/POS listo (GS v 0), ver
// backend/src/services/printbox/logoRaster.service.ts -- acá solo lo
// bajamos una vez y lo reusamos mientras la URL no cambie (el backend la
// regenera si el tenant sube un logo nuevo).
bool downloadToLittleFs(const String &url, const char* destPath) {
  int schemeEnd = url.indexOf("://");
  String rest = schemeEnd >= 0 ? url.substring(schemeEnd + 3) : url;
  int pathStart = rest.indexOf('/');
  String host = pathStart >= 0 ? rest.substring(0, pathStart) : rest;
  String path = pathStart >= 0 ? rest.substring(pathStart) : "/";

  if (!sslClient.connect(host.c_str(), 443)) {
    Serial.println("No se pudo conectar para bajar " + url);
    return false;
  }

  sslClient.print("GET " + path + " HTTP/1.1\r\n");
  sslClient.print("Host: " + host + "\r\n");
  sslClient.print("Connection: close\r\n\r\n");

  unsigned long start = millis();
  int contentLength = -1;
  String line;
  while (sslClient.connected() && millis() - start < 10000) {
    line = sslClient.readStringUntil('\n');
    if (line.startsWith("Content-Length:")) contentLength = line.substring(16).toInt();
    if (line == "\r") break;
  }

  if (contentLength <= 0) {
    Serial.println("Sin Content-Length, aborto descarga de " + url);
    sslClient.stop();
    return false;
  }

  String tmpPath = String(destPath) + ".tmp";
  File f = LittleFS.open(tmpPath, "w");
  if (!f) {
    sslClient.stop();
    return false;
  }

  int received = 0;
  uint8_t buf[256];
  while (received < contentLength && millis() - start < 15000) {
    if (sslClient.available()) {
      int n = sslClient.read(buf, min((int)sizeof(buf), contentLength - received));
      if (n > 0) {
        f.write(buf, n);
        received += n;
      }
    }
  }
  f.close();
  sslClient.stop();

  if (received != contentLength) {
    Serial.println("Descarga incompleta de " + url);
    LittleFS.remove(tmpPath);
    return false;
  }

  LittleFS.remove(destPath);
  LittleFS.rename(tmpPath, destPath);
  return true;
}

bool ensureTenantLogoCached(const String &logoEscposUrl) {
  if (logoEscposUrl.length() == 0) return false;

  prefs.begin("printbox", true);
  String cachedUrl = prefs.getString("logoUrl", "");
  prefs.end();

  if (cachedUrl == logoEscposUrl && LittleFS.exists("/logo.bin")) {
    return true;
  }

  Serial.println("Logo del tenant nuevo/cambiado, descargando...");
  if (!downloadToLittleFs(logoEscposUrl, "/logo.bin")) return false;

  prefs.begin("printbox", false);
  prefs.putString("logoUrl", logoEscposUrl);
  prefs.end();
  return true;
}

bool printCachedFile(const char* path) {
  if (!LittleFS.exists(path)) return false;

  File f = LittleFS.open(path, "r");
  if (!f) return false;

  uint8_t buf[256];
  bool ok = true;
  while (f.available()) {
    int n = f.read(buf, sizeof(buf));
    if (n <= 0) break;
    if (!sendChunked(buf, n, 128, 5)) {
      ok = false;
      break;
    }
  }
  f.close();
  return ok;
}

// Texto de marca ComarPOS: horneado en el firmware, no depende de nada
// que mande el backend -- se imprime siempre, en todo tenant. (Upgrade
// futuro: reemplazar por un bitmap real del isologo, mismo mecanismo que
// el logo del tenant, ver printbox/README.md).
String comarposFooterEscPos() {
  String s;
  s += "\x1B\x61\x01";     // centrado
  s += "\x1D\x21\x11";     // doble ancho + doble alto
  s += "\x1B\x45\x01";     // bold on
  s += "ComarPOS\n";
  s += "\x1D\x21\x00";     // tamano normal
  s += "\x1B\x45\x00";     // bold off
  return s;
}

bool printTicketFromPayload(JsonDocument &doc) {
  if (cfg.printerIp == IPAddress((uint32_t)0)) {
    Serial.println("No hay IP de impresora configurada.");
    return false;
  }

  if (!netClient.connect(cfg.printerIp, 9100)) {
    Serial.println("ERROR conectando a la impresora.");
    return false;
  }

  String t;
  t += "\x1B\x40";
  t += "\x1B\x61\x01";
  t += "\x1B\x45\x01";
  t += String((const char*)(doc["business"]["name"] | "")) + "\n";
  const char* subtitle = doc["business"]["subtitle"] | "";
  if (strlen(subtitle)) t += String(subtitle) + "\n";
  t += "\x1B\x45\x00";

  const char* address = doc["business"]["address"] | "";
  if (strlen(address)) t += String(address) + "\n";
  const char* cuit = doc["business"]["cuit"] | "";
  if (strlen(cuit)) t += "CUIT: " + String(cuit) + "\n";
  const char* phone = doc["business"]["phone"] | "";
  if (strlen(phone)) t += "Tel: " + String(phone) + "\n";
  t += "-------------------------------\n";

  t += "\x1B\x61\x00";
  t += String((const char*)(doc["saleId"] | "")) + "\n";
  t += "Fecha: " + String((const char*)(doc["createdAt"] | "")) + "\n";
  const char* seller = doc["sellerName"] | "";
  if (strlen(seller)) t += "Cajero: " + String(seller) + "\n";
  t += "-------------------------------\n";

  for (JsonObject item : doc["items"].as<JsonArray>()) {
    float qty = item["quantity"] | 0.0f;
    String name = item["name"] | "Producto";
    float subtotalItem = item["subtotal"] | 0.0f;
    t += String(qty, 0) + " x " + name + "  $" + String(subtotalItem, 0) + "\n";
  }

  t += "-------------------------------\n";
  t += "\x1B\x45\x01";
  t += "TOTAL: $" + String((float)(doc["total"] | 0.0f), 0) + "\n";
  t += "\x1B\x45\x00";
  t += "-------------------------------\n";
  t += "Pago: " + String((const char*)(doc["paymentMethod"] | "")) + "\n";

  t += "\x1B\x61\x01";
  t += "\n";
  const char* footer = doc["footer"] | "Gracias por su compra!";
  t += String(footer) + "\n";
  t += "\n";

  bool ok = sendChunked((const uint8_t*)t.c_str(), t.length(), 64, 40);

  // Logo del tenant (si tiene uno cargado) primero, marca ComarPOS
  // garantizada después -- en ese orden, nunca al revés: la marca
  // ComarPOS es lo último que se ve antes del corte, pase lo que pase con
  // el logo del tenant (falla la descarga, tenant sin logo, etc).
  if (ok) {
    const char* logoEscposUrl = doc["business"]["logoEscposUrl"] | "";
    if (strlen(logoEscposUrl) && ensureTenantLogoCached(String(logoEscposUrl))) {
      printCachedFile("/logo.bin");
      sendChunked((const uint8_t*)"\n", 1);
    }
  }

  if (ok) {
    String footerBrand = comarposFooterEscPos();
    footerBrand += "\x1B\x64\x05"; // feed
    footerBrand += "\x1D\x56\x00"; // corte total
    ok = sendChunked((const uint8_t*)footerBrand.c_str(), footerBrand.length(), 64, 40);
  }

  if (ok) {
    delay(1500); // tiempo real de impresion antes de cerrar el socket
  }

  netClient.stop();
  return ok;
}

// ================= SETUP / LOOP =================
void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println("================================");
  Serial.println("PrintBox — boot");
  Serial.println("================================");

  Wire.begin(OLED_SDA, OLED_SCL);
  oledOk = oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  if (!oledOk) {
    Serial.println("OLED no respondió en " + String(OLED_ADDR, HEX) + " (revisar wiring/dirección I2C).");
  }
  showStatus(DeviceStatus::BOOTING, "");

  if (!LittleFS.begin(true)) {
    Serial.println("LittleFS no pudo montar (se formateó e igual falló) -- logo de tenant sin cache.");
  }

  byte mac[6];
  deriveMac(mac);

  SPI.begin(W5500_SCK, W5500_MISO, W5500_MOSI, W5500_CS);
  Ethernet.init(W5500_CS);

  if (Ethernet.begin(mac) == 0) {
    Serial.println("DHCP falló, uso IP fija de emergencia (192.168.1.50).");
    Ethernet.begin(mac, IPAddress(192, 168, 1, 50));
  }
  delay(1500);

  Serial.print("IP: ");
  Serial.println(Ethernet.localIP());
  Serial.print("HardwareId: ");
  Serial.println(getHardwareId());

  bool configured = loadConfig(cfg);

  if (!configured) {
    Serial.println("Sin emparejar. Entrá a http://" + Ethernet.localIP().toString() + "/ desde este mismo local para configurarlo.");
    showStatus(DeviceStatus::PAIRING, Ethernet.localIP().toString());
    pairingServer.begin();
  } else {
    Serial.println("Config cargada. tenantId=" + cfg.tenantId + " deviceId=" + cfg.deviceId);
    showStatus(DeviceStatus::CONNECTING, "MQTT...");
  }
}

void loop() {
  if (!cfg.valid) {
    handlePairingServer();
    return;
  }

  if (Ethernet.linkStatus() == LinkOFF) {
    showStatus(DeviceStatus::ERROR_, "Sin cable de red");
    delay(1000);
    return;
  }

  bool wasConnected = mqtt.connected();
  ensureMqttConnected();

  if (!wasConnected && mqtt.connected()) {
    showStatus(DeviceStatus::READY, cfg.tenantId);
  } else if (!mqtt.connected()) {
    showStatus(DeviceStatus::CONNECTING, "MQTT...");
  }

  mqtt.loop();
}
