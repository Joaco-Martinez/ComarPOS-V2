const path = require('path');
const { app, BrowserWindow, Tray, Menu, ipcMain, shell } = require('electron');
const config = require('./config');
const api = require('./api');
const printer = require('./printer');
const worker = require('./worker');
const { buildTicketHtml } = require('./ticketTemplate');

// Un solo proceso corriendo a la vez -- si el usuario abre el .exe de nuevo
// (por ej. desde el acceso directo, pensando que no esta corriendo porque
// no ve ninguna ventana), enfocamos/mostramos la ventana de configuracion
// del proceso que ya esta vivo en vez de arrancar dos agentes pollenado el
// mismo device en paralelo.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let tray = null;
let setupWindow = null;
let lastStatus = { type: 'unpaired' };
let isQuitting = false;
let shownTrayHint = false;

function iconPath(name) {
  return path.join(__dirname, '..', 'assets', name);
}

function broadcastStatus(status) {
  lastStatus = status;
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.webContents.send('agent:status', status);
  }
  updateTrayTooltip();
}

function updateTrayTooltip() {
  if (!tray) return;
  const cfg = config.getConfig();
  const label = cfg.deviceName ? `ComarPOS Agent — ${cfg.deviceName}` : 'ComarPOS Agent';
  const statusLabel =
    lastStatus.type === 'connected' ? 'Conectado' :
    lastStatus.type === 'unpaired' ? 'Sin vincular' :
    lastStatus.type === 'error' ? 'Sin conexión' : '';
  tray.setToolTip(statusLabel ? `${label} (${statusLabel})` : label);
}

function openSetupWindow() {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.show();
    setupWindow.focus();
    return;
  }

  setupWindow = new BrowserWindow({
    width: 420,
    height: 620,
    resizable: false,
    title: 'ComarPOS Agent',
    icon: iconPath('icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  setupWindow.setMenuBarVisibility(false);
  setupWindow.loadFile(path.join(__dirname, 'setup.html'));

  // Cerrar la ventana (la X) no cierra el agente -- lo minimiza a la
  // bandeja, para no tener que recrear la ventana (y su renderer) cada vez
  // que el usuario la vuelve a abrir. Solo se destruye de verdad al
  // "Salir" desde el menu de la bandeja (ver isQuitting).
  setupWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    setupWindow.hide();
    if (!shownTrayHint) {
      shownTrayHint = true;
      tray?.displayBalloon?.({
        title: 'ComarPOS Agent sigue activo',
        content: 'Se minimizó a la bandeja del sistema y sigue imprimiendo en segundo plano.',
        icon: iconPath('icon.ico'),
      });
    }
  });
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Abrir configuración', click: openSetupWindow },
    { type: 'separator' },
    { label: 'ComarPOS', click: () => shell.openExternal('https://www.comarpos.com') },
    { type: 'separator' },
    { label: 'Salir', click: () => { isQuitting = true; worker.stop(); app.quit(); } },
  ]);
}

function createTray() {
  tray = new Tray(iconPath('tray.png'));
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', openSetupWindow);
  updateTrayTooltip();
}

function sampleTicketPayload() {
  return {
    saleId: 'TICKET-TEST01',
    receiptType: 'COMPROBANTE NO FISCAL',
    paymentMethod: 'EFECTIVO: 1.000,00',
    payments: [{ method: 'EFECTIVO', amount: 1000 }],
    createdAt: new Date().toLocaleString('es-AR'),
    sellerName: 'Agente de prueba',
    business: {
      name: 'ComarPOS',
      cuit: '',
      address: '',
      phone: '',
      ivaCondition: '',
      iibb: '',
      activityStart: '',
    },
    client: { name: 'Consumidor Final' },
    items: [
      { name: 'Producto de prueba', quantity: 1, price: 1000, subtotal: 1000 },
    ],
    subtotal: 1000,
    discount: 0,
    total: 1000,
    ivaBreakdown: [],
    invoice: null,
    footer: 'Ticket de prueba — ComarPOS Agent',
  };
}

