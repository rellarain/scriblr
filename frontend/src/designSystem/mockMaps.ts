import type { MapBase, MapCreate, MapDoc, MapKind, MapLevel, MapPlace, MapShape, MapSummary, MapSymbol, MapUnits } from '../api/types'
import { MAP_MAX_SIDE } from '../api/types'
import { defaultsFor } from '../assets/Interfaces/writer/maps/mapLevels'
import { shapeFromLibrary } from '../assets/Interfaces/writer/maps/mapLibrary'
import { starterShapes } from '../assets/Interfaces/writer/maps/mapShapeSeed'
import { placeOn } from '../assets/Interfaces/writer/maps/mapOrbits'
import type { MockAnswer } from './mockPresets'

// A pretend Maps API (`/api/projects/{id}/maps`), shared by the design system's previews (mockBackend.ts) and the tests (test/mapsBackend.ts): the
// maps live in memory and answer the way the server does (a new map is a map of levels and biome shapes: the level's base and the five layers; a save keeps
// the old painted cells of a traced map as they were stored; the maps inside a deleted map move up). A route returns its status and JSON body.

const ok = (body: unknown, status = 200): MockAnswer => ({ status, body })
const fail = (status: number, detail: string): MockAnswer => ({ status, body: { detail } })
const AT = '2026-11-02T12:00:00.000Z'

const LAYERS: Array<[string, string]> = [['terrain', 'Biomes'], ['shapes', 'Regions and lines'], ['symbols', 'Markers'], ['labels', 'Labels'], ['notes', 'Notes']]

// A symbol of an old map file as the marker the server turns it into (the starter marker of its kind, in its square, with its id, colour, name and maps).
let markers: Map<string, ReturnType<typeof starterShapes>[number]> | null = null
export function markerOf(sym: Pick<MapSymbol, 'id' | 'layerId' | 'kind' | 'x' | 'y' | 'size' | 'color' | 'name' | 'mapIds'>): MapShape {
  markers ??= new Map(starterShapes().filter(s => s.category === 'marker').map(s => [s.id, s]))
  const lib = markers.get(`marker:${sym.kind}`) ?? markers.get('marker:place')!
  const half = sym.size / 2
  return { ...shapeFromLibrary(lib, { x0: sym.x - half, y0: sym.y - half, x1: sym.x + half, y1: sym.y + half }, sym.id, sym.layerId, 'metric'), fill: sym.color, name: sym.name ?? '', mapIds: [...(sym.mapIds ?? [])] }
}
// The level of a map from before levels (the server's LEVEL_OF_KIND).
const LEVEL_OF_KIND: Record<string, MapLevel> = { world: 'planetary', town: 'local', interior: 'interior' }
// The kind a level's map is stored with (for a client from before levels), as the server's MAP_LEVEL_DEFAULTS.
const KIND_OF: Record<MapLevel, MapKind> = {
  intergalactic: 'world', galactic: 'world', planetary: 'world', continental: 'world', national: 'world', regional: 'world', local: 'town', architectural: 'interior', interior: 'interior',
}

const side = (n: number | undefined, fallback: number) => Math.min(MAP_MAX_SIDE, Math.max(1, Math.round(n ?? fallback)))

export function summaryOf(m: MapDoc): MapSummary {
  return { id: m.id, title: m.title, kind: m.kind, level: m.level, parentId: m.parentId, order: m.order, width: m.width, height: m.height, updatedAt: m.updatedAt, versionOf: m.versionOf ?? null, appliesFrom: m.appliesFrom ?? null, floor: m.floor ?? null }
}

