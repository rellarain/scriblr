import type { MapCreate, MapDoc, MapKind, MapSummary } from '../api/types'
import { MAP_MAX_SIDE } from '../api/types'
import type { MockAnswer } from './mockPresets'

// A pretend Maps API (`/api/projects/{id}/maps`), shared by the design system's previews (mockBackend.ts) and the tests (test/mapsBackend.ts): the
// maps live in memory and answer the way the server does (the terrain set of the kind, the five layers, the cells coded as runs that cover the grid,
// the maps inside a deleted map moved up). A route returns its status and JSON body.

const ok = (body: unknown, status = 200): MockAnswer => ({ status, body })
const fail = (status: number, detail: string): MockAnswer => ({ status, body: { detail } })
const AT = '2026-11-02T12:00:00.000Z'

const SETS: Record<MapKind, Array<[string, string, string]>> = {
  world: [
    ['ocean', 'Ocean', '#3b6ea5'], ['plains', 'Plains', '#a8c66c'], ['forest', 'Forest', '#4f8a4a'], ['hills', 'Hills', '#c9a36a'],
    ['mountains', 'Mountains', '#8a8f98'], ['desert', 'Desert', '#e3c77a'], ['snow', 'Snow', '#eef3f7'], ['swamp', 'Swamp', '#5f7d62'],
  ],
  town: [['ground', 'Ground', '#d8cfb4'], ['road', 'Road', '#8a8076'], ['building', 'Building', '#b5654a'], ['park', 'Park', '#7fb069'], ['water', 'Water', '#4a86b8']],
  interior: [['void', 'Outside', '#2a2330'], ['floor', 'Floor', '#d9c8a8'], ['wall', 'Wall', '#5a4a42'], ['door', 'Door', '#9a6a3a'], ['water', 'Water', '#4a86b8']],
}
const LAYERS: Array<[string, string]> = [['terrain', 'Terrain'], ['shapes', 'Regions and lines'], ['symbols', 'Symbols'], ['labels', 'Labels'], ['notes', 'Notes']]

const side = (n: number | undefined, fallback: number) => Math.min(MAP_MAX_SIDE, Math.max(1, Math.round(n ?? fallback)))

export function summaryOf(m: MapDoc): MapSummary {
  return { id: m.id, title: m.title, kind: m.kind, parentId: m.parentId, order: m.order, width: m.width, height: m.height, updatedAt: m.updatedAt }
}

export function newMap(id: string, body: MapCreate, order: number): MapDoc {
  const kind = body.kind ?? 'world'
  const width = side(body.width, 32), height = side(body.height, 24)
  return {
    schemaVersion: 2, id, title: body.title?.trim() || 'Untitled map', kind, parentId: body.parentId ?? null, order, width, height,
    cellSize: body.cellSize ?? 1, unit: body.unit?.trim() || 'cells',
    terrains: SETS[kind].map(([tid, name, color]) => ({ id: tid, name, color, builtIn: true })),
    layers: LAYERS.map(([lid, name]) => ({ id: lid, name, kind: lid as MapDoc['layers'][number]['kind'], visible: true, locked: false })),
    cells: [0, width * height], updatedAt: AT,
  }
}

// Runs that cover exactly `total` cells (a surplus cut, a shortfall the first terrain), neighbours of one terrain joined.
function repairRuns(runs: number[], total: number, terrains: number): number[] {
  const out: number[] = []
  let left = total
  const push = (v: number, n: number) => { if (out.length > 0 && out[out.length - 2] === v) out[out.length - 1] += n; else out.push(v, n) }
  for (let i = 0; i + 1 < runs.length && left > 0; i += 2) {
    const v = runs[i], n = runs[i + 1]
    if (!Number.isInteger(v) || !Number.isInteger(n) || v < 0 || n < 1) continue
    const take = Math.min(n, left)
    push(v < terrains ? v : 0, take)
    left -= take
  }
  if (left > 0) push(0, left)
  return out
}

export function createMockMaps(initial: MapDoc[] = []) {
  const maps = new Map<string, MapDoc>(initial.map(m => [m.id, m]))
  let next = initial.length + 1

  function route(method: string, rest: string[], body: unknown): MockAnswer {
    if (rest.length === 0) {
      if (method === 'GET') return ok([...maps.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)).map(summaryOf))
      if (method === 'POST') {
        const b = (body ?? {}) as MapCreate
        if (b.parentId && !maps.has(b.parentId)) return fail(422, 'The map it is inside does not exist.')
        if ((b.width ?? 0) > MAP_MAX_SIDE || (b.height ?? 0) > MAP_MAX_SIDE) return fail(422, 'Too large.')
        const siblings = [...maps.values()].filter(m => m.parentId === (b.parentId ?? null))
        const doc = newMap(`map_mock${next++}`, b, siblings.length)
        maps.set(doc.id, doc)
        return ok(doc, 201)
      }
      return fail(405, 'Method not allowed')
    }
    const id = rest[0]
    const found = maps.get(id)
    if (method === 'GET') return found ? ok(found) : fail(404, 'Map not found')
    if (method === 'PUT') {
      if (!found) return fail(404, 'Map not found')
      const b = body as MapDoc
      if (b.id !== id) return fail(422, 'The id does not match.')
      const terrains = b.terrains.length > 0 ? b.terrains : found.terrains
      const saved: MapDoc = { ...b, terrains, title: b.title.trim() || 'Untitled map', cells: repairRuns(b.cells, b.width * b.height, terrains.length), updatedAt: AT }
      maps.set(id, saved)
      return ok(saved)
    }
    if (method === 'DELETE') {
      if (!found) return fail(404, 'Map not found')
      maps.delete(id)
      for (const m of maps.values()) if (m.parentId === id) m.parentId = found.parentId
      return { status: 204, body: undefined }
    }
    return fail(405, 'Method not allowed')
  }

  return { route, get maps() { return maps } }
}

// The maps a preview opens with: a painted world and, inside it, a town. (A coast and two hills of land in an ocean, a forest, a range of mountains.)
export function seedMaps(): MapDoc[] {
  const world = newMap('map_world', { title: 'The Known World', kind: 'world', width: 28, height: 18, cellSize: 20, unit: 'miles' }, 0)
  const rows: number[][] = []
  for (let y = 0; y < 18; y += 1) {
    const row = new Array<number>(28).fill(0)
    for (let x = 0; x < 28; x += 1) {
      const dx = (x - 11) / 9, dy = (y - 9) / 6.5
      const d = dx * dx + dy * dy
      if (d < 1) row[x] = d < 0.35 ? 3 : d < 0.6 ? 2 : 1
      const ex = (x - 22) / 3.5, ey = (y - 5) / 3
      if (ex * ex + ey * ey < 1) row[x] = ex * ex + ey * ey < 0.4 ? 4 : 1
    }
    rows.push(row)
  }
  const flat = rows.flat()
  const cells: number[] = []
  for (const v of flat) { if (cells.length > 0 && cells[cells.length - 2] === v) cells[cells.length - 1] += 1; else cells.push(v, 1) }
  world.cells = cells
  const town = newMap('map_town', { title: 'Port Veyra', kind: 'town', width: 24, height: 16, cellSize: 10, unit: 'paces', parentId: 'map_world' }, 0)
  return [world, town]
}
