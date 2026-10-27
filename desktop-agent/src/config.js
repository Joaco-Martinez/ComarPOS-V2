const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, safeStorage } = require('electron');

// Config local del agente -- vive en el userData de esta PC, nunca viaja al
// backend salvo el token que ya devuelve el pairing (ver api.js). No usamos
// electron-store para no sumar una dependencia mas por algo tan chico: es
// un JSON de 6 campos, leido/escrito entero cada vez (no hay concurrencia
// real, todo corre en el proceso main).
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

const DEFAULT_API_URL = 'https://api.comarpos.com';

// El token del dispositivo (con el que el backend firma/valida cada poll de
// impresion) se guarda cifrado con safeStorage (DPAPI en Windows, atado al
// usuario de Windows) en vez de en texto plano en config.json. Si safeStorage
// no esta disponible se guarda como antes, para no dejar de funcionar.
function canEncrypt() {
  try {
    return Boolean(safeStorage && safeStorage.isEncryptionAvailable());
  } catch {
    return false;
  }
}

function load() {
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }

  if (cfg.tokenEnc) {
    const { tokenEnc, ...rest } = cfg;
    try {
      if (canEncrypt()) return { ...rest, token: safeStorage.decryptString(Buffer.from(tokenEnc, 'base64')) };
    } catch {
      // token ilegible (otro usuario de Windows / perfil migrado): queda sin vincular
    }
    return rest;
  }

  return cfg;
}

function persist(cfg, keepTokenEnc) {
  const { token, ...rest } = cfg;
  let onDisk = cfg;
  if (token && canEncrypt()) {
    onDisk = { ...rest, tokenEnc: safeStorage.encryptString(token).toString('base64') };
  } else if (!token && keepTokenEnc) {
    onDisk = { ...rest, tokenEnc: keepTokenEnc };
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(onDisk, null, 2), 'utf8');
}

function readRawTokenEnc() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).tokenEnc;
  } catch {
    return undefined;
  }
}

function save(patch) {
  const current = load();
  const next = { ...current, ...patch };
  // Si el token cifrado no se pudo leer (safeStorage no disponible todavia),
  // no se pisa: se conserva tal cual estaba en disco.
  const keepTokenEnc = !current.token && !('token' in patch) ? readRawTokenEnc() : undefined;
  persist(next, keepTokenEnc);
  return next;
}

// hardwareId identifica esta instalacion frente al backend (equivalente al
// ID de chip que manda el ESP32) -- se genera una sola vez y se persiste;
// si se reinstala el agente sin borrar userData, sigue siendo el mismo
// "dispositivo" a ojos del backend.
function getOrCreateHardwareId() {
  const cfg = load();
  if (cfg.hardwareId) return cfg.hardwareId;
  const hardwareId = `desktop-${crypto.randomUUID()}`;
  save({ hardwareId });
  return hardwareId;
}

module.exports = {
  DEFAULT_API_URL,
  getConfig: load,
  setConfig: save,
  getOrCreateHardwareId,
  clearPairing() {
    const cfg = load();
    const { deviceId, token, deviceName, ...rest } = cfg;
    persist(rest);
  },
};
