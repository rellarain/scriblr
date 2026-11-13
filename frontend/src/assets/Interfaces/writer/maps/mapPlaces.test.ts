// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { MapDoc, MapSummary } from '../../../../api/types'
import { mapsBackend } from '../../../../test/mapsBackend'
import { markerOf, newMap } from '../../../../designSystem/mockMaps'
import { createMap, createMapVersion, getMap, listMaps, putMap } from '../../../../api/mapsApi'
import { addLibraryShape, addPlaces, editPlace, isPlace, placeKey } from './mapItems'
import { starterShapes } from './mapShapeSeed'
import { MAP_FILE_FORMAT, buildMapFile, importMaps, importRows, mapFileName, parseMapFile, type Choice } from './mapFile'
import { MapHistory, descendantIds, draftOf, mapPath, setPace, setParent, toggleLayer } from './mapModel'
import { EXPORT_SCALES, exportSize, imageFileName, renderMapImage, withLayers } from './mapExport'
import { STARTER_BIOMES, biomeIndex } from './mapBiomes'
import { makeBiomeShape } from './mapShapes'
import type { MapBiome } from '../../../../api/types'
import { measureText, pathLength, travelTime } from './mapView'

const doc = (id: string, over: Partial<MapDoc> = {}): MapDoc => ({ ...newMap(id, { title: id.replace('map_', 'Map '), width: 8, height: 6 }, 0), ...over })
const sum = (m: MapDoc): MapSummary => ({ id: m.id, title: m.title, kind: m.kind, level: m.level, parentId: m.parentId, order: m.order, width: m.width, height: m.height, updatedAt: m.updatedAt })
const ids = (...seed: string[]) => { let n = 0; return () => seed[n++] ?? `x${n}` }
// A town marker (what was a stamped symbol), named or not.
const marker = (id: string, name = '', mapIds: string[] = []) => markerOf({ id, layerId: 'symbols', kind: 'town', x: 2.5, y: 2.5, size: 2, color: null, name, mapIds })
const TOWN = starterShapes().find(s => s.id === 'marker:town')!
const withTown = () => addLibraryShape(draftOf(doc('map_1')), TOWN, { x0: 1, y0: 1, x1: 3, y1: 3 }, 'metric', ids('a'))!.change.draft

describe('places', () => {
  it('a marker or an area is a place when it has a name, and its key is its map and its id', () => {
    expect(isPlace(marker('a'))).toBe(false)
    expect(isPlace(marker('a', 'Port Veyra'))).toBe(true)
    expect(isPlace({ type: 'line', name: 'Road' })).toBe(false)
    expect(placeKey('map_1', 'mrk_a')).toBe('map_1/mrk_a')
  })

  it('gives a marker a name (trimmed, held to its length) and the maps that open from it, each once', () => {
    const d = withTown()
    const ref = { kind: 'shape' as const, id: 'mrk_a' }
    expect(editPlace(d, ref, { name: '  Port Veyra ' })!.draft.shapes[0].name).toBe('Port Veyra')
    expect(editPlace(d, ref, { name: 'x'.repeat(200) })!.draft.shapes[0].name).toHaveLength(80)
    expect(editPlace(d, ref, { mapIds: ['m1', 'm2', 'm1'] })!.draft.shapes[0].mapIds).toEqual(['m1', 'm2'])
    expect(editPlace(d, ref, { name: '' })).toBeNull()
    expect(editPlace(d, ref, { mapIds: [] })).toBeNull()
  })

  it('makes a name or a link one undo step', () => {
    const d = withTown()
    const r = editPlace(d, { kind: 'shape', id: 'mrk_a' }, { name: 'Port Veyra', mapIds: ['m1'] })!
    const h = new MapHistory()
    h.push(r.edit)
    const back = h.undo(r.draft)!
    expect([back.shapes[0].name, back.shapes[0].mapIds]).toEqual(['', []])
  })

  it('makes named places in rows from the top left, as markers on the markers layer, and is not a thing when it cannot', () => {
    const d = draftOf(doc('map_1'))
    const r = addPlaces(d, ['Inn', ' Mill ', 'Docks', 'Keep', 'Gate'], ids('a', 'b', 'c', 'd', 'e'))!
    const s = r.change.draft.shapes
    expect(s.map(p => p.name)).toEqual(['Inn', 'Mill', 'Docks', 'Keep', 'Gate'])
    expect(s.every(p => p.layerId === 'symbols' && p.kind === 'marker:interest' && p.style === 'halo')).toBe(true)
    // 8 cells wide: two to a row, three cells apart (the middle of each marker's square).
    const middle = (sh: typeof s[number]) => { const xs = sh.points.map(q => q.x), ys = sh.points.map(q => q.y); return [Math.round((Math.min(...xs) + Math.max(...xs)) / 2 * 10) / 10, Math.round((Math.min(...ys) + Math.max(...ys)) / 2 * 10) / 10] }
    expect(s.slice(0, 4).map(middle)).toEqual([[1.5, 1.5], [4.5, 1.5], [1.5, 4.5], [4.5, 4.5]])
    expect(s[4].points.every(q => q.y <= 6)).toBe(true) // held to the map
    expect(new Set(s.map(p => p.id)).size).toBe(5)
    expect(addPlaces(d, [])).toBeNull()
    expect(addPlaces(toggleLayer(d, 'symbols', 'locked')!.draft, ['Inn'])).toBeNull()
  })
})

