import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { MapLibraryShape, MapShape, MapShapePoint } from '../../../../api/types'
import { cutShape, mergeShapes, splitShape } from './mapCombine'
import { STARTER_BIOMES, biomeIndex } from './mapBiomes'
import { buildHeights, heightAt } from './mapHeights'
import { addLibraryShape, addPlaces, combineShapes, hitItem, layerFor } from './mapItems'
import { CATEGORIES, fitInBox, kindName, libraryFromShape, offeredAt, ownBox, shapeFromLibrary } from './mapLibrary'
import { draftOf, toggleLayer, type MapDraft } from './mapModel'
import { allRings, distanceToEdge, insideShape, ringsOf, roughen } from './mapOutline'
import { BUILDING_LEVELS, LAND_LEVELS, SEED_VERSION, SPACE_LEVELS, markerName, starterShapes, svgRings } from './mapShapeSeed'
import { shapeBounds } from './mapShapes'
import { POLYGON_SIDES, TEMPLATES, boxFrom, seededRandom, templatePoints } from './mapTemplates'
import type { MapDoc } from '../../../../api/types'

const pt = (x: number, y: number, smooth = false): MapShapePoint => ({ x, y, smooth, hx: null, hy: null })
const square = (x0: number, y0: number, x1: number, y1: number) => [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)]
const region = (id: string, points: MapShapePoint[], over: Partial<MapShape> = {}): MapShape => ({
  id, layerId: 'shapes', type: 'region', points, style: 'solid', color: null, width: 0.15, fill: null, opacity: 0.35, pattern: 'solid', name: '', mapIds: [], ...over,
})
const biome = (id: string, points: MapShapePoint[], over: Partial<MapShape> = {}): MapShape => ({
  ...region(id, points), layerId: 'terrain', type: 'biome', biome: 'forest', heightMode: 'none', height: 0, profile: 'plateau', slope: 0, ...over,
})
const line = (id: string, points: MapShapePoint[]): MapShape => ({ id, layerId: 'shapes', type: 'line', points, style: 'solid', color: null, width: 0.15, fill: null, opacity: 0.35, pattern: 'solid' })
const doc = (over: Partial<MapDoc> = {}): MapDoc => ({
  schemaVersion: 2, id: 'map_1', title: 'World', level: 'regional', mapFormat: 3, base: { biome: 'plain', height: 0 }, units: 'metric',
  parentId: null, order: 0, width: 20, height: 12, cellSize: 1, unit: 'km', pace: null,
  layers: [
    { id: 'terrain', name: 'Biomes', kind: 'terrain', visible: true, locked: false },
    { id: 'shapes', name: 'Regions and lines', kind: 'shapes', visible: true, locked: false },
    { id: 'symbols', name: 'Markers', kind: 'symbols', visible: true, locked: false },
    { id: 'labels', name: 'Labels', kind: 'labels', visible: true, locked: false },
  ],
  labels: [], shapes: [], scaleBar: false, compass: false, legend: false, updatedAt: 'x', ...over,
})
const draft = (over: Partial<MapDoc> = {}): MapDraft => draftOf(doc(over))
const SEED = starterShapes()
const lib = (id: string) => SEED.find(s => s.id === id)!
const INDEX = biomeIndex(STARTER_BIOMES)
const heightOf = (d: MapDraft, x: number, y: number) => heightAt(buildHeights(d, INDEX)!, x, y)
const area = (ring: Array<{ x: number; y: number }>) => Math.abs(ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]; return a + p.x * q.y - q.x * p.y }, 0) / 2)

