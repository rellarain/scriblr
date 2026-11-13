import { vi } from 'vitest'
import type { ModelEntry, WriterModelLimits } from '../api/types'
import { createMockModels } from '../designSystem/mockCharacterModels'

// A stand-in for the character models API (`/api/character-models`) for tests: the catalog is kept in memory by the same pretend API the design
// system uses (designSystem/mockCharacterModels.ts), so a test drives the page against answers shaped like the server's. `calls` lists every request
// as "METHOD /path"; `failNext(path, ...)` makes the next request to a path fail.

export { draftEntry, liveEntry, modelContent as content } from '../designSystem/mockCharacterModels'

export interface ModelsBackend {
  fetch: ReturnType<typeof vi.fn>
  entries: ModelEntry[]
  // the models of the writer's own library
  ownEntries: ModelEntry[]
  // the limits the admin has set for the writer's own models (each at the admin's own limit until set)
  limits: WriterModelLimits
  calls: string[]
  // Make the next request to a path fail with this status and message.
  failNext(path: string, status: number, detail: string): void
  // A newer basic model waits (phase O4a): set before the page loads.
  basicUpdate: boolean
}

export function modelsBackend(initial: ModelEntry[], own: ModelEntry[] = []): ModelsBackend {
  const mock = createMockModels(initial)
  // the writer's own library (`/my-models`) is another catalog
  const mine = createMockModels(own, { writer: true })
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
    if (parts[0] !== 'character-models' && parts[0] !== 'my-models') return reply(404, { detail: `unexpected ${method} ${path}` })
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const answer = (parts[0] === 'my-models' ? mine : mock).route(method, parts.slice(1), body)
    return reply(answer.status, answer.body)
  })
  vi.stubGlobal('fetch', fn)

  return {
    fetch: fn, calls,
    get entries() { return mock.state.entries },
    get ownEntries() { return mine.state.entries },
    get limits() { return mine.state.limits },
    set limits(next: WriterModelLimits) { mine.state.limits = next },
    failNext: (path, status, detail) => { failures.set(path, { status, detail }) },
    get basicUpdate() { return mock.state.basicUpdate },
    set basicUpdate(next: boolean) { mock.state.basicUpdate = next },
  }
}
