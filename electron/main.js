// Electron shell for Scriblr. Replaces the old pywebview-based
// backend/desktop_main.py: this process owns the native window, and spawns
// the FastAPI backend (backend/server_main.py, or its PyInstaller-built
// executable once packaged) as a plain HTTP subprocess it talks to over
// loopback, same as a browser would.
const { app, BrowserWindow, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const http = require('http')
const net = require('net')
const { spawn } = require('child_process')

const HOST = '127.0.0.1'
const DEV_PORT = 8000 // fixed: must match frontend/vite.config.ts's dev proxy target
const DEV_FRONTEND_URL = 'http://127.0.0.1:5173'
// How long to wait for the backend to answer before giving up (a first launch after an install can be slow while the system scans the files).
const BACKEND_WAIT_MS = 60000

// --prod (as set by the Desktop shortcut) or SCRIBLR_FORCE_PROD=1 (as set by
// `npm run start:prod`) both force the "prod, run from source" path: backend
// serves the built frontend/dist, no Vite involved. Mirrors the old
// `desktop_main.py` (no flag) vs `--dev` split.
const forceProd = process.argv.includes('--prod') || process.env.SCRIBLR_FORCE_PROD === '1'
const isDev = !app.isPackaged && !forceProd

// One Scriblr at a time: a second launch against the same data directory would start a second backend (the store has no cross-process lock) and
// could overwrite the first one's saves. The second launch just brings the first window forward. SCRIBLR_ALLOW_MULTIPLE=1 lifts it (dev tooling).
const gotLock = process.env.SCRIBLR_ALLOW_MULTIPLE === '1' || app.requestSingleInstanceLock()
if (!gotLock) app.quit()

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

// The backend's output goes to a log file (kept small: the last run's is kept as backend.log.1), so a failure to start leaves something to read.
function openBackendLog() {
  try {
    const dir = path.join(app.getPath('userData'), 'logs')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, 'backend.log')
    if (fs.existsSync(file) && fs.statSync(file).size > 1_000_000) fs.renameSync(file, file + '.1')
    return { fd: fs.openSync(file, 'a'), file }
  } catch (err) {
    console.error('Could not open the backend log:', err)
    return { fd: 'ignore', file: null }
  }
}

let backendLogFile = null
let backendStartError = null

function startBackend(port) {
  const { cmd, args, cwd } = backendCommand()
  const log = openBackendLog()
  backendLogFile = log.file
  backendProcess = spawn(cmd, args, {
    cwd,
    stdio: ['ignore', log.fd, log.fd],
    windowsHide: true,
    env: { ...process.env, SCRIBLR_HOST: HOST, SCRIBLR_PORT: String(port) },
  })
  backendProcess.on('error', (err) => {
    backendStartError = err
    console.error('Failed to start Scriblr backend:', err)
  })
  backendProcess.on('exit', (code) => {
    if (backendProcess) backendStartError = backendStartError || new Error('The backend stopped (exit code ' + code + ')')
  })
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    const pid = backendProcess.pid
    backendProcess = null
    // On Windows kill() ends only the process itself: take its children (a one-file build's real server) with it.
    if (process.platform === 'win32' && pid) {
      try { spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }) } catch (err) { console.error(err) }
    } else {
      try { process.kill(pid) } catch (err) { console.error(err) }
    }
  }
}

function waitUntilHealthy(url, timeoutMs = BACKEND_WAIT_MS) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    function attempt() {
      if (backendStartError) {
        reject(backendStartError)
        return
      }
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

// A small window while the backend starts, so a slow start is not a blank screen.
function showSplash() {
  const splash = new BrowserWindow({ width: 380, height: 160, frame: false, resizable: false, show: false, alwaysOnTop: true, title: 'Scriblr' })
  const html = '<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,Segoe UI,sans-serif;background:#2b1a24;color:#fff"><div style="text-align:center"><div style="font-size:22px;font-weight:700;letter-spacing:3px">SCRIBLR</div><div style="margin-top:12px;opacity:.85">Starting\u2026</div></div></body>'
  splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  splash.once('ready-to-show', () => splash.show())
  return splash
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

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

if (gotLock) app.whenReady().then(async () => {
  if (!isDev) {
    try {
      backendPort = await getFreePort()
    } catch (err) {
      console.error('Could not find a free port, falling back to default:', err)
      backendPort = DEV_PORT
    }
  }

  const splash = showSplash()
  startBackend(backendPort)
  try {
    await waitUntilHealthy(`http://${HOST}:${backendPort}/api/health`)
  } catch (err) {
    console.error(err)
    if (!splash.isDestroyed()) splash.close()
    dialog.showErrorBox(
      'Scriblr could not start',
      'The part of Scriblr that keeps your projects did not start' + (err && err.message ? ' (' + err.message + ')' : '') + '.\n\nYour projects have not been touched.' +
        (backendLogFile ? '\n\nDetails: ' + backendLogFile : ''),
    )
    app.quit()
    return
  }
  createWindow()
  mainWindow.once('ready-to-show', () => { if (!splash.isDestroyed()) splash.close() })
  mainWindow.webContents.once('did-finish-load', () => { if (!splash.isDestroyed()) splash.close() })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopBackend()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', stopBackend)