describe('rough edges', () => {
  const ring = square(0, 0, 10, 10)
  it('leave a shape as it is at 0, and wobble it the same way for the same seed', () => {
    expect(roughen(ring, true, 0, 1, 14)).toBe(ring)
    const a = roughen(ring, true, 60, 7, 14), b = roughen(ring, true, 60, 7, 14), c = roughen(ring, true, 60, 8, 14)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
    expect(a.length).toBeGreaterThan(ring.length)
    expect(a.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
  })

  it('wobble more the rougher they are, and stay near the outline', () => {
    const off = (r: number) => Math.max(...roughen(ring, true, r, 3, 14).map(p => Math.min(Math.abs(p.x), Math.abs(10 - p.x), Math.abs(p.y), Math.abs(10 - p.y))))
    expect(off(100)).toBeGreaterThan(off(20))
    expect(off(100)).toBeLessThan(2)
  })

  it('keep the ends of a line where they are', () => {
    const path = [pt(0, 0), pt(5, 1), pt(10, 0)]
    const r = roughen(path, false, 80, 2, 10)
    expect(r[0]).toMatchObject({ x: 0, y: 0 })
    expect(r.at(-1)).toMatchObject({ x: 10, y: 0 })
  })

  it('are drawn, filled with heights and picked alike: one outline, cached per shape', () => {
    const s = biome('b', square(2, 2, 12, 10), { rough: 70, seed: 4, heightMode: 'raise', height: 500 })
    expect(ringsOf(s)).toBe(ringsOf(s))
    expect(ringsOf(s).outer.length).toBeGreaterThan(4)
    // A spot just outside the straight edge but inside the wobble (or the other way): the pick and the height agree.
    const d = draft({ shapes: [s] })
    for (let x = 1.5; x <= 2.5; x += 0.1) {
      const inside = insideShape(s, x, 6)
      expect(hitItem(d, x, 6)?.id === 'b' || distanceToEdge(s, x, 6) <= 0.2).toBe(inside || distanceToEdge(s, x, 6) <= 0.2)
    }
    expect(heightOf(d, 7, 6)).toBeCloseTo(500, 0)
  })
})

describe('holes', () => {
  const ring = biome('r', square(0, 0, 10, 10), { holes: [square(3, 3, 7, 7)] })
  it('are outside the shape (even-odd), and a piece inside a hole is inside again', () => {
    expect(insideShape(ring, 1, 1)).toBe(true)
    expect(insideShape(ring, 5, 5)).toBe(false)
    const island = { ...ring, holes: [square(3, 3, 7, 7), square(4, 4, 6, 6)] }
    expect(insideShape(island, 5, 5)).toBe(true)
    expect(allRings(island)).toHaveLength(3)
  })

  it('are measured to as an edge, and left out of the height of the land', () => {
    expect(distanceToEdge(ring, 5, 5)).toBeCloseTo(2, 5)
    const d = draft({ shapes: [{ ...ring, heightMode: 'raise', height: 300 }] })
    expect(heightOf(d, 1, 1)).toBeCloseTo(300, 0)
    expect(heightOf(d, 5, 5)).toBeCloseTo(0, 0)
  })

  it('are not picked: a click in the hole picks what is under it', () => {
    const d = draft({ shapes: [biome('under', square(4, 4, 6, 6)), ring] })
    expect(hitItem(d, 1, 1)).toEqual({ kind: 'shape', id: 'r' })
    expect(hitItem(d, 5, 5)).toEqual({ kind: 'shape', id: 'under' })
  })

  it('count in the bounds, and are never on a line', () => {
    const lineWithHoles = { ...line('l', [pt(0, 0), pt(4, 4)]), holes: [square(1, 1, 2, 2)] }
    expect(allRings(lineWithHoles)).toHaveLength(1)
    expect(shapeBounds({ ...ring, width: 0 })).toMatchObject({ x0: 0, y0: 0, x1: 10, y1: 10 })
  })
})

describe('templates', () => {
  const box = { x0: 2, y0: 2, x1: 10, y1: 6 }
  it('are the six of the plan, and each fills its box with a closed outline of finite points', () => {
    expect(TEMPLATES.map(t => t.id)).toEqual(['circle', 'ellipse', 'rectangle', 'polygon', 'blob', 'ridge'])
    for (const t of TEMPLATES) {
      const pts = templatePoints(t.id, box, { seed: 3 })
      expect(pts.length).toBeGreaterThanOrEqual(3)
      for (const p of pts) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
        expect(p.x).toBeGreaterThanOrEqual(1.99); expect(p.x).toBeLessThanOrEqual(10.01)
        expect(p.y).toBeGreaterThanOrEqual(1.99); expect(p.y).toBeLessThanOrEqual(6.01)
      }
    }
  })

  it('make a round circle in the smaller side, an ellipse in the whole box, sharp rectangles and polygons, curved blobs', () => {
    const c = templatePoints('circle', box)
    const cb = shapeBounds({ type: 'region', points: c, width: 0 })
    expect(cb.x1 - cb.x0).toBeCloseTo(4, 1)
    expect(templatePoints('ellipse', box).every(p => p.smooth)).toBe(true)
    expect(templatePoints('rectangle', box).map(p => [p.x, p.y, p.smooth])).toEqual([[2, 2, false], [10, 2, false], [10, 6, false], [2, 6, false]])
    expect(templatePoints('polygon', box, { sides: 5 })).toHaveLength(5)
    expect(templatePoints('polygon', box, { sides: 99 })).toHaveLength(POLYGON_SIDES.max)
    expect(templatePoints('polygon', box, { sides: 1 })).toHaveLength(POLYGON_SIDES.min)
    expect(templatePoints('blob', box, { seed: 9 })).toEqual(templatePoints('blob', box, { seed: 9 }))
    expect(templatePoints('blob', box, { seed: 9 })).not.toEqual(templatePoints('blob', box, { seed: 10 }))
  })

  it('make a ridge along the longer side, coming to a point at each end', () => {
    const across = templatePoints('ridge', box, { seed: 2 })
    expect(across[0]).toMatchObject({ x: 2, y: 4, smooth: false })
    const tall = templatePoints('ridge', { x0: 0, y0: 0, x1: 2, y1: 10 }, { seed: 2 })
    const tb = shapeBounds({ type: 'region', points: tall, width: 0 })
    expect(tb.y1 - tb.y0).toBeGreaterThan(tb.x1 - tb.x0)
  })

  it('are placed in a box from two corners in either order, a square with Shift', () => {
    expect(boxFrom([5, 5], [1, 2])).toEqual({ x0: 1, y0: 2, x1: 5, y1: 5 })
    expect(boxFrom([1, 1], [5, 3], true)).toEqual({ x0: 1, y0: 1, x1: 5, y1: 5 })
    expect(boxFrom([5, 5], [1, 4], true)).toEqual({ x0: 1, y0: 1, x1: 5, y1: 5 })
    const r = seededRandom(5)
    const a = [r(), r(), r()]
    expect(a.every(n => n >= 0 && n < 1)).toBe(true)
  })
})

