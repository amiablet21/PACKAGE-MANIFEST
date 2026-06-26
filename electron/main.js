const { app, BrowserWindow, globalShortcut, ipcMain, shell } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const { spawn } = require('child_process')

// Locate the Labelwright ("Label Printer") executable. Checks, in order:
//   1. LABELWRIGHT_PATH env var (explicit override)
//   2. The copy bundled inside this installer (extraResources) — so a single
//      Manifest install ships both apps and the button always works
//   3. The per-user installed location (electron-builder NSIS default)
//   4. The portable build inside a "Label Printer" folder in the user's home
// Using os.homedir() keeps this working regardless of the Windows username.
function findLabelPrinter() {
  const candidates = [
    process.env.LABELWRIGHT_PATH,
    app.isPackaged ? path.join(process.resourcesPath, 'Labelwright', 'Labelwright.exe') : null,
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Labelwright', 'Labelwright.exe'),
    path.join(os.homedir(), 'Label Printer', 'release', 'win-unpacked', 'Labelwright.exe'),
  ].filter(Boolean)
  return candidates.find((p) => fs.existsSync(p)) || null
}

// IPC: launch Labelwright as an independent, detached process so closing
// Manifest does not kill it.
ipcMain.handle('launch-label-printer', async () => {
  const exe = findLabelPrinter()
  if (!exe) {
    return {
      ok: false,
      error: 'Could not find Label Printer (Labelwright). Expected it in your "Label Printer" folder or installed under AppData.',
    }
  }
  try {
    const child = spawn(exe, [], {
      detached: true,
      stdio: 'ignore',
      cwd: path.dirname(exe),
    })
    child.unref()
    return { ok: true, path: exe }
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) }
  }
})

// IPC: open an external URL (e.g. the UPS batch upload page) in the user's
// default browser — never inside the app window. Restricted to http/https.
ipcMain.handle('open-external', async (_e, url) => {
  try {
    const u = new URL(String(url))
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, error: 'Only http/https links can be opened' }
    }
    await shell.openExternal(u.href)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) }
  }
})

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

const iconPath = isDev
  ? path.join(__dirname, '../public/icon.png')
  : path.join(__dirname, '../dist/icon.png')

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    title: 'Manifest',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      zoomFactor: 0.85,
    },
  })

  win.webContents.setZoomFactor(0.85)

  // Zoom controls: Ctrl+= zoom in, Ctrl+- zoom out, Ctrl+0 reset
  win.webContents.on('before-input-event', (event, input) => {
    if (input.control && !input.alt && !input.shift) {
      const currentZoom = win.webContents.getZoomFactor()
      if (input.key === '=' || input.key === '+') {
        win.webContents.setZoomFactor(Math.min(currentZoom + 0.05, 1.5))
        event.preventDefault()
      } else if (input.key === '-') {
        win.webContents.setZoomFactor(Math.max(currentZoom - 0.05, 0.5))
        event.preventDefault()
      } else if (input.key === '0') {
        win.webContents.setZoomFactor(0.85)
        event.preventDefault()
      }
    }
  })

  // Ctrl + mouse wheel zoom
  win.webContents.on('zoom-changed', (event, zoomDirection) => {
    const currentZoom = win.webContents.getZoomFactor()
    if (zoomDirection === 'in') {
      win.webContents.setZoomFactor(Math.min(currentZoom + 0.05, 1.5))
    } else {
      win.webContents.setZoomFactor(Math.max(currentZoom - 0.05, 0.5))
    }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
