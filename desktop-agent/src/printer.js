const { BrowserWindow } = require('electron');

// Imprime via el driver de Windows de la impresora ya instalada (GDI), no
// ESC/POS crudo -- a diferencia del ESP32 (que le habla directo al puerto
// 9100 de la impresora por IP, ver printbox/README.md), acá delegamos el
// renderizado/codepage/ancho de papel al driver que el fabricante ya
// provee, que es mucho mas robusto entre marcas/modelos que reimplementar
// ESC/POS a mano. Requiere que la impresora este instalada como impresora
// de Windows de antemano (USB plug-and-play la mayoria de las termicas
// modernas ya lo hacen solas).

async function listPrinters() {
  const win = new BrowserWindow({ show: false });
  try {
    const printers = await win.webContents.getPrintersAsync();
    return printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault }));
  } finally {
    win.destroy();
  }
}

function printHtml(html, printerName) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({ show: false });
    const dataUrl = `data:text/html;charset=utf-8;base64,${Buffer.from(html, 'utf8').toString('base64')}`;

    win
      .loadURL(dataUrl)
      .then(() => {
        win.webContents.print(
          {
            silent: true,
            printBackground: true,
            deviceName: printerName || undefined,
            margins: { marginType: 'none' },
          },
          (success, errorType) => {
            win.destroy();
            if (success) resolve();
            else reject(new Error(errorType || 'Error al imprimir'));
          }
        );
      })
      .catch((err) => {
        win.destroy();
        reject(err);
      });
  });
}

module.exports = { listPrinters, printHtml };
