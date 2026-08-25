const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agent', {
  getState: () => ipcRenderer.invoke('agent:get-state'),
  pair: (code) => ipcRenderer.invoke('agent:pair', code),
  unpair: () => ipcRenderer.invoke('agent:unpair'),
  listPrinters: () => ipcRenderer.invoke('agent:list-printers'),
  setPrinter: (name) => ipcRenderer.invoke('agent:set-printer', name),
  testPrint: () => ipcRenderer.invoke('agent:test-print'),
  onStatus: (cb) => {
    const listener = (_event, status) => cb(status);
    ipcRenderer.on('agent:status', listener);
    return () => ipcRenderer.removeListener('agent:status', listener);
  },
});
