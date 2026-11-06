import type { MapCreate, MapDoc, MapKind, MapPlace, MapShape, MapSummary } from '../api/types'
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
  return { id: m.id, title: m.title, kind: m.kind, parentId: m.parentId, order: m.order, width: m.width, height: m.height, updatedAt: m.updatedAt, versionOf: m.versionOf ?? null, appliesFrom: m.appliesFrom ?? null }
}

export function newMap(id: string, body: MapCreate, order: number): MapDoc {
  const kind = body.kind ?? 'world'
  const width = side(body.width, 32), height = side(body.height, 24)
  return {
    schemaVersion: 2, id, title: body.title?.trim() || 'Untitled map', kind, parentId: body.parentId ?? null, order, width, height,
    cellSize: body.cellSize ?? 1, unit: body.unit?.trim() || 'cells', pace: null,
    terrains: SETS[kind].map(([tid, name, color]) => ({ id: tid, name, color, builtIn: true })),
    layers: LAYERS.map(([lid, name]) => ({ id: lid, name, kind: lid as MapDoc['layers'][number]['kind'], visible: true, locked: false })),
    cells: [0, width * height], symbols: [], labels: [], shapes: [], theme: body.theme ?? 'modern', scaleBar: true, compass: true, legend: false, updatedAt: AT,
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

  // The places of every map, as the server lists them (the maps a map is inside, outermost first, then the place).
  function places(): MapPlace[] {
    const titles = (id: string): string[] => {
      const out: string[] = []
      for (let cur: string | null = id, n = 0; cur && maps.has(cur) && n < 50; cur = maps.get(cur)!.parentId, n += 1) out.unshift(maps.get(cur)!.title)
      return out
    }
    return [...maps.values()].filter(m => !m.versionOf)
      .flatMap(m => m.symbols.filter(sy => sy.name).map(sy => ({
        key: `${m.id}/${sy.id}`, mapId: m.id, placeId: sy.id, name: sy.name, path: [...titles(m.id), sy.name].join(' > '), kind: sy.kind, mapTitle: m.title, mapIds: [...sy.mapIds],
      })))
      .sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()) || a.key.localeCompare(b.key))
  }

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
    if (rest[0] === 'places' && rest[1] === 'all' && method === 'GET') return ok(places())
    if (rest[1] === 'versions' && method === 'POST') {
      const source = maps.get(rest[0])
      if (!source) return fail(404, 'Map not found')
      const b = (body ?? {}) as { title?: string; appliesFrom?: string | null }
      const baseId = source.versionOf ?? source.id
      const made = [...maps.values()].filter(m => m.versionOf === baseId)
      if (made.length >= 12) return fail(422, 'Too many versions.')
      const doc: MapDoc = { ...JSON.parse(JSON.stringify(source)) as MapDoc, id: `map_mock${next++}`, title: (b.title ?? '').trim() || `${maps.get(baseId)!.title}, later`, versionOf: baseId, appliesFrom: b.appliesFrom || null, parentId: null, order: made.length, reader: { published: false, revealAt: null, reveals: {}, fields: [] }, updatedAt: AT }
      maps.set(doc.id, doc)
      return ok(doc, 201)
    }
    const id = rest[0]
    const found = maps.get(id)
    if (method === 'GET') return found ? ok(found) : fail(404, 'Map not found')
    if (method === 'PUT') {
      if (!found) return fail(404, 'Map not found')
      const b = body as MapDoc
      if (b.id !== id) return fail(422, 'The id does not match.')
      const terrains = b.terrains.length > 0 ? b.terrains : found.terrains
      const symbols = (b.symbols ?? []).map(sy => ({ ...sy, name: sy.name ?? '', mapIds: (sy.mapIds ?? []).filter(x => maps.has(x) && x !== id) }))
      const saved: MapDoc = { ...b, symbols, terrains, title: b.title.trim() || 'Untitled map', cells: repairRuns(b.cells, b.width * b.height, terrains.length), updatedAt: AT }
      maps.set(id, saved)
      return ok(saved)
    }
    if (method === 'DELETE') {
      if (!found) return fail(404, 'Map not found')
      maps.delete(id)
      for (const v of [...maps.values()]) if (v.versionOf === id) maps.delete(v.id)
      for (const m of maps.values()) {
        if (m.parentId === id) m.parentId = found.parentId
        for (const sym of m.symbols) sym.mapIds = (sym.mapIds ?? []).filter(x => x !== id)
      }
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
  world.theme = 'parchment'
  world.legend = true
  world.pace = 25
  const stamp = (id: string, kind: string, x: number, y: number, size = 2, name = '', mapIds: string[] = []) => ({ id, layerId: 'symbols', kind, x, y, size, color: null, name, mapIds })
  world.symbols = [
    stamp('sym_a', 'city', 11.5, 8.5, 2.5, 'Port Veyra', ['map_town']), stamp('sym_b', 'castle', 7.5, 6.5), stamp('sym_c', 'mountain', 22.5, 4.5, 3), stamp('sym_d', 'mountain', 20.5, 6.5, 2),
    stamp('sym_e', 'tree', 9.5, 11.5, 1.5), stamp('sym_f', 'pine', 13.5, 11.5, 1.5), stamp('sym_g', 'harbour', 4.5, 9.5), stamp('sym_h', 'ship', 3.5, 13.5, 1.5),
  ]
  world.labels = [
    { id: 'lbl_a', layerId: 'labels', text: 'Port Veyra', x: 11.5, y: 6.7, size: 1.2 },
    { id: 'lbl_b', layerId: 'labels', text: 'The Spine', x: 21.5, y: 8.8, size: 1.1 },
    { id: 'lbl_c', layerId: 'labels', text: 'Sea of Glass', x: 4.5, y: 3.2, size: 1.3 },
  ]
  const pt = (x: number, y: number, smooth = true) => ({ x, y, smooth, hx: null, hy: null })
  const shape = (id: string, type: 'line' | 'region', points: ReturnType<typeof pt>[], over: Partial<MapShape> = {}): MapShape =>
    ({ id, layerId: 'shapes', type, points, style: 'solid', color: null, width: 0.25, fill: null, opacity: 0.35, pattern: 'solid', ...over })
  world.shapes = [
    shape('shp_a', 'region', [pt(14, 11.5, false), pt(17.5, 10.5, false), pt(19, 13.5, false), pt(15.5, 15, false)], { fill: '#4f8a4a', opacity: 0.4, pattern: 'dots', color: '#2f5f2c', width: 0.15 }),
    shape('shp_b', 'line', [pt(22, 5), pt(19.5, 7.5), pt(17, 8), pt(14, 7.5), pt(11.5, 9.5), pt(9, 9)], { color: '#3b6ea5', width: 0.35 }),
    shape('shp_c', 'line', [pt(11.5, 8.5), pt(13, 10), pt(15, 10.5), pt(17.5, 9)], { style: 'road', color: '#6b4a2b', width: 0.3 }),
    shape('shp_d', 'line', [pt(3, 2, false), pt(8, 4.5, false), pt(6.5, 8, false)], { style: 'dashed', width: 0.16 }),
  ]
  const town = newMap('map_town', { title: 'Port Veyra', kind: 'town', width: 24, height: 16, cellSize: 10, unit: 'paces', parentId: 'map_world' }, 0)
  return [world, town]
}