describe('the tree of maps', () => {
  const a = doc('map_a'), b = doc('map_b', { parentId: 'map_a' }), c = doc('map_c', { parentId: 'map_b' }), d = doc('map_d')
  const all = [a, b, c, d].map(sum)

  it('is the path of maps a map is inside, outermost first, and itself last', () => {
    expect(mapPath(all, 'map_c').map(m => m.id)).toEqual(['map_a', 'map_b', 'map_c'])
    expect(mapPath(all, 'map_d').map(m => m.id)).toEqual(['map_d'])
    expect(mapPath(all, 'nope')).toEqual([])
  })

  it('cuts a loop', () => {
    const loop = [sum(doc('map_x', { parentId: 'map_y' })), sum(doc('map_y', { parentId: 'map_x' }))]
    expect(mapPath(loop, 'map_x').map(m => m.id)).toEqual(['map_y', 'map_x'])
    expect(descendantIds(loop, 'map_x')).toEqual(new Set(['map_y']))
  })

  it('finds every map inside a map, at any depth', () => {
    expect(descendantIds(all, 'map_a')).toEqual(new Set(['map_b', 'map_c']))
    expect(descendantIds(all, 'map_c')).toEqual(new Set())
  })

  it('moves a map inside another, as one undo step', () => {
    const d1 = draftOf(c)
    const r = setParent(d1, 'map_a')!
    expect(r.draft.parentId).toBe('map_a')
    expect(setParent(d1, 'map_b')).toBeNull()
    expect(setParent(d1, null)!.draft.parentId).toBeNull()
    const h = new MapHistory()
    h.push(r.edit)
    expect(h.undo(r.draft)!.parentId).toBe('map_b')
  })

  it('has a day\'s travel, or none', () => {
    const d1 = draftOf(a)
    expect(setPace(d1, 24)!.draft.pace).toBe(24)
    expect(setPace(d1, 0)).toBeNull()
    expect(setPace(d1, NaN)).toBeNull()
    expect(setPace(setPace(d1, 24)!.draft, -1)!.draft.pace).toBeNull()
    expect(setPace(d1, 9e9)!.draft.pace).toBe(1_000_000)
  })
})

describe('measuring', () => {
  it('adds up the pieces of a path, in cells', () => {
    expect(pathLength([[0, 0], [3, 4]])).toBe(5)
    expect(pathLength([[0, 0], [3, 4], [3, 10]])).toBe(11)
    expect(pathLength([[2, 2]])).toBe(0)
    expect(pathLength([])).toBe(0)
  })

  it('turns a distance into a journey in hours or days at a day\'s travel', () => {
    expect(travelTime(12, 24)).toBe('12 hours')
    expect(travelTime(1, 240)).toBe('1 hour')
    expect(travelTime(24, 24)).toBe('1 day')
    expect(travelTime(60, 24)).toBe('2.5 days')
    expect(travelTime(1000, 24)).toBe('42 days')
  })

  it('says the length in the map\'s unit and, with a day\'s travel, how long it takes', () => {
    expect(measureText(5, 10, 'miles', null)).toBe('50 miles')
    expect(measureText(5, 10, 'miles', 25)).toBe('50 miles · 2 days')
    expect(measureText(0, 10, 'miles', 25)).toBe('0 miles')
    expect(measureText(5, 10, 'miles', 0)).toBe('50 miles')
  })
})