function registerIpc() {
  ipcMain.handle('agent:get-state', () => {
    let cfg = config.getConfig();

    // Backfill para configs guardadas antes de que existiera paperWidthMm
    // (ver ticketTemplate.js) -- sin esto, una impresora de 58mm elegida
    // antes de este cambio quedaría imprimiendo con el default de 80mm,
    // que es exactamente el bug que causaba que no imprimiera nada.
    if (cfg.printerName && !cfg.paperWidthMm) {
      const guessed = /58/.test(cfg.printerName) ? 58 : 80;
      cfg = config.setConfig({ paperWidthMm: guessed });
    }

    return {
      deviceId: cfg.deviceId || null,
      deviceName: cfg.deviceName || null,
      printerName: cfg.printerName || null,
      paperWidthMm: cfg.paperWidthMm || 80,
    };
  });

  ipcMain.handle('agent:pair', async (_event, code) => {
    const hardwareId = config.getOrCreateHardwareId();
    const apiUrl = config.getConfig().apiUrl || config.DEFAULT_API_URL;
    const result = await api.pair(apiUrl, String(code).trim(), hardwareId);
    config.setConfig({
      apiUrl,
      deviceId: result.deviceId,
      deviceName: result.deviceName,
      token: result.token,
    });
    worker.start(); // no-op si ya estaba corriendo
    return { deviceId: result.deviceId, deviceName: result.deviceName };
  });

  ipcMain.handle('agent:unpair', () => {
    config.clearPairing();
    return true;
  });

  ipcMain.handle('agent:list-printers', () => printer.listPrinters());

  ipcMain.handle('agent:set-printer', (_event, name) => {
    // Al elegir impresora, sugerimos el ancho de papel segun el nombre
    // (la mayoria de los drivers termicos incluyen "58"/"80" en el
    // nombre, ej. "POS-58C") -- el usuario lo puede cambiar a mano si no
    // adivina bien.
    const guessedWidth = /58/.test(name) ? 58 : /80/.test(name) ? 80 : undefined;
    config.setConfig({ printerName: name, ...(guessedWidth ? { paperWidthMm: guessedWidth } : {}) });
    return { paperWidthMm: config.getConfig().paperWidthMm || 80 };
  });

  ipcMain.handle('agent:set-paper-width', (_event, mm) => {
    config.setConfig({ paperWidthMm: Number(mm) === 58 ? 58 : 80 });
    return true;
  });

  ipcMain.handle('agent:test-print', async () => {
    const cfg = config.getConfig();
    const paperWidthMm = cfg.paperWidthMm || 80;
    const html = await buildTicketHtml(sampleTicketPayload(), paperWidthMm);
    await printer.printHtml(html, cfg.printerName, paperWidthMm);
    return true;
  });
}

app.on('second-instance', () => {
  openSetupWindow();
});

// Apagado/cierre de sesion de Windows dispara esto -- si no marcamos
// isQuitting acá, el listener de "close" de la ventana (arriba) la
// esconde en vez de dejarla cerrar, y el sistema operativo queda
// esperando a una ventana que nunca termina de cerrarse.
app.on('before-quit', () => {
  isQuitting = true;
});

app.whenReady().then(() => {
  registerIpc();
  createTray();
  printer.warmup();
  worker.setStatusListener(broadcastStatus);
  worker.start();

  // Auto-inicio con Windows -- un agente que no arranca solo despues de
  // reiniciar la PC del local es, en la practica, un agente que se olvidan
  // de prender y deja de imprimir tickets sin que nadie se de cuenta hasta
  // la primera venta del dia.
  app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });

  const cfg = config.getConfig();
  if (!cfg.deviceId || !cfg.token) {
    openSetupWindow();
  }
});

// No hay ventana "principal": esto es un agente de bandeja, no debe
// cerrarse solo porque se cerro la ventana de configuracion (comportamiento
// tipico de macOS/Windows para apps de tray) -- sigue vivo en segundo plano
// hasta "Salir" desde el menu de la bandeja.
app.on('window-all-closed', () => {
  // No-op a propósito: sin este listener, Electron cierra la app entera
  // cuando se cierra la ventana de configuración (comportamiento default en
  // Windows). Este es un agente de bandeja, sigue vivo hasta "Salir".
});
