const { app, BrowserWindow, globalShortcut } = require('electron')
const path = require('path')

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