export function newMap(id: string, body: MapCreate, order: number): MapDoc {
  const level: MapLevel = body.level ?? 'planetary'
  const units: MapUnits = body.units ?? 'metric'
  const width = side(body.width, 32), height = side(body.height, 24)
  const base: MapBase = body.base ?? defaultsFor(level, units === 'imperial' ? 'imperial' : 'metric').base
  return {
    schemaVersion: 2, id, title: body.title?.trim() || 'Untitled map', level, mapFormat: 3, base, units, kind: KIND_OF[level], parentId: body.parentId ?? null, order, width, height,
    cellSize: body.cellSize ?? 1, unit: body.unit?.trim() || 'cells', pace: null,
    layers: LAYERS.map(([lid, name]) => ({ id: lid, name, kind: lid as MapDoc['layers'][number]['kind'], visible: true, locked: false })),
    labels: [], shapes: [], scaleBar: true, compass: true, legend: false, updatedAt: AT,
  }
}

// The places of a map: its named regions, markers and biome areas (as the server's named_places; a marker's kind is its marker's).
const namedShapes = (m: MapDoc) => m.shapes.filter(s => s.type !== 'line' && s.name)
const placeKind = (s: MapShape) => (s.kind?.startsWith('marker:') ? s.kind.slice('marker:'.length) : 'area')

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
      .flatMap(m => namedShapes(m).map(sh => ({ id: sh.id, name: sh.name ?? '', kind: placeKind(sh), mapIds: sh.mapIds ?? [] })).map(p => ({ key: `${m.id}/${p.id}`, mapId: m.id, placeId: p.id, name: p.name, path: [...titles(m.id), p.name].join(' > '), kind: p.kind, mapTitle: m.title, mapIds: [...p.mapIds] })))
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
        // A floor of a building keeps its place among the floors (as the server's floor field).
        if (b.floor) doc.floor = { order: Math.round(Math.min(20, Math.max(-3, b.floor.order))), name: (b.floor.name ?? '').trim().slice(0, 40) }
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
      const keepLink = (x: string) => maps.has(x) && x !== id
      // The symbols of an old map file become markers, as the server makes them.
      const fromSymbols = (b.symbols ?? []).map(sy => markerOf(sy))
      const shapes = [...(b.shapes ?? []), ...fromSymbols].map(sh => (sh.type === 'line' ? sh : { ...sh, mapIds: (sh.mapIds ?? []).filter(keepLink) }))
      // A map of painted cells (an old map file) becomes a map of levels (the server traces its cells into biome shapes; this pretend one keeps them aside).
      // Otherwise the old painted cells, palette, kind and look of a traced map stay as they were stored.
      const level: MapLevel = b.level ?? LEVEL_OF_KIND[b.kind ?? 'world'] ?? found.level
      const old = (b.mapFormat ?? 1) < 2
      const legacy = old
        ? { kind: b.kind, theme: b.theme, terrains: b.terrains, cells: b.cells, legacyGrid: [b.width, b.height], base: b.base ?? defaultsFor(level, b.units === 'imperial' ? 'imperial' : 'metric').base, units: b.units ?? 'custom' as MapUnits }
        : { kind: found.kind, theme: found.theme, terrains: found.terrains, cells: found.cells, legacyGrid: found.legacyGrid }
      const saved: MapDoc = { ...b, ...legacy, level, mapFormat: 3, shapes, title: b.title.trim() || 'Untitled map', updatedAt: AT }
      delete saved.symbols
      maps.set(id, saved)
      return ok(saved)
    }
    if (method === 'DELETE') {
      if (!found) return fail(404, 'Map not found')
      maps.delete(id)
      for (const v of [...maps.values()]) if (v.versionOf === id) maps.delete(v.id)
      for (const m of maps.values()) {
        if (m.parentId === id) m.parentId = found.parentId
        for (const sh of m.shapes) if (sh.mapIds) sh.mapIds = sh.mapIds.filter(x => x !== id)
      }
      return { status: 204, body: undefined }
    }
    return fail(405, 'Method not allowed')
  }

  return { route, get maps() { return maps } }
}

// The points of an ellipse (a smooth outline), for the seed's biome areas; `wobble` pushes every other point in or out a little so it reads as land.
function ellipse(cx: number, cy: number, rx: number, ry: number, n = 12, wobble = 0.08): Array<[number, number]> {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    const k = 1 + (i % 2 === 0 ? wobble : -wobble)
    return [Math.round((cx + Math.cos(a) * rx * k) * 100) / 100, Math.round((cy + Math.sin(a) * ry * k) * 100) / 100]
  })
}

