import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './style/style.css'
import * as settingsStore from './settings/settingsStore'
import { getSettings, initSettings, installFlushOnHide, subscribeSettings } from './settings/settingsStore'
import { applyInitialTheme, endBoot } from './theme/applyTheme'
import { CURRENT_USER } from './userSeed'

// Theme first, before anything renders: the cached palette (or the default)
// is applied synchronously so the very first paint is already themed.
const cachedSettings = getSettings()
applyInitialTheme(cachedSettings.theme, cachedSettings.ui.viewAs ?? CURRENT_USER.role)

// With no cached theme (the first run, or a packaged relaunch, whose origin --
// and localStorage -- is new every launch), hold the UI back for the moment
// the saved theme takes to arrive instead of flashing the default one.
let hasCache = false
try { hasCache = window.localStorage.getItem('scriblr.settings.cache') !== null } catch { /* storage unavailable */ }
const HOLD_MS = 400
if (!hasCache) {
  document.documentElement.setAttribute('data-theme-pending', '')
  const release = () => {
    document.documentElement.removeAttribute('data-theme-pending')
    endBoot()
  }
  const timer = setTimeout(release, HOLD_MS)
  const unsubscribe = subscribeSettings(() => {
    if (!getSettings().loaded) return
    clearTimeout(timer)
    unsubscribe()
    release()
  })
} else {
  endBoot()
}

void initSettings()
// Dev-only handle for poking settings from the browser console.
if (import.meta.env.DEV) (window as unknown as { __scriblr?: unknown }).__scriblr = { settings: settingsStore }
installFlushOnHide()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
