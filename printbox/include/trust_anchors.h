#pragma once

// ⚠️ SIN COMPLETAR — placeholder, el firmware NO compila/conecta por TLS
// hasta que esto tenga certificados reales.
//
// SSLClient (la lib que envuelve EthernetClient con TLS, ver
// printbox/platformio.ini) necesita la cadena de confianza (root CA) de
// cada host al que se va a conectar por HTTPS/MQTTS, en este formato
// bearssl `br_x509_trust_anchor`. La propia librería trae un script para
// generarlo automático a partir de una lista de hosts:
//
//   1. Clonar/descargar SSLClient (repo de govorox u OPEnSLab-OSU) y correr
//      su script tools/certificates.py apuntando a:
//        - api.comarpos.com.ar        (pairing HTTPS)
//        - el host del broker MQTT    (MQTT_PUBLIC_URL, ver printbox/broker/README.md)
//   2. Eso genera un trust_anchors.h con el array TAs[] y TAs_NUM ya
//      completos — pisar este archivo con ese output.
//
// Mientras tanto, dejamos un array vacío para que el proyecto al menos
// compile.

#include <SSLClient.h>

static const br_x509_trust_anchor TAs[] = {};
static const size_t TAs_NUM = 0;