describe('combining shapes', () => {
  const a = biome('a', square(0, 0, 4, 4)), b = biome('b', square(2, 0, 6, 4))
  it('merges two overlapping biome areas into the first, and the second goes', () => {
    const r = mergeShapes(a, b)
    if ('refused' in r) throw new Error(r.refused)
    expect(r.removed).toEqual(['b'])
    expect(r.shapes[0].id).toBe('a')
    expect(r.shapes[0]).toMatchObject({ type: 'biome', biome: 'forest', rough: 0 })
    expect(area(ringsOf(r.shapes[0]).outer)).toBeCloseTo(24, 3)
  })

  it('merges two shapes apart into one shape of two pieces', () => {
    const r = mergeShapes(a, biome('far', square(10, 0, 12, 2)))
    if ('refused' in r) throw new Error(r.refused)
    expect(r.shapes[0].holes).toHaveLength(1)
    expect(insideShape(r.shapes[0], 11, 1)).toBe(true)
    expect(insideShape(r.shapes[0], 8, 1)).toBe(false)
  })

  it('refuses to merge a shape with itself, a line, or a region with a biome area', () => {
    expect(mergeShapes(a, a)).toHaveProperty('refused')
    expect(mergeShapes(a, line('l', [pt(0, 0), pt(3, 3)]))).toHaveProperty('refused')
    expect(mergeShapes(a, region('r', square(1, 1, 3, 3)))).toHaveProperty('refused')
  })

  it('cuts a shape inside out as a hole, and a shape over the edge as a bite; the cutter stays', () => {
    const big = biome('big', square(0, 0, 10, 10))
    const hole = cutShape(big, region('c', square(3, 3, 6, 6)))
    if ('refused' in hole) throw new Error(hole.refused)
    expect(hole.removed).toEqual([])
    expect(hole.shapes[0].holes).toHaveLength(1)
    expect(insideShape(hole.shapes[0], 4, 4)).toBe(false)
    const bite = cutShape(big, region('c', square(8, 8, 12, 12)))
    if ('refused' in bite) throw new Error(bite.refused)
    expect(bite.shapes[0].holes ?? []).toHaveLength(0)
    expect(area(ringsOf(bite.shapes[0]).outer)).toBeCloseTo(96, 3)
    expect(cutShape(big, region('far', square(20, 20, 22, 22)))).toEqual({ refused: 'The two shapes do not overlap.' })
    expect(cutShape(region('s', square(1, 1, 2, 2)), big)).toHaveProperty('refused')
  })

  it('splits a shape along a line drawn right across it, the first piece keeping its id and the others getting new ones', () => {
    const big = region('big', square(0, 0, 10, 10), { name: 'Vale', mapIds: ['m1'] })
    let n = 0
    const r = splitShape(big, line('cut', [pt(5, -1), pt(5, 11)]), () => `big_${++n}`)
    if ('refused' in r) throw new Error(r.refused)
    expect(r.shapes.map(s => s.id)).toEqual(['big', 'big_1'])
    expect(r.shapes[1]).toMatchObject({ name: '', mapIds: [] })
    expect(r.shapes[0].name).toBe('Vale')
    const areas = r.shapes.map(s => area(ringsOf(s).outer)).sort((x, y) => x - y)
    expect(areas[0]).toBeCloseTo(50, 0)
    expect(splitShape(big, line('short', [pt(5, -1), pt(5, 4)]), () => 'x')).toHaveProperty('refused')
    expect(splitShape(big, region('r', square(1, 1, 2, 2)), () => 'x')).toEqual({ refused: 'Pick a line to split along.' })
  })

  it('puts the result on the map as one change: the changed shapes in their places, the removed ones gone', () => {
    const d = draft({ shapes: [a, b] })
    const r = mergeShapes(a, b)
    if ('refused' in r) throw new Error(r.refused)
    const next = combineShapes(d, r.shapes, r.removed)!
    expect(next.draft.shapes.map(s => s.id)).toEqual(['a'])
    let n = 0
    const split = splitShape(region('big', square(0, 0, 10, 10)), line('cut', [pt(5, -1), pt(5, 11)]), () => `big_${++n}`)
    if ('refused' in split) throw new Error(split.refused)
    const d2 = draft({ shapes: [region('big', square(0, 0, 10, 10)), region('other', square(1, 1, 2, 2))] })
    expect(combineShapes(d2, split.shapes, split.removed)!.draft.shapes.map(s => s.id)).toEqual(['big', 'big_1', 'other'])
  })
})