describe('the map file', () => {
  const root = doc('map_a', { shapes: [marker('s1', 'Port', ['map_b', 'map_out'])] })
  const child = doc('map_b', { parentId: 'map_a', shapes: [marker('s2', 'Inn', ['map_a'])] })
  const sibling = doc('map_z')
  const outside = doc('map_out', { parentId: 'map_zzz' })

  it('holds the map and the maps inside it, and cuts what points outside', () => {
    const f = buildMapFile('map_a', [root, child, sibling, outside], [], new Date('2026-11-06T00:00:00Z'))!
    expect(f).toMatchObject({ format: MAP_FILE_FORMAT, version: 4, rootId: 'map_a', exportedAt: '2026-11-06T00:00:00.000Z', biomes: [] })
    expect(f.maps.map(m => m.id)).toEqual(['map_a', 'map_b'])
    expect(f.maps[0].shapes[0].mapIds).toEqual(['map_b'])
    // The root is a map of its own in the file, and the maps of the project are not changed.
    expect(buildMapFile('map_b', [root, child])!.maps[0].parentId).toBeNull()
    expect(child.parentId).toBe('map_a')
    expect(root.shapes[0].mapIds).toEqual(['map_b', 'map_out'])
    expect(buildMapFile('nope', [root])).toBeNull()
  })

  it('carries the project\'s own biomes its maps use, and cuts the links of named areas that point outside', () => {
    const own: MapBiome[] = [
      { id: 'own_dunes', name: 'Glass dunes', color: '#cfd8e0', group: 'land', levels: [], retired: false },
      { id: 'own_unused', name: 'Unused', color: '#123456', group: 'land', levels: [], retired: false },
    ]
    const area = { ...makeBiomeShape('bio_1', 'terrain', [[1, 1], [4, 1], [2, 4]], 'own_dunes', true), name: 'The Glass', mapIds: ['map_b', 'map_out'] }
    const f = buildMapFile('map_a', [doc('map_a', { shapes: [area] }), child, outside], own)!
    expect(f.biomes!.map(b => b.id)).toEqual(['own_dunes'])
    expect(f.maps[0].shapes[0].mapIds).toEqual(['map_b'])
  })

  it('reads a file of maps of levels and biome shapes (no cells), and the own biomes in it', () => {
    const area = makeBiomeShape('bio_1', 'terrain', [[1, 1], [4, 1], [2, 4]], 'own_dunes', true)
    const own: MapBiome[] = [{ id: 'own_dunes', name: 'Glass dunes', color: '#cfd8e0', group: 'land', levels: [], retired: false }]
    const text = JSON.stringify(buildMapFile('map_a', [doc('map_a', { shapes: [area] })], own))
    const parsed = parseMapFile(text)
    expect(parsed.ok && parsed.file.maps[0].shapes[0].biome).toBe('own_dunes')
    expect(parsed.ok && parsed.file.biomes!.map(b => b.name)).toEqual(['Glass dunes'])
    // A map of levels without a base is not readable; an own biome without an "own_" id is left out.
    const broken = JSON.stringify({ format: MAP_FILE_FORMAT, version: 3, maps: [{ id: 'map_a', width: 2, height: 2, mapFormat: 2, shapes: [] }] })
    expect(parseMapFile(broken).ok).toBe(false)
    const odd = JSON.stringify({ ...JSON.parse(text), biomes: [{ id: 'forest', name: 'Forest', color: '#000000' }, 7] })
    expect(parseMapFile(odd).ok && (parseMapFile(odd) as { file: { biomes: MapBiome[] } }).file.biomes).toEqual([])
  })

  it('is read back, and refused when it is not a map file', () => {
    const text = JSON.stringify(buildMapFile('map_a', [root, child])!)
    const parsed = parseMapFile(text)
    expect(parsed.ok && parsed.file.maps.map(m => m.id)).toEqual(['map_a', 'map_b'])
    for (const bad of ['not json', '[]', '{}', JSON.stringify({ format: 'other' }), JSON.stringify({ format: MAP_FILE_FORMAT, version: 99, maps: [{}] }), JSON.stringify({ format: MAP_FILE_FORMAT, version: 1, maps: [] })]) {
      expect(parseMapFile(bad).ok, bad).toBe(false)
    }
  })

  it('skips maps it cannot read and repeats, and falls back to the first map as the root', () => {
    const text = JSON.stringify({ format: MAP_FILE_FORMAT, version: 1, rootId: 'gone', maps: [{ id: 'map_a', width: 2, height: 2, cells: [0, 4] }, { id: 'map_a', width: 2, height: 2, cells: [] }, { id: '', width: 1 }, 5, { id: 'map_c', width: 'x', height: 1, cells: [] }] })
    const parsed = parseMapFile(text)
    expect(parsed.ok && parsed.file.maps.map(m => m.id)).toEqual(['map_a'])
    expect(parsed.ok && parsed.file.rootId).toBe('map_a')
    expect(parseMapFile(JSON.stringify({ format: MAP_FILE_FORMAT, version: 1, maps: [5, {}] })).ok).toBe(false)
  })

  it('names the file after the map', () => {
    expect(mapFileName('Port Veyra: the Harbour!')).toBe('Port-Veyra-the-Harbour.scriblr-map.json')
    expect(mapFileName('???')).toBe('map.scriblr-map.json')
  })

  it('lists the maps in order, inside first, with the project\'s own map of the same id where there is one', () => {
    const f = buildMapFile('map_a', [root, child])!
    const rows = importRows(f, [sum(doc('map_b'))])
    expect(rows.map(r => [r.map.id, r.depth, r.clash?.id ?? null])).toEqual([['map_a', 0, null], ['map_b', 1, 'map_b']])
  })

  describe('importing', () => {
    const open = (...maps: MapDoc[]) => {
      const backend = mapsBackend(maps)
      const api = { create: (body: Parameters<typeof createMap>[1]) => createMap('p1', body), put: (d: MapDoc) => putMap('p1', d) }
      return { backend, api }
    }

    it('makes new maps with new ids, keeps the nesting and the links between them, and puts the root where it is asked', async () => {
      const { backend, api } = open(doc('map_here'))
      const f = buildMapFile('map_a', [root, child])!
      const r = await importMaps(f, new Map(), (await listMaps('p1')), 'map_here', api)
      expect(r.error).toBeUndefined()
      expect(r.made).toHaveLength(2)
      expect(r.replaced).toEqual([])
      const [a2, b2] = r.made.map(id => backend.maps.get(id)!)
      expect(a2.id).not.toBe('map_a')
      expect(a2.parentId).toBe('map_here')
      expect(b2.parentId).toBe(a2.id)
      expect(a2.shapes[0].mapIds).toEqual([b2.id])
      expect(b2.shapes[0].mapIds).toEqual([a2.id])
      expect(r.rootId).toBe(a2.id)
      expect(backend.maps.has('map_a')).toBe(false)
    })

    it('asks for each map that clashes: keep both makes a new one, replace writes over it, skip leaves it', async () => {
      const mine = doc('map_a', { title: 'Mine', width: 4, height: 4 })
      const { backend, api } = open(mine, doc('map_b', { title: 'Mine too' }))
      const f = buildMapFile('map_a', [root, child])!
      const choices = new Map<string, Choice>([['map_a', 'replace'], ['map_b', 'skip']])
      const r = await importMaps(f, choices, await listMaps('p1'), null, api)
      expect(r.replaced).toEqual(['map_a'])
      expect(r.made).toEqual([])
      expect(r.skipped).toEqual(['map_b'])
      expect(backend.maps.get('map_a')!).toMatchObject({ title: 'Map a', width: 8, parentId: null })
      expect(backend.maps.get('map_a')!.shapes[0].mapIds).toEqual([]) // the map it opened was skipped
      expect(backend.maps.get('map_b')!.title).toBe('Mine too')
      const both = await importMaps(f, new Map(), await listMaps('p1'), null, api)
      expect(both.made).toHaveLength(2)
      expect(backend.maps.size).toBe(4)
    })

    it('keeps the root\'s own place when it replaces a map', async () => {
      const { backend, api } = open(doc('map_up'), doc('map_a', { parentId: 'map_up' }))
      const f = buildMapFile('map_a', [root])!
      await importMaps(f, new Map([['map_a', 'replace' as Choice]]), await listMaps('p1'), null, api)
      expect(backend.maps.get('map_a')!.parentId).toBe('map_up')
    })

    it('brings the versions of a map with it, as versions of the new map, and leaves out the journeys of characters the project does not have', async () => {
      const journeys = [{ id: 'j1', characterId: 'chr_a', color: null, stops: [] }, { id: 'j2', characterId: 'chr_gone', color: null, stops: [] }]
      const base = doc('map_a', { journeys })
      const later = doc('map_v', { versionOf: 'map_a', appliesFrom: 'c2', title: 'After the war', journeys })
      const file = buildMapFile('map_a', [base, later, doc('map_other', { versionOf: 'map_zzz' })])!
      expect(file.maps.map(m => m.id)).toEqual(['map_a', 'map_v'])
      expect(file.maps[1].parentId).toBeNull()
      expect(importRows(file, []).map(r => r.map.id)).toEqual(['map_a'])
      const { backend, api } = open()
      const r = await importMaps(file, new Map(), [], null, { ...api, createVersion: (id, body) => createMapVersion('p1', id, body), characterIds: new Set(['chr_a']) })
      expect(r.error).toBeUndefined()
      expect(r.made).toHaveLength(1)
      expect(r.versions).toBe(1)
      const made = backend.maps.get(r.made[0])!
      const version = [...backend.maps.values()].find(m => m.versionOf === made.id)!
      expect(version).toMatchObject({ title: 'After the war', appliesFrom: 'c2', parentId: null })
      expect(made.journeys!.map(j => j.characterId)).toEqual(['chr_a'])
      expect(version.journeys!.map(j => j.characterId)).toEqual(['chr_a'])
    })

    it('makes a map of an older file at the level its kind becomes, and adds the file\'s own biomes first', async () => {
      const { backend, api } = open()
      const old = { ...doc('map_old'), level: undefined, mapFormat: 1, kind: 'town' as const, cells: [0, 48] } as unknown as MapDoc
      const added: string[] = []
      const file = { ...buildMapFile('map_old', [old])!, biomes: [{ id: 'own_x', name: 'X', color: '#111111', group: 'land' as const, levels: [], retired: false }] }
      const r = await importMaps(file, new Map(), [], null, { ...api, addBiomes: async list => { added.push(...list.map(b => b.id)) } })
      expect(r.error).toBeUndefined()
      expect(added).toEqual(['own_x'])
      expect(backend.of('POST').length).toBe(1)
      expect(backend.maps.get(r.made[0])!.level).toBe('local')
    })

    it('leaves the versions out when it cannot make them', async () => {
      const file = buildMapFile('map_a', [root, doc('map_v', { versionOf: 'map_a' })])!
      const { backend, api } = open()
      const r = await importMaps(file, new Map(), [], null, api)
      expect(r.made).toHaveLength(1)
      expect(r.versions).toBeUndefined()
      expect(backend.maps.size).toBe(1)
    })

    it('says what went wrong and stops', async () => {
      const { backend, api } = open()
      backend.failNext('/projects/p1/maps', 500, 'The disk is full')
      const r = await importMaps(buildMapFile('map_a', [root])!, new Map(), [], null, api)
      expect(r.error).toBe('The disk is full')
      expect(r.made).toEqual([])
      expect((await getMap('p1', 'map_a').catch(() => null))).toBeNull()
    })
  })
})

