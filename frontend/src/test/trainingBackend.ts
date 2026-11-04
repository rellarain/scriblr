import { vi } from 'vitest'
import type { TrainingContent, TrainingProgress, TrainingState } from '../api/types'
import { createMockTraining } from '../designSystem/mockTraining'

// A stand-in for the Training API (`/api/training`) for tests: the courses and the progress are kept in memory by the same pretend API the design
// system uses (designSystem/mockTraining.ts), so a test drives Training against answers shaped like the server's. `calls` lists every request as
// "METHOD /path"; `failNext(path, ...)` makes the next request to a path fail; `hold()` keeps every answer back until `release()` (a loading state).

export { seedContent, emptyProgress } from '../designSystem/mockTraining'

export interface TrainingBackend {
  fetch: ReturnType<typeof vi.fn>
  readonly state: TrainingState
  calls: string[]
  failNext(path: string, status: number, detail: unknown): void
  hold(): void
  release(): void
}

export function trainingBackend(initial?: TrainingContent, progress?: TrainingProgress): TrainingBackend {
  const mock = createMockTraining(initial, progress)
  const failures = new Map<string, { status: number; detail: unknown }>()
  const calls: string[] = []
  let gate: Promise<void> | null = null
  let open: (() => void) | null = null
  const reply = (status: number, body: unknown) => ({ ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Error', json: async () => body })

  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const path = String(url).replace(/^\/api/, '')
    calls.push(`${method} ${path}`)
    if (gate) await gate
    const failure = failures.get(path)
    if (failure) { failures.delete(path); return reply(failure.status, { detail: failure.detail }) }
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
    // Everything else the page asks for (settings, resources) is answered with an empty document.
    if (parts[0] !== 'training') return reply(200, {})
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const answer = mock.route(method, parts.slice(1), body)
    return reply(answer.status, answer.body)
  })
  vi.stubGlobal('fetch', fn)

  return {
    fetch: fn, calls,
    get state() { return mock.state },
    failNext: (path, status, detail) => { failures.set(path, { status, detail }) },
    hold: () => { gate = new Promise<void>(resolve => { open = resolve }) },
    release: () => { open?.(); gate = null; open = null },
  }
}
