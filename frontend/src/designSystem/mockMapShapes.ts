import type { MapLibraryShape, MapShapeCatalog, MyMapShape, PublishedMapShapes } from '../api/types'
import { MAP_MAX_MY_SHAPES } from '../api/types'
import { starterShapes } from '../assets/Interfaces/writer/maps/mapShapeSeed'
import type { MockAnswer } from './mockPresets'

// A pretend map shapes API, shared by the design system's previews (mockBackend.ts) and the tests: the admin's default shapes (`/api/map-shapes`: one draft,
// published as a whole with its earlier versions) and My shapes (`/api/my-map-shapes`). Answers the way the server does (map_shapes_store.py).

const ok = (body: unknown, status = 200): MockAnswer => ({ status, body })
const fail = (status: number, detail: string): MockAnswer => ({ status, body: { detail } })
const AT = '2026-11-02T12:00:00.000Z'
const HISTORY_MAX = 20

const copy = <T extends MapLibraryShape>(list: T[]): T[] => JSON.parse(JSON.stringify(list)) as T[]

// What stops the draft being published (the server's publish_faults, same words).
export function shapePublishFaults(shapes: MapLibraryShape[]): string[] {
  const faults: string[] = []
  const names = new Set<string>()
  for (const s of shapes) {
    const key = `${s.category}/${s.name.toLowerCase()}`
    if (names.has(key)) faults.push(`Two shapes of one category are called ${s.name}.`)
    names.add(key)
  }
  return faults
}

export function createMockMapShapes(initial: { catalog?: Partial<MapShapeCatalog>; mine?: MyMapShape[] } = {}) {
  const starter = starterShapes()
  const published: PublishedMapShapes = { version: 1, publishedAt: AT, shapes: copy(starter) }
  let catalog: MapShapeCatalog = { schemaVersion: 1, seedVersion: 1, draft: copy(starter), published, history: [], nextVersion: 2, ...initial.catalog }
  let mine: MyMapShape[] = copy(initial.mine ?? [])
  let next = 1

  // /api/map-shapes[/...]
  function route(method: string, rest: string[], body: unknown): MockAnswer {
    if (rest.length === 0) {
      if (method === 'GET') return ok(catalog)
      if (method === 'PUT') { catalog = { ...catalog, draft: copy((body as { shapes?: MapLibraryShape[] } | undefined)?.shapes ?? []) }; return ok(catalog) }
      return fail(405, 'Method not allowed')
    }
    if (rest[0] === 'published' && method === 'GET') return ok({ shapes: catalog.published ? catalog.published.shapes : copy(starter) })
    if (rest[0] === 'publish' && method === 'POST') {
      const faults = shapePublishFaults(catalog.draft)
      if (faults.length > 0) return fail(422, faults.join(' '))
      const history = catalog.published ? [catalog.published, ...catalog.history].slice(0, HISTORY_MAX) : catalog.history
      catalog = { ...catalog, history, published: { version: catalog.nextVersion, publishedAt: AT, shapes: copy(catalog.draft) }, nextVersion: catalog.nextVersion + 1 }
      return ok(catalog)
    }
    if (rest[0] === 'discard' && method === 'POST') { catalog = { ...catalog, draft: copy(catalog.published ? catalog.published.shapes : starter) }; return ok(catalog) }
    if (rest[0] === 'restore' && method === 'POST') {
      const version = Number(rest[1])
      const found = [...(catalog.published ? [catalog.published] : []), ...catalog.history].find(v => v.version === version)
      if (!found) return fail(404, `the shape library has no version ${version}`)
      catalog = { ...catalog, draft: copy(found.shapes) }
      return ok(catalog)
    }
    return fail(405, 'Method not allowed')
  }

  // /api/my-map-shapes[/{id}]
  function myRoute(method: string, rest: string[], body: unknown): MockAnswer {
    if (rest.length === 0) {
      if (method === 'GET') return ok({ shapes: mine })
      if (method === 'POST') {
        if (mine.length >= MAP_MAX_MY_SHAPES) return fail(422, `My shapes holds at most ${MAP_MAX_MY_SHAPES} shapes`)
        const b = (body ?? {}) as { shape: MapLibraryShape; projectId?: string; projectTitle?: string }
        const made: MyMapShape = { ...copy([b.shape])[0], id: `my_mock${next++}`, projectId: b.projectId ?? '', projectTitle: (b.projectTitle ?? '').trim(), savedAt: AT }
        mine = [...mine, made]
        return ok(made, 201)
      }
      return fail(405, 'Method not allowed')
    }
    const found = mine.find(s => s.id === rest[0])
    if (!found) return fail(404, 'no such shape among My shapes')
    if (method === 'PATCH') {
      const name = ((body as { name?: string } | undefined)?.name ?? '').trim().slice(0, 60)
      const changed = { ...found, name: name || found.name }
      mine = mine.map(s => (s.id === found.id ? changed : s))
      return ok(changed)
    }
    if (method === 'DELETE') { mine = mine.filter(s => s.id !== found.id); return { status: 204, body: undefined } }
    return fail(405, 'Method not allowed')
  }

  return { route, myRoute, get catalog() { return catalog }, get mine() { return mine } }
}
