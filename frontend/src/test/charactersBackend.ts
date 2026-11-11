import { vi } from 'vitest'
import type { CharacterDoc, FigureModel, PublishedModelOut } from '../api/types'
import { createMockCharacters } from '../designSystem/mockCharacters'
import { createMockFigureModels } from '../designSystem/mockFigureModels'

// A stand-in for the Characters API (`/api/projects/{id}/characters`) for tests: the cast is kept in memory by the same pretend API the design system uses
// (designSystem/mockCharacters.ts), and so are the copies of models its figures point at (designSystem/mockFigureModels.ts). `calls` lists every request as "METHOD /path"; `failNext(path, ...)` makes the next request to a path fail.

export interface CharactersBackend {
  fetch: ReturnType<typeof vi.fn>
  readonly cast: Map<string, CharacterDoc>
  readonly copies: Map<string, FigureModel>
  calls: string[]
  of(method: string): string[]
  failNext(path: string, status: number, detail: unknown): void
}

// `copies` are the model copies the project holds, `published` the models the catalog offers to copy, `basic` the model that asking for the basic one publishes.
export function charactersBackend(initial: CharacterDoc[] = [], more: { copies?: FigureModel[]; published?: PublishedModelOut[]; basic?: PublishedModelOut } = {}): CharactersBackend {
  const mock = createMockCharacters(initial)
  const figures = createMockFigureModels(() => more.published ?? [], more.copies ?? [])
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
    // /projects/{id}/characters[/{characterId}] and /projects/{id}/figure-models; anything else the page asks for (settings) is answered with an empty document.
    if (parts[0] === 'character-models' && parts[1] === 'published') return reply(200, { models: more.published ?? [] })
    if (parts[0] === 'character-models' && parts[1] === 'basic' && method === 'POST') {
      if (!more.basic || (more.published ?? []).some(m => m.id === more.basic!.id)) return reply(409, { detail: 'The basic model is already here.' })
      more.published = [...(more.published ?? []), more.basic]
      return reply(200, { schemaVersion: 1, models: [] })
    }
    if (parts[0] !== 'projects' || (parts[2] !== 'characters' && parts[2] !== 'figure-models')) return reply(200, {})
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const answer = parts[2] === 'figure-models' ? figures.route(method, parts.slice(3), body) : mock.route(method, parts.slice(3), body)
    return reply(answer.status, answer.body)
  })
  vi.stubGlobal('fetch', fn)

  return {
    fetch: fn, calls,
    get cast() { return mock.cast },
    get copies() { return figures.copies },
    of: method => calls.filter(c => c.startsWith(`${method} `)),
    failNext: (path, status, detail) => { failures.set(path, { status, detail }) },
  }
}
