const { contextBridge, ipcRenderer } = require('electron')

// Bridge exposed to the sandboxed renderer (contextIsolation: true,
// nodeIntegration: false). Only the explicitly listed functions are reachable
// from the React app — nothing else from Node/Electron leaks through.
contextBridge.exposeInMainWorld('electronAPI', {
  // Launches the Labelwright ("Label Printer") desktop app. Resolves to
  // { ok: true, path } on success, or { ok: false, error } if it can't be found.
  launchLabelPrinter: () => ipcRenderer.invoke('launch-label-printer'),
})
