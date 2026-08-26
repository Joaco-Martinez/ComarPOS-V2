const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { app, BrowserWindow } = require('electron');
const pdfToPrinter = require('pdf-to-printer');
const { contentWidthMm } = require('./ticketTemplate');

// pdf-to-printer decide solo si esta empaquetado (para saber si tiene que
// buscar su SumatraPDF.exe bundleado adentro de app.asar.unpacked en vez
// de app.asar) leyendo process.mainModule.filename -- esa propiedad esta
// deprecada y viene undefined en esta version de Electron, asi que esa
// deteccion siempre da "no empaquetado" aunque lo este, y termina
// intentando ejecutar el .exe desde DENTRO del .asar (no existe ahi como
// archivo real, un binario no se puede correr desde adentro del archive).
// Reproducido: probado en modo dev andaba perfecto (no hay asar de por
// medio, la deteccion rota da el resultado correcto por accidente), pero
// en la app empaquetada real no imprimia nada. Se lo pasamos ya resuelto
// nosotros mismos con app.isPackaged (la API real y confiable de
// Electron para esto), evitando su deteccion interna por completo.
function resolveSumatraPdfPath() {
  const base = path.join(__dirname, '..', 'node_modules', 'pdf-to-printer', 'dist', 'SumatraPDF-3.4.6-32.exe');
  return app.isPackaged ? base.replace('app.asar', 'app.asar.unpacked') : base;
}

// Imprime via el driver de Windows de la impresora ya instalada (GDI), no
// ESC/POS crudo -- a diferencia del ESP32 (que le habla directo al puerto
// 9100 de la impresora por IP, ver printbox/README.md), acá delegamos el
// renderizado/codepage/ancho de papel al driver que el fabricante ya
// provee, que es mucho mas robusto entre marcas/modelos que reimplementar
// ESC/POS a mano. Requiere que la impresora este instalada como impresora
// de Windows de antemano (USB plug-and-play la mayoria de las termicas
// modernas ya lo hacen solas).

// Una sola ventana oculta reutilizada para listar impresoras y renderizar
// el HTML del ticket, en vez de crear+destruir una por llamada -- crear
// una ventana justo despues de destruir la anterior probó ser inestable
// (ERR_FAILED intermitente al cargar el archivo del ticket siguiente,
// reproducido a mano varias veces), asi que evitamos el churn del todo en
// vez de perseguir el timing exacto.
let sharedWindow = null;

function getSharedWindow() {
  if (sharedWindow && !sharedWindow.isDestroyed()) return sharedWindow;
  sharedWindow = new BrowserWindow({ show: false });
  sharedWindow.on('closed', () => {
    sharedWindow = null;
  });
  return sharedWindow;
}

async function listPrinters() {
  const win = getSharedWindow();
  const printers = await win.webContents.getPrintersAsync();
  return printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault }));
}

async function printHtml(html, printerName, paperWidthMm = 80) {
  const htmlTempFile = path.join(os.tmpdir(), `comarpos-ticket-${crypto.randomUUID()}.html`);
  const pdfTempFile = path.join(os.tmpdir(), `comarpos-ticket-${crypto.randomUUID()}.pdf`);
  const cleanup = () => {
    fs.unlink(htmlTempFile, () => {});
    fs.unlink(pdfTempFile, () => {});
  };

  try {
    fs.writeFileSync(htmlTempFile, html, 'utf8');
    const win = getSharedWindow();

    // Etapa 1: renderizar el HTML y convertirlo a PDF de una sola pagina,
    // con la altura exacta del contenido real ya cargado (logo incluido).
    // printToPDF SI respeta el pageSize pedido de forma confiable -- a
    // diferencia de pedirle esto mismo directo al print() real contra el
    // driver de una impresora fisica (ver mas abajo, etapa 2).
    await win.loadFile(htmlTempFile);
    const contentHeightPx = await win.webContents.executeJavaScript('document.documentElement.scrollHeight');
    const MICRONS_PER_PX = 25400 / 96; // 1px CSS = 1/96 in = 25400/96 micrones
    const SAFETY_MARGIN_MICRONS = 15000; // ~15mm de margen para el corte
    const widthMicrons = contentWidthMm(paperWidthMm) * 1000;
    const heightMicrons = Math.round(contentHeightPx * MICRONS_PER_PX) + SAFETY_MARGIN_MICRONS;

    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: { width: widthMicrons, height: heightMicrons },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    fs.writeFileSync(pdfTempFile, pdfBuffer);

    // Etapa 2: imprimir ESE PDF ya generado (una sola pagina, paginacion
    // ya resuelta) con pdf-to-printer (usa SumatraPDF por dentro) en vez
    // de imprimir el HTML directo con webContents.print(). Dos intentos
    // anteriores fallaron contra el driver real de una POS-58C:
    //   1. Pedirle un pageSize custom (primero fijo en 3276mm, despues
    //      medido segun el contenido real) directo al print() del HTML
    //      -- el driver real no lo respeta igual que printToPDF, y el
    //      ticket salia partido en 2 paginas fisicas separadas
    //      (reproducido con foto: 2 pedazos de papel, con un caracter
    //      suelto en el borde de cada uno).
    //   2. Cargar el PDF ya generado con el visor interno de Chromium
    //      (BrowserWindow con plugins:true + loadURL a un file://.pdf) y
    //      imprimir eso -- loadURL() se queda colgado indefinidamente sin
    //      resolver su promise para un PDF local con el visor interno.
    // pdf-to-printer/SumatraPDF es una herramienta hecha especificamente
    // para "imprimir este PDF en esta impresora" sin pasar por ninguna de
    // las dos rutas anteriores. scale:'noscale' para que imprima el PDF
    // tal cual esta (ya tiene el pageSize correcto), sin que intente
    // ajustarlo a otro tamaño de papel.
    await pdfToPrinter.print(pdfTempFile, {
      printer: printerName || undefined,
      scale: 'noscale',
      silent: true,
      sumatraPdfPath: resolveSumatraPdfPath(),
    });

    // SumatraPDF le entrega el trabajo al spooler de Windows y termina su
    // propio proceso (que es lo que este await espera) ANTES de que el
    // spooler termine de leer/rasterizar el PDF -- son cosas asincronicas
    // separadas. Reproducido: borrando el archivo temporal apenas
    // termina este await, el trabajo llegaba a la impresora truncado a
    // ~468 bytes en vez de los ~65KB reales (confirmado comparando el
    // tamaño del job en la cola de Windows con y sin este delay). Sin
    // esto, el driver "imprime" sin error pero no sale nada -- la
    // impresora nunca recibio la mayor parte del contenido.
    await new Promise((r) => setTimeout(r, 4000));
  } finally {
    cleanup();
  }
}

// Crea la ventana compartida de una vez al arrancar la app, antes de que
// se abra/cierre cualquier otra ventana (ej. la de configuracion) -- asi el
// primer ticket que llegue no compite en timing con esos ciclos de
// creacion/destruccion de otras ventanas (ver el comentario grande mas
// arriba sobre por que se evita el churn).
function warmup() {
  getSharedWindow();
}

module.exports = { listPrinters, printHtml, warmup };
