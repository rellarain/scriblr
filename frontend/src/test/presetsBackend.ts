import { vi } from 'vitest'
import type { PresetEntry } from '../api/types'
import { createMockPresets } from '../designSystem/mockPresets'

// A stand-in for the plot presets API (`/api/presets`) for tests: the catalog is kept in memory by the same pretend API the design system
// uses (designSystem/mockPresets.ts), so a test drives the page or the picker against answers shaped like the server's. `calls` lists every
// request as "METHOD /path"; `failNext(path, ...)` makes the next request to a path fail.

export { draftEntry, liveEntry, presetContent as content } from '../designSystem/mockPresets'

export interface PresetsBackend {
  fetch: ReturnType<typeof vi.fn>
  entries: PresetEntry[]
  calls: string[]
  // Make the next request to a path fail with this status and message.
  failNext(path: string, status: number, detail: string): void
}

export function presetsBackend(initial: PresetEntry[]): PresetsBackend {
  const mock = createMockPresets(initial)
  const failures = new Map<string, { status: number; detail: string }>()
  const calls: string[] = []
  const reply = (status: number, body: unknown) => ({ ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Error', json: async () => body })

  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const path = String(url).replace(/^\/api/, '')
    calls.push(`${method} ${path}`)
    const failure = failures.get(path)
    if (failure) { failures.delete(path); return reply(failure.status, { detail: failure.detail }) }
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
    if (parts[0] !== 'presets') return reply(404, { detail: `unexpected ${method} ${path}` })
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const answer = mock.route(method, parts.slice(1), body)
    return reply(answer.status, answer.body)
  })
  vi.stubGlobal('fetch', fn)

  return {
    fetch: fn, calls,
    get entries() { return mock.state.entries },
    failNext: (path, status, detail) => { failures.set(path, { status, detail }) },
  }
}
