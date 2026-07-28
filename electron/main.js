// Electron shell for Scriblr. Replaces the old pywebview-based
// backend/desktop_main.py: this process owns the native window, and spawns
// the FastAPI backend (backend/server_main.py, or its PyInstaller-built
// executable once packaged) as a plain HTTP subprocess it talks to over
// loopback, same as a browser would.
const { app, BrowserWindow } = require('electron')
const path = require('path')
const http = require('http')
const net = require('net')
const { spawn } = require('child_process')

const HOST = '127.0.0.1'
const DEV_PORT = 8000 // fixed: must match frontend/vite.config.ts's dev proxy target
const DEV_FRONTEND_URL = 'http://127.0.0.1:5173'

// --prod (as set by the Desktop shortcut) or SCRIBLR_FORCE_PROD=1 (as set by
// `npm run start:prod`) both force the "prod, run from source" path: backend
// serves the built frontend/dist, no Vite involved. Mirrors the old
// `desktop_main.py` (no flag) vs `--dev` split.
const forceProd = process.argv.includes('--prod') || process.env.SCRIBLR_FORCE_PROD === '1'
const isDev = !app.isPackaged && !forceProd

let backendProcess = null
let mainWindow = null
let backendPort = DEV_PORT

// Dev mode keeps the fixed port the Vite proxy expects. Every other launch
// (the packaged app, the prod-from-source shortcut) gets its own ephemeral
// port picked fresh each run, so it can never collide with a dev server (or
// a stale leftover process) someone left bound to the fixed port -- the
// class of "port already in use" / stale-process error this project kept
// running into.
function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, HOST, () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

function backendCommand() {
  if (app.isPackaged) {
    return { cmd: path.join(process.resourcesPath, 'backend', 'scriblr-backend.exe'), args: [], cwd: undefined }
  }
  const backendDir = path.join(__dirname, '..', 'backend')
  const pythonExe =
    process.platform === 'win32'
      ? path.join(backendDir, '.venv', 'Scripts', 'python.exe')
      : path.join(backendDir, '.venv', 'bin', 'python')
  return { cmd: pythonExe, args: ['server_main.py'], cwd: backendDir }
}

function startBackend(port) {
  const { cmd, args, cwd } = backendCommand()
  backendProcess = spawn(cmd, args, {
    cwd,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, SCRIBLR_HOST: HOST, SCRIBLR_PORT: String(port) },
  })
  backendProcess.on('error', (err) => {
    console.error('Failed to start Scriblr backend:', err)
  })
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill()
    backendProcess = null
  }
}

function waitUntilHealthy(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    function attempt() {
      const req = http.get(url, (res) => {
        res.resume()
        if (res.statusCode === 200) resolve()
        else retry()
      })
      req.on('error', retry)
    }
    function retry() {
      if (Date.now() > deadline) {
        reject(new Error('Backend did not become healthy in time'))
        return
      }
      setTimeout(attempt, 200)
    }
    attempt()
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'Scriblr',
    icon: path.join(__dirname, '..', 'backend', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const url = isDev ? DEV_FRONTEND_URL : `http://${HOST}:${backendPort}/`
  mainWindow.loadURL(url)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  if (!isDev) {
    try {
      backendPort = await getFreePort()
    } catch (err) {
      console.error('Could not find a free port, falling back to default:', err)
      backendPort = DEV_PORT
    }
  }

  startBackend(backendPort)
  try {
    await waitUntilHealthy(`http://${HOST}:${backendPort}/api/health`)
  } catch (err) {
    console.error(err)
  }
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopBackend()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', stopBackend)