function biomeArea(id: string, points: Array<[number, number]>, biome: string | null, over: Partial<MapShape> = {}): MapShape {
  return {
    id, layerId: 'terrain', type: 'biome', style: 'solid', color: null, width: 0.25, fill: null, opacity: 1, pattern: 'solid', biome, heightMode: 'none', height: 0, name: '', mapIds: [],
    points: points.map(([x, y]) => ({ x, y, smooth: true, hx: null, hy: null })), ...over,
  }
}

// The maps a preview opens with: a continent in a sea (plains, a forest on hills, a lake, a rocky range raised high), inside it a town, and a star system.
export function seedMaps(): MapDoc[] {
  const world = newMap('map_world', { title: 'The Known World', level: 'continental', units: 'imperial', width: 28, height: 18, cellSize: 20, unit: 'mi', base: { biome: 'saltwater', height: -650 } }, 0)
  world.legend = true
  world.relief = true
  world.contours = true
  world.pace = 25
  const stamp = (id: string, kind: string, x: number, y: number, size = 2, name = '', mapIds: string[] = []) => markerOf({ id, layerId: 'symbols', kind, x, y, size, color: null, name, mapIds })
  const placed = [
    stamp('sym_a', 'city', 11.5, 8.5, 2.5, 'Port Veyra', ['map_town']), stamp('sym_b', 'castle', 7.5, 6.5), stamp('sym_g', 'harbour', 4.5, 9.5), stamp('sym_h', 'ship', 3.5, 13.5, 1.5),
  ]
  world.labels = [
    { id: 'lbl_c', layerId: 'labels', text: 'Sea of Glass', x: 4.5, y: 3.2, size: 1.3 },
  ]
  const pt = (x: number, y: number, smooth = true) => ({ x, y, smooth, hx: null, hy: null })
  const shape = (id: string, type: 'line' | 'region', points: ReturnType<typeof pt>[], over: Partial<MapShape> = {}): MapShape =>
    ({ id, layerId: 'shapes', type, points, style: 'solid', color: null, width: 0.25, fill: null, opacity: 0.35, pattern: 'solid', ...over })
  world.shapes = [
    // The land, back to front: later areas lie over earlier ones.
    biomeArea('bio_land', ellipse(11, 9, 9.2, 6.6, 14), 'plain'),
    biomeArea('bio_beach', ellipse(4.6, 10.4, 1.6, 2.4, 10), 'beach'),
    biomeArea('bio_forest', ellipse(13, 11.6, 5.2, 3.2, 12), 'forest', { name: 'Greenwood' }),
    // Hills under the forest: no biome of their own (the forest stays green), only higher, so lighter.
    biomeArea('bio_hills', ellipse(14.5, 12.4, 2.4, 1.5, 10), null, { heightMode: 'raise', height: 4000, profile: 'hill' }),
    biomeArea('bio_lake', ellipse(8, 9.5, 1.3, 0.9, 10, 0.04), 'freshwater', { name: 'Mirror Lake' }),
    biomeArea('bio_spine', ellipse(22, 5, 3.6, 3, 12), 'rocky', { name: 'The Spine', heightMode: 'raise', height: 6500, profile: 'peak' }),
    biomeArea('bio_peak', ellipse(22.3, 4.6, 1.4, 1.1, 10), 'tundra', { heightMode: 'raise', height: 4000, profile: 'hill' }),
    // Two nations: their borders and names over the land, filled in the Nations view.
    shape('shp_veyra', 'region', [pt(3.6, 8, true), pt(6.5, 4.6, true), pt(10.5, 3.4, true), pt(13.2, 3.6, false), pt(13.8, 8.6, false), pt(11.6, 14.6, false), pt(7, 14.2, true), pt(4, 11.6, true)],
      { name: 'Kingdom of Veyra', political: 'nation', color: '#7a3b2e', fill: '#d98c6a', opacity: 0.6, width: 0.14 }),
    shape('shp_holds', 'region', [pt(13.2, 3.6, false), pt(17, 3, true), pt(21.5, 2.4, true), pt(24.8, 4.6, true), pt(23.5, 8, true), pt(19.5, 13.4, true), pt(15, 15, true), pt(11.6, 14.6, false), pt(13.8, 8.6, false)],
      { name: 'The Spine Holds', political: 'nation', color: '#7a3b2e', fill: '#7fa8d9', opacity: 0.6, width: 0.14 }),
    shape('shp_a', 'region', [pt(14, 11.5, false), pt(17.5, 10.5, false), pt(19, 13.5, false), pt(15.5, 15, false)], { fill: '#4f8a4a', opacity: 0.4, pattern: 'dots', color: '#2f5f2c', width: 0.15 }),
    shape('shp_b', 'line', [pt(22, 5), pt(19.5, 7.5), pt(17, 8), pt(14, 7.5), pt(11.5, 9.5), pt(9, 9)], { color: '#3b6ea5', width: 0.35 }),
    shape('shp_c', 'line', [pt(11.5, 8.5), pt(13, 10), pt(15, 10.5), pt(17.5, 9)], { style: 'road', color: '#6b4a2b', width: 0.3 }),
    shape('shp_d', 'line', [pt(3, 2, false), pt(8, 4.5, false), pt(6.5, 8, false)], { style: 'dashed', width: 0.16 }),
    // The markers: a city, a castle, a harbour and a ship.
    ...placed,
  ]
  // The Spine's crags: a rough edge.
  world.shapes = world.shapes.map(s => (s.id === 'bio_spine' ? { ...s, rough: 45, seed: 7 } : s))
  const town = newMap('map_town', { title: 'Port Veyra', level: 'local', units: 'imperial', width: 24, height: 16, cellSize: 30, unit: 'ft', parentId: 'map_world' }, 0)
  town.shapes = [
    biomeArea('bio_harbour', [[0, 9], [8, 10], [12, 16], [0, 16]], 'saltwater'),
    biomeArea('bio_square', [[10, 4], [16, 4], [16, 9], [10, 9]], 'paving', { name: 'Market Square' }),
    biomeArea('bio_park', ellipse(19.5, 11.5, 3, 2.4, 10), 'forest', { name: 'Lantern Park' }),
  ].map(s => ({ ...s, points: s.points.map(p => ({ ...p, smooth: s.id === 'bio_park' })) }))
  // A star system (galactic): a yellow star, two orbits with a planet on each (Veyra, the garden world the Known World is of, and a gas giant), a nebula
  // and a trade route.
  const system = newMap('map_system', { title: 'The Aster System', level: 'galactic', width: 32, height: 22 }, 1)
  const orbit = (id: string, rx: number, ry: number, turn: number): MapShape & { ellipse: NonNullable<MapShape['ellipse']> } =>
    ({ id, layerId: 'shapes', type: 'orbit', points: [], ellipse: { cx: 16, cy: 11, rx, ry, turn }, style: 'dashed', color: null, width: 0.06, fill: null, opacity: 1, pattern: 'solid' })
  const inner = orbit('orb_inner', 5.5, 4.2, 0), outer = orbit('orb_outer', 11, 8, 12)
  const body = (id: string, r: number, biome: string, over: Partial<MapShape> = {}) => biomeArea(id, ellipse(0, 0, r, r, 10, 0), biome, over)
  const shapes: MapShape[] = [
    body('bio_aster', 1.6, 'star_yellow', { name: 'Aster' }),
    inner, outer,
    placeOn(body('bio_veyra', 0.8, 'planet_garden', { name: 'Veyra', mapIds: ['map_world'] }), inner, 205, 32, 22),
    placeOn(body('bio_tharos', 1.3, 'planet_gas_giant', { name: 'Tharos' }), outer, 330, 32, 22),
    { id: 'shp_nebula', layerId: 'shapes', type: 'region', points: ellipse(5, 5, 3.6, 2.6, 10, 0.12).map(([x, y]) => ({ x, y, smooth: true, hx: null, hy: null })),
      style: 'dotted', color: '#b48ce0', width: 0.06, fill: '#9a5fd0', opacity: 0.4, pattern: 'glow', rough: 60, seed: 3, name: 'The Veil', mapIds: [] },
    { id: 'shp_route', layerId: 'shapes', type: 'line', points: [[16, 11], [22, 15], [30, 19]].map(([x, y]) => ({ x, y, smooth: true, hx: null, hy: null })),
      style: 'dashed', color: '#9fc4ff', width: 0.08, fill: null, opacity: 0.35, pattern: 'solid' },
  ]
  // The star at the middle of the map.
  system.shapes = shapes.map((s, i) => (i === 0 ? { ...s, points: s.points.map(p => ({ ...p, x: p.x + 16, y: p.y + 11 })) } : s))
  // A building in Port Veyra (architectural): its plot, and two floors; the ground floor has walls on the cell edges with a door and windows, and rooms.
  const inn = newMap('map_inn', { title: 'The Lantern Inn', level: 'architectural', width: 16, height: 12, parentId: 'map_town' }, 0)
  const corner = (x: number, y: number) => ({ x, y, smooth: false, hx: null, hy: null })
  const wall = (id: string, pts: Array<[number, number]>, openings: MapShape['openings'] = []): MapShape =>
    ({ id, layerId: 'shapes', type: 'line', points: pts.map(([x, y]) => corner(x, y)), style: 'wall', color: null, width: 0.22, fill: null, opacity: 0.35, pattern: 'solid', openings })
  const room = (id: string, name: string, pts: Array<[number, number]>, biome: string) => biomeArea(id, pts, biome, { name, points: pts.map(([x, y]) => corner(x, y)) })
  inn.shapes = [room('bio_innplot', '', [[2, 2], [14, 2], [14, 10], [2, 10]], 'wood'), wall('shp_innwalls', [[2, 2], [14, 2], [14, 10], [2, 10], [2, 2]])]
  const ground = newMap('map_inn_0', { title: 'The Lantern Inn: Ground floor', level: 'architectural', width: 16, height: 12, parentId: 'map_inn' }, 0)
  ground.floor = { order: 0, name: '' }
  ground.shapes = [
    room('bio_common', 'Common room', [[2, 2], [10, 2], [10, 10], [2, 10]], 'wood'),
    room('bio_kitchen', 'Kitchen', [[10, 2], [14, 2], [14, 10], [10, 10]], 'tile'),
    wall('shp_outer', [[2, 2], [14, 2], [14, 10], [2, 10], [2, 2]], [
      { id: 'opn_door', seg: 2, t: 0.75, width: 1.2, kind: 'door', flip: true },
      { id: 'opn_w1', seg: 0, t: 0.25, width: 1.5, kind: 'window', flip: false },
      { id: 'opn_w2', seg: 0, t: 0.6, width: 1.5, kind: 'window', flip: false },
    ]),
    wall('shp_inner', [[10, 2], [10, 10]], [{ id: 'opn_arch', seg: 0, t: 0.5, width: 1.5, kind: 'arch', flip: false }]),
  ]
  const upper = newMap('map_inn_1', { title: 'The Lantern Inn: Floor 1', level: 'architectural', width: 16, height: 12, parentId: 'map_inn' }, 1)
  upper.floor = { order: 1, name: 'Guest rooms' }
  upper.shapes = [room('bio_rooms', 'Guest rooms', [[2, 2], [14, 2], [14, 10], [2, 10]], 'carpet'), wall('shp_upper', [[2, 2], [14, 2], [14, 10], [2, 10], [2, 2]])]
  return [world, town, system, inn, ground, upper]
}
