import '@testing-library/jest-dom'
import { afterEach, vi } from 'vitest'
import { __resetSettingsForTests } from '../settings/settingsStore'

// What one test leaves behind must not reach the next: stubbed globals (fetch, ResizeObserver, ...), the browser storage the stores read,
// and the settings store itself. (React Testing Library unmounts what a test rendered on its own.)
afterEach(() => {
  vi.unstubAllGlobals()
  // (A test that runs in Node has no window or storage.)
  try { window.localStorage.clear(); window.sessionStorage.clear() } catch { /* storage unavailable, or no window */ }
  __resetSettingsForTests()
})