describe('the image', () => {
  it('is 16 pixels a cell at 1x, 32 at 2x and 64 at 4x, with a margin', () => {
    expect(EXPORT_SCALES).toEqual([1, 2, 4])
    expect(exportSize(10, 5, 1)).toEqual({ cell: 16, width: 164, height: 84 })
    expect(exportSize(10, 5, 2)).toEqual({ cell: 32, width: 324, height: 164 })
    expect(exportSize(10, 5, 4)).toEqual({ cell: 64, width: 644, height: 324 })
  })

  it('is held so the longest side fits a canvas', () => {
    const big = exportSize(512, 512, 4)
    expect(big.cell).toBe(15)
    expect(big.width).toBeLessThanOrEqual(8192)
    expect(exportSize(512, 100, 1).cell).toBe(15)
    expect(exportSize(1, 1, 4).cell).toBe(64)
  })

  it('names the file after the map and the scale', () => {
    expect(imageFileName('Port Veyra!', 1)).toBe('Port-Veyra.png')
    expect(imageFileName('Port Veyra', 4)).toBe('Port-Veyra@4x.png')
    expect(imageFileName('', 2)).toBe('map@2x.png')
  })

  it('shows only the chosen layers', () => {
    const d = draftOf(doc('map_1'))
    const shown = withLayers(d, new Set(['terrain', 'labels']))
    expect(shown.layers.filter(l => l.visible).map(l => l.id)).toEqual(['terrain', 'labels'])
    expect(d.layers.every(l => l.visible)).toBe(true)
  })

  it('draws on a canvas of its size, and gives none when there is no 2D context', () => {
    const calls: string[] = []
    const ctx = new Proxy({}, { get: (_t, n: string) => (n === 'measureText' ? () => ({ width: 10 }) : () => { calls.push(n) }), set: () => true }) as unknown as CanvasRenderingContext2D
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => ctx) } as unknown as HTMLCanvasElement
    const index = biomeIndex(STARTER_BIOMES)
    const d = draftOf(doc('map_1'))
    expect(renderMapImage(d, index, 2, new Set(d.layers.map(l => l.id)), () => canvas)).toBe(canvas)
    expect([canvas.width, canvas.height]).toEqual([8 * 32 + 4, 6 * 32 + 4])
    expect(calls).toContain('fillRect')
    const blind = { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement
    expect(renderMapImage(d, index, 1, new Set(), () => blind)).toBeNull()
  })
})