describe('the shape libraries', () => {
  it('fit a shape in a dragged box keeping its proportions, or at its own size round a point', () => {
    expect(fitInBox({ w: 2, h: 1 }, { x0: 0, y0: 0, x1: 10, y1: 10 })).toEqual({ x0: 0, y0: 2.5, x1: 10, y1: 7.5 })
    expect(fitInBox({ w: 2, h: 1 }, { x0: 0, y0: 0, x1: 10, y1: 10 }, false)).toEqual({ x0: 0, y0: 0, x1: 10, y1: 10 })
    expect(ownBox({ w: 2, h: 4 }, 5, 5)).toEqual({ x0: 4, y0: 3, x1: 6, y1: 7 })
  })

  it('place a library shape in a box with its kind, its holes, its biome and a seed of its own; heights in feet on an imperial map', () => {
    const range = lib('land:mountain-range')
    const s = shapeFromLibrary(range, { x0: 0, y0: 0, x1: 16, y1: 5 }, 'bio_x', 'terrain', 'metric')
    expect(s).toMatchObject({ id: 'bio_x', layerId: 'terrain', type: 'biome', kind: 'land:mountain-range', heightMode: range.heightMode, height: range.height })
    const ft = shapeFromLibrary(range, { x0: 0, y0: 0, x1: 16, y1: 5 }, 'bio_y', 'terrain', 'imperial')
    expect(ft.height).toBe(Math.round(range.height * 3.28084))
    const town = shapeFromLibrary(lib('marker:town'), { x0: 2, y0: 2, x1: 4, y1: 4 }, 'mrk_t', 'symbols', 'metric')
    expect(town.holes).toHaveLength(1)
    expect(town).toMatchObject({ style: 'halo', kind: 'marker:town', name: '', mapIds: [] })
    const isle1 = shapeFromLibrary(lib('land:island'), { x0: 0, y0: 0, x1: 12, y1: 8 }, 'a', 'terrain', 'metric')
    expect(isle1.rough).toBe(lib('land:island').rough)
    expect(typeof isle1.seed).toBe('number')
  })

  it('keep a shape of a map in a unit box, in metres, and give it back the same', () => {
    const s = biome('b', [pt(2, 2, true), pt(10, 2, true), pt(10, 6), pt(2, 6)], { holes: [square(4, 3, 6, 5)], heightMode: 'raise', height: 1000, rough: 30, seed: 4, name: 'Mine', mapIds: ['m'] })
    const kept = libraryFromShape(s, { id: 'my_1', name: ' Round hill ', category: 'land', levels: LAND_LEVELS, units: 'imperial' })
    expect(kept).toMatchObject({ id: 'my_1', name: 'Round hill', category: 'land', type: 'biome', w: 8, h: 4, biome: 'forest', heightMode: 'raise', rough: 30 })
    expect(kept.height).toBe(Math.round(1000 / 3.28084))
    expect(kept.points.every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)).toBe(true)
    expect(kept).not.toHaveProperty('name', 'Mine')
    const back = shapeFromLibrary(kept, { x0: 2, y0: 2, x1: 10, y1: 6 }, 'b2', 'terrain', 'imperial')
    expect(back.points.map(p => [p.x, p.y])).toEqual(s.points.map(p => [p.x, p.y]))
    expect(back.holes![0].map(p => [p.x, p.y])).toEqual(s.holes![0].map(p => [p.x, p.y]))
    expect(Math.abs(back.height! - 1000)).toBeLessThanOrEqual(2)
  })

  it('are offered on the levels they name (none named: every level), in four kinds', () => {
    expect(CATEGORIES.map(c => c.name)).toEqual(['Land forms', 'Space objects', 'Building parts', 'Markers'])
    expect(offeredAt({ levels: [] }, 'galactic')).toBe(true)
    expect(offeredAt({ levels: ['local'] }, 'galactic')).toBe(false)
    expect(SEED.filter(s => offeredAt(s, 'galactic')).every(s => s.category === 'space' || s.levels.length === 0)).toBe(true)
  })

  it('put a marker on the markers layer and a biome area on the biomes layer, and nothing on a locked one', () => {
    const d = draft()
    expect(layerFor(d, lib('marker:castle'))).toBe('symbols')
    expect(layerFor(d, lib('land:lake'))).toBe('terrain')
    expect(layerFor(d, lib('building:table'))).toBe('shapes')
    expect(addLibraryShape(toggleLayer(d, 'symbols', 'locked')!.draft, lib('marker:castle'), { x0: 1, y0: 1, x1: 3, y1: 3 }, 'metric')).toBeNull()
    // A marker that would stick out of the map is held to it.
    const r = addLibraryShape(d, lib('marker:castle'), { x0: 19, y0: 11, x1: 21, y1: 13 }, 'metric')!
    expect(r.change.draft.shapes[0].points.every(p => p.x <= 20 && p.y <= 12)).toBe(true)
  })

  it('make a marker for each named place', () => {
    const r = addPlaces(draft(), ['Inn'], () => 'a')!
    expect(r.change.draft.shapes[0]).toMatchObject({ kind: 'marker:interest', style: 'halo', name: 'Inn' })
  })
})

