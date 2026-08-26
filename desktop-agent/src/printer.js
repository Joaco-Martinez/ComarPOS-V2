const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { BrowserWindow } = require('electron');
const { contentWidthMm } = require('./ticketTemplate');

// Imprime via el driver de Windows de la impresora ya instalada (GDI), no
// ESC/POS crudo -- a diferencia del ESP32 (que le habla directo al puerto
// 9100 de la impresora por IP, ver printbox/README.md), acá delegamos el
// renderizado/codepage/ancho de papel al driver que el fabricante ya
// provee, que es mucho mas robusto entre marcas/modelos que reimplementar
// ESC/POS a mano. Requiere que la impresora este instalada como impresora
// de Windows de antemano (USB plug-and-play la mayoria de las termicas
// modernas ya lo hacen solas).

// Una sola ventana oculta reutilizada para listar impresoras e imprimir, en
// vez de crear+destruir una por llamada -- crear una ventana justo despues
// de destruir la anterior probó ser inestable (ERR_FAILED intermitente al
// cargar el archivo del ticket siguiente, reproducido a mano varias veces),
// asi que evitamos el churn del todo en vez de perseguir el timing exacto.
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

function printHtml(html, printerName, paperWidthMm = 80) {
  return new Promise((resolve, reject) => {
    const tempFile = path.join(os.tmpdir(), `comarpos-ticket-${crypto.randomUUID()}.html`);
    fs.writeFileSync(tempFile, html, 'utf8');
    const cleanup = () => fs.unlink(tempFile, () => {});

    const win = getSharedWindow();

    win
      .loadFile(tempFile)
      .then(() => {
        win.webContents.print(
          {
            silent: true,
            printBackground: true,
            deviceName: printerName || undefined,
            margins: { marginType: 'none' },
            // Pagina explicita en micrones -- sin esto Electron usa el
            // tamaño de pagina por defecto del driver (tipicamente
            // A4/Letter), mas ancho que el rollo. IMPORTANTE: el ancho va
            // en el area IMPRIMIBLE (contentWidthMm), no el ancho del
            // rollo -- confirmado contra el PrintCapabilitiesXML real de
            // una POS-58C: el driver declara un maximo de 48047 micrones
            // (58mm de rollo, ~48mm imprimibles) y rechaza en silencio
            // (job "completa" sin error pero no sale nada) cualquier
            // pageSize por encima de ese maximo -- mandar los 58mm enteros
            // del rollo (58000) ya superaba ese limite.
            //
            // El alto (3276mm) es exactamente el valor que ese mismo
            // driver declara como su preset de "rollo continuo" (ver
            // PrintCapabilitiesXML, Option3: 58(48) x 3276mm). Con 200mm
            // (valor anterior) alcanzaba justo para un ticket corto, pero
            // al sumar el logo el contenido paso esa altura -- Chromium
            // partio el ticket en 2 "paginas": la primera se corta a mitad
            // del footer, y la segunda arranca con el resto suelto (un
            // caracter de "FACTURA B" quedando solo arriba a la izquierda,
            // reportado por el usuario). Con la altura al maximo declarado
            // por el driver, todo el ticket entra en una sola pagina sin
            // importar cuanto contenido tenga.
            pageSize: { width: contentWidthMm(paperWidthMm) * 1000, height: 3275974 },
          },
          (success, errorType) => {
            cleanup();
            if (success) resolve();
            else reject(new Error(errorType || 'Error al imprimir'));
          }
        );
      })
      .catch((err) => {
        cleanup();
        reject(err);
      });
  });
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
