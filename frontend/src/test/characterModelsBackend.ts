import { vi } from 'vitest'
import type { ModelEntry } from '../api/types'
import { createMockModels } from '../designSystem/mockCharacterModels'

// A stand-in for the character models API (`/api/character-models`) for tests: the catalog is kept in memory by the same pretend API the design
// system uses (designSystem/mockCharacterModels.ts), so a test drives the page against answers shaped like the server's. `calls` lists every request
// as "METHOD /path"; `failNext(path, ...)` makes the next request to a path fail.

export { draftEntry, liveEntry, modelContent as content } from '../designSystem/mockCharacterModels'

export interface ModelsBackend {
  fetch: ReturnType<typeof vi.fn>
  entries: ModelEntry[]
  calls: string[]
  // Make the next request to a path fail with this status and message.
  failNext(path: string, status: number, detail: string): void
}

export function modelsBackend(initial: ModelEntry[]): ModelsBackend {
  const mock = createMockModels(initial)
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
    if (parts[0] !== 'character-models') return reply(404, { detail: `unexpected ${method} ${path}` })
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
