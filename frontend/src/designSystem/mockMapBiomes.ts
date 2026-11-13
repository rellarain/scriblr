import type { MapBiome, MapBiomeCatalog, PublishedBiomes } from '../api/types'
import { MAP_MAX_PROJECT_BIOMES } from '../api/types'
import { STARTER_BIOMES } from '../assets/Interfaces/writer/maps/mapBiomes'
import type { MockAnswer } from './mockPresets'

// A pretend biomes API, shared by the design system's previews (mockBackend.ts) and the tests: the admin's list (`/api/map-biomes`: one draft, published as
// a whole with its earlier versions; a published biome taken out of the draft stays published as retired) and each project's own biomes
// (`/api/projects/{id}/map-biomes`: only "own_" ids, at most 64). Answers the way the server does (map_biomes_store.py).

const ok = (body: unknown, status = 200): MockAnswer => ({ status, body })
const fail = (status: number, detail: string): MockAnswer => ({ status, body: { detail } })
const AT = '2026-11-02T12:00:00.000Z'
const HISTORY_MAX = 20

const copy = (list: MapBiome[]): MapBiome[] => list.map(b => ({ ...b, levels: [...b.levels] }))

// What stops the draft being published (the server's publish_faults, same words).
export function biomePublishFaults(biomes: MapBiome[]): string[] {
  const faults: string[] = []
  const names = new Set<string>()
  biomes.forEach((b, i) => {
    if (!b.name.trim()) { faults.push(`Biome ${i + 1} needs a name.`); return }
    const key = b.name.toLowerCase()
    if (names.has(key) && !b.retired) faults.push(`Two biomes are called ${b.name}.`)
    names.add(key)
  })
  return faults
}

export function createMockMapBiomes(initial?: Partial<MapBiomeCatalog>) {
  const published: PublishedBiomes = { version: 1, publishedAt: AT, biomes: copy(STARTER_BIOMES) }
  let catalog: MapBiomeCatalog = { schemaVersion: 1, seedVersion: 1, draft: copy(STARTER_BIOMES), published, history: [], nextVersion: 2, ...initial }
  const own = new Map<string, MapBiome[]>()

  // /api/map-biomes[/...]
  function route(method: string, rest: string[], body: unknown): MockAnswer {
    if (rest.length === 0) {
      if (method === 'GET') return ok(catalog)
      if (method === 'PUT') {
        const list = (body as { biomes?: MapBiome[] } | undefined)?.biomes ?? []
        catalog = { ...catalog, draft: copy(list) }
        return ok(catalog)
      }
      return fail(405, 'Method not allowed')
    }
    if (rest[0] === 'published' && method === 'GET') return ok({ biomes: catalog.published ? catalog.published.biomes : copy(STARTER_BIOMES) })
    if (rest[0] === 'publish' && method === 'POST') {
      const faults = biomePublishFaults(catalog.draft.filter(b => !b.retired))
      if (faults.length > 0) return fail(422, faults.join(' '))
      const biomes = copy(catalog.draft)
      const ids = new Set(biomes.map(b => b.id))
      const history = catalog.published ? [catalog.published, ...catalog.history].slice(0, HISTORY_MAX) : catalog.history
      if (catalog.published) for (const old of catalog.published.biomes) if (!ids.has(old.id)) biomes.push({ ...old, retired: true })
      catalog = { ...catalog, history, published: { version: catalog.nextVersion, publishedAt: AT, biomes }, nextVersion: catalog.nextVersion + 1 }
      return ok(catalog)
    }
    if (rest[0] === 'discard' && method === 'POST') {
      const source = catalog.published ? catalog.published.biomes : STARTER_BIOMES
      catalog = { ...catalog, draft: copy(source.filter(b => !b.retired)) }
      return ok(catalog)
    }
    if (rest[0] === 'restore' && method === 'POST') {
      const version = Number(rest[1])
      const found = [...(catalog.published ? [catalog.published] : []), ...catalog.history].find(v => v.version === version)
      if (!found) return fail(404, `the biome list has no version ${version}`)
      catalog = { ...catalog, draft: copy(found.biomes.filter(b => !b.retired)) }
      return ok(catalog)
    }
    return fail(405, 'Method not allowed')
  }

  // /api/projects/{id}/map-biomes
  function projectRoute(projectId: string, method: string, body: unknown): MockAnswer {
    if (method === 'GET') return ok({ biomes: own.get(projectId) ?? [] })
    if (method === 'PUT') {
      const list = ((body as { biomes?: MapBiome[] } | undefined)?.biomes ?? []).filter(b => typeof b?.id === 'string' && b.id.startsWith('own_'))
      if (list.length > MAP_MAX_PROJECT_BIOMES) return fail(422, `a project has at most ${MAP_MAX_PROJECT_BIOMES} biomes of its own`)
      own.set(projectId, copy(list))
      return ok({ biomes: own.get(projectId) })
    }
    return fail(405, 'Method not allowed')
  }

  return { route, projectRoute, get catalog() { return catalog }, own }
}
