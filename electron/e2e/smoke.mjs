// Smoke test of the packaged desktop app (electron/dist/win-unpacked/Scriblr.exe), driven with Playwright's Electron support:
// it starts, shows a window with the Writer, its backend answers, a project made through the API shows on the shelves after a reload,
// a second launch does not open a second app, and quitting leaves no backend process behind.
//
//   node e2e/smoke.mjs [path to Scriblr.exe]
//
// The app runs against a scratch data folder (SCRIBLR_DATA_DIR), never your projects. Run it from scripts/release.ps1, or by hand after
// `npm run dist`.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = path.dirname(fileURLToPath(import.meta.url))
const exe = path.resolve(process.argv[2] ?? path.join(here, '..', 'dist', 'win-unpacked', 'Scriblr.exe'))
if (!existsSync(exe)) throw new Error(`The packaged app is missing: ${exe} (run npm run dist first)`)

const data = mkdtempSync(path.join(os.tmpdir(), 'scriblr-e2e-'))
const shots = path.join(here, 'out')
mkdirSync(shots, { recursive: true })
const env = { ...process.env, SCRIBLR_DATA_DIR: data }
delete env.ELECTRON_RUN_AS_NODE
delete env.SCRIBLR_FORCE_PROD

const backendRunning = () => {
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq scriblr-backend.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' })
    return /scriblr-backend\.exe/i.test(out)
  } catch {
    return false
  }
}
const check = (ok, what) => {
  if (!ok) throw new Error(`FAILED: ${what}`)
  console.log(`ok: ${what}`)
}

let app
try {
  check(!backendRunning(), 'no backend running before the test (close Scriblr first if this fails)')

  app = await electron.launch({ executablePath: exe, env, timeout: 90_000 })
  // The first window may be the small "Starting" one; the app's own window is the one that loads the Writer.
  let page
  for (let i = 0; i < 120 && !page; i++) {
    page = app.windows().find(w => /\/(write|$)/.test(new URL(w.url()).pathname) && w.url().startsWith('http'))
    if (!page) await new Promise(r => setTimeout(r, 500))
  }
  check(Boolean(page), 'the app opened a window on its own backend')
  await page.waitForSelector('#root *', { timeout: 30_000 })
  check((await page.title()) === 'Scriblr', 'the window is titled Scriblr')

  const health = await page.evaluate(async () => (await fetch('/api/health')).json())
  check(health.status === 'ok', 'the backend answers /api/health through the window')

  const created = await page.evaluate(async () => {
    const res = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'E2E smoke project' }) })
    return res.json()
  })
  check(typeof created.projectId === 'string', 'a project can be created')

  await page.reload()
  await page.waitForSelector('text=E2E smoke project', { timeout: 30_000 })
  check(true, 'the new project shows on the shelves after a reload')
  await page.screenshot({ path: path.join(shots, 'shelves.png') })

  const deep = await page.evaluate(async () => (await fetch('/write/anything/deep')).status)
  check(deep === 200, 'a deep route is served the app')

  // A second launch hands over to the first (single-instance lock) and exits.
  const second = spawnSync(exe, [], { env, timeout: 30_000 })
  check(second.status !== null, 'a second launch exits by itself')
  check(app.windows().length >= 1, 'the first window is still open after it')
} finally {
  if (app) await app.close().catch(() => {})
  // The backend is stopped with the window: nothing may be left running.
  await new Promise(r => setTimeout(r, 1500))
  const left = backendRunning()
  rmSync(data, { recursive: true, force: true })
  if (left) {
    try { execFileSync('taskkill', ['/IM', 'scriblr-backend.exe', '/T', '/F']) } catch { /* already gone */ }
    console.error('FAILED: a scriblr-backend process was left running after quitting')
    process.exitCode = 1
  } else {
    console.log('ok: no backend process left after quitting')
  }
}