describe('the starter shapes', () => {
  it('are the file the server publishes on a new install (run npm run map-shapes after a change)', () => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const file = JSON.parse(readFileSync(path.resolve(here, '../../../../../../backend/app/seed/map_shapes.json'), 'utf-8')) as { seedVersion: number; shapes: MapLibraryShape[] }
    expect(file.seedVersion).toBe(SEED_VERSION)
    expect(file.shapes).toEqual(JSON.parse(JSON.stringify(SEED)))
  })

  it('hold the land forms, space objects, building parts and every old symbol as a marker, with ids of their kind and unique names in a kind', () => {
    const ids = new Set(SEED.map(s => s.id))
    expect(ids.size).toBe(SEED.length)
    for (const id of ['land:island', 'land:continent', 'land:archipelago', 'land:lake', 'land:mountain-range', 'land:ridge', 'land:valley', 'land:delta', 'land:plateau',
      'space:star', 'space:planet', 'space:ring', 'space:asteroid-belt', 'space:nebula', 'marker:castle', 'marker:place', 'marker:interest']) expect(ids.has(id)).toBe(true)
    expect(SEED.filter(s => s.category === 'building').length).toBeGreaterThanOrEqual(6)
    for (const c of CATEGORIES) {
      const names = SEED.filter(s => s.category === c.id).map(s => s.name.toLowerCase())
      expect(new Set(names).size).toBe(names.length)
    }
    for (const s of SEED) {
      expect(s.id.startsWith(`${s.category}:`)).toBe(true)
      for (const p of [...s.points, ...s.holes.flat()]) {
        expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(1)
        expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(1)
      }
      expect(s.points.length).toBeGreaterThanOrEqual(s.type === 'line' ? 2 : 3)
    }
    expect(SEED.filter(s => s.category === 'space').every(s => s.levels.every(l => SPACE_LEVELS.includes(l)))).toBe(true)
    expect(SEED.filter(s => s.category === 'building').every(s => s.levels.every(l => BUILDING_LEVELS.includes(l)))).toBe(true)
  })

  it('read SVG paths, curves and arcs included, into rings', () => {
    expect(svgRings('M0 0 L10 0 L10 10 Z')).toEqual([[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]])
    expect(svgRings('M0 0 h10 v10 h-10 z m2 2 h2 v2 h-2 z')).toHaveLength(2)
    const arc = svgRings('M0 5 A5 5 0 0 1 10 5 A5 5 0 0 1 0 5 Z')[0]
    expect(arc.length).toBeGreaterThan(8)
    expect(arc.every(p => Math.abs(Math.hypot(p.x - 5, p.y - 5) - 5) < 0.05)).toBe(true)
    const curve = svgRings('M0 0 C0 10 10 10 10 0 Z')[0]
    expect(curve.some(p => p.y > 5)).toBe(true)
  })

  it('name markers by their kind, an unknown kind by its words', () => {
    expect(markerName('marker:castle')).toBe('Castle')
    expect(markerName('marker:old_mill')).toBe('Old mill')
    expect(markerName('land:island')).toBe('Marker')
    expect(kindName('marker:sea-gate')).toBe('Sea gate')
  })
})
