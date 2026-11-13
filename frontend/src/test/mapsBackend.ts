import { vi } from 'vitest'
import type { MapDoc } from '../api/types'
import { createMockMapBiomes } from '../designSystem/mockMapBiomes'
import { createMockMaps } from '../designSystem/mockMaps'
import { createMockMapShapes } from '../designSystem/mockMapShapes'

// A stand-in for the Maps API (`/api/projects/{id}/maps`) for tests: the maps are kept in memory by the same pretend API the design system uses
// (designSystem/mockMaps.ts), and so are the biomes (the admin's list and the project's own, designSystem/mockMapBiomes.ts). `calls` lists every request as "METHOD /path"; `failNext(path, ...)` makes the next request to a path fail.

export interface MapsBackend {
  fetch: ReturnType<typeof vi.fn>
  readonly maps: Map<string, MapDoc>
  // The biomes API (the admin's catalog and each project's own biomes).
  readonly biomes: ReturnType<typeof createMockMapBiomes>
  // The shape libraries (the admin's default shapes and My shapes).
  readonly shapes: ReturnType<typeof createMockMapShapes>
  calls: string[]
  // The requests of one verb, in order.
  of(method: string): string[]
  failNext(path: string, status: number, detail: unknown): void
}

export function mapsBackend(initial: MapDoc[] = []): MapsBackend {
  const mock = createMockMaps(initial)
  const biomes = createMockMapBiomes()
  const shapes = createMockMapShapes()
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
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    if (parts[0] === 'map-biomes') { const answer = biomes.route(method, parts.slice(1), body); return reply(answer.status, answer.body) }
    if (parts[0] === 'map-shapes') { const answer = shapes.route(method, parts.slice(1), body); return reply(answer.status, answer.body) }
    if (parts[0] === 'my-map-shapes') { const answer = shapes.myRoute(method, parts.slice(1), body); return reply(answer.status, answer.body) }
    if (parts[0] === 'projects' && parts[2] === 'map-biomes') { const answer = biomes.projectRoute(parts[1], method, body); return reply(answer.status, answer.body) }
    // /projects/{id}/maps[/{mapId}]; anything else the page asks for (settings) is answered with an empty document.
    if (parts[0] !== 'projects' || parts[2] !== 'maps') return reply(200, {})
    const answer = mock.route(method, parts.slice(3), body)
    return reply(answer.status, answer.body)
  })
  vi.stubGlobal('fetch', fn)

  return {
    fetch: fn, calls,
    get maps() { return mock.maps },
    biomes,
    shapes,
    of: method => calls.filter(c => c.startsWith(`${method} `)),
    failNext: (path, status, detail) => { failures.set(path, { status, detail }) },
  }
}
