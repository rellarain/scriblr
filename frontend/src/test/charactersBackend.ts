import { vi } from 'vitest'
import type { CharacterDoc } from '../api/types'
import { createMockCharacters } from '../designSystem/mockCharacters'

// A stand-in for the Characters API (`/api/projects/{id}/characters`) for tests: the cast is kept in memory by the same pretend API the design system uses
// (designSystem/mockCharacters.ts). `calls` lists every request as "METHOD /path"; `failNext(path, ...)` makes the next request to a path fail.

export interface CharactersBackend {
  fetch: ReturnType<typeof vi.fn>
  readonly cast: Map<string, CharacterDoc>
  calls: string[]
  of(method: string): string[]
  failNext(path: string, status: number, detail: unknown): void
}

export function charactersBackend(initial: CharacterDoc[] = []): CharactersBackend {
  const mock = createMockCharacters(initial)
  const failures = new Map<string, { status: number; detail: unknown }>()
  const calls: string[] = []
  const reply = (status: number, body: unknown) => ({ ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Error', json: async () => body, text: async () => JSON.stringify(body ?? null) })

  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const path = String(url).replace(/^\/api/, '')
    calls.push(`${method} ${path}`)
    const failure = failures.get(path)
    if (failure) { failures.delete(path); return reply(failure.status, { detail: failure.detail }) }
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
    // /projects/{id}/characters[/{characterId}]; anything else the page asks for (settings) is answered with an empty document.
    if (parts[0] !== 'projects' || parts[2] !== 'characters') return reply(200, {})
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const answer = mock.route(method, parts.slice(3), body)
    return reply(answer.status, answer.body)
  })
  vi.stubGlobal('fetch', fn)

  return {
    fetch: fn, calls,
    get cast() { return mock.cast },
    of: method => calls.filter(c => c.startsWith(`${method} `)),
    failNext: (path, status, detail) => { failures.set(path, { status, detail }) },
  }
}
