const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

// Config local del agente -- vive en el userData de esta PC, nunca viaja al
// backend salvo el token que ya devuelve el pairing (ver api.js). No usamos
// electron-store para no sumar una dependencia mas por algo tan chico: es
// un JSON de 6 campos, leido/escrito entero cada vez (no hay concurrencia
// real, todo corre en el proceso main).
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

const DEFAULT_API_URL = 'https://api.comarpos.com';

function load() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function save(patch) {
  const current = load();
  const next = { ...current, ...patch };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
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
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(rest, null, 2), 'utf8');
  },
};
