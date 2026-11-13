import { describe, expect, it } from 'vitest'
import type { MapDoc, MapShape, MapShapePoint } from '../../../../api/types'
import { markerOf } from '../../../../designSystem/mockMaps'
import { MAX_SHAPES, addShape, editShape, hitItem, itemBounds, removeItem, replaceShape, withShape } from './mapItems'
import { MapHistory, draftOf, removeLayer, toggleLayer, type MapDraft } from './mapModel'
import {
  DEFAULT_LINE_PEN, LINE_PRESETS, MAX_POINTS, MIN_POINTS, REGION_PRESETS, bezierAt, flatten, hitShape, insertPoint, makeShape, movePoint, nearestOnShape, outVector, pointInPolygon,
  removePoint, segmentsOf, setAllSmooth, setHandle, shapeBounds, snapVertex, toggleSmooth, translateShape,
} from './mapShapes'

const pt = (x: number, y: number, smooth = false, hx: number | null = null, hy: number | null = null): MapShapePoint => ({ x, y, smooth, hx, hy })
const shape = (type: 'line' | 'region', points: MapShapePoint[], over: Partial<MapShape> = {}): MapShape => ({
  id: 'shp_a', layerId: 'shapes', type, points, style: 'solid', color: null, width: 0.25, fill: null, opacity: 0.35, pattern: 'solid', ...over,
})
const line = (...p: Array<[number, number]>) => shape('line', p.map(([x, y]) => pt(x, y)))

const doc = (): MapDoc => ({
  schemaVersion: 2, id: 'map_1', title: 'World', level: 'national', mapFormat: 2, base: { biome: 'plain', height: 0 }, units: 'metric',
  parentId: null, order: 0, width: 20, height: 10, cellSize: 10, unit: 'km', pace: null,
  layers: [
    { id: 'terrain', name: 'Biomes', kind: 'terrain', visible: true, locked: false },
    { id: 'shapes', name: 'Shapes', kind: 'shapes', visible: true, locked: false },
    { id: 'symbols', name: 'Symbols', kind: 'symbols', visible: true, locked: false },
  ],
  symbols: [], labels: [], shapes: [], scaleBar: true, compass: true, legend: false, updatedAt: 'x',
})
const draft = (): MapDraft => draftOf(doc())
const ids = (...seed: string[]) => { let n = 0; return () => seed[n++] ?? `x${n}` }


const presetPen = (id: string) => REGION_PRESETS.find(p => p.id === id)!.pen
describe('the curve of a shape', () => {
  it('is straight between corners', () => {
    const segs = segmentsOf(line([0, 0], [4, 0], [4, 3]))
    expect(segs).toHaveLength(2)
    expect(segs.every(s => s.straight)).toBe(true)
    expect(bezierAt(segs[0], 0.5)).toEqual([2, 0])
  })

  it('has a segment back to the start for a region and not for a line', () => {
    const pts = [pt(0, 0), pt(4, 0), pt(4, 3)]
    expect(segmentsOf(shape('line', pts))).toHaveLength(2)
    const closed = segmentsOf(shape('region', pts))
    expect(closed).toHaveLength(3)
    expect(closed[2]).toMatchObject({ from: 2, to: 0 })
  })

  it('gives a smooth point the handle its neighbours make, and a corner none', () => {
    const pts = [pt(0, 0), pt(6, 0, true), pt(6, 6)]
    expect(outVector(pts, 1, false)).toEqual([1, 1]) // ((6, 6) - (0, 0)) / 6
    expect(outVector(pts, 0, false)).toEqual([0, 0]) // a corner
    expect(outVector([pt(0, 0, true), pt(3, 0)], 0, false)).toEqual([1, 0]) // an end: towards its one neighbour
    expect(outVector([pt(0, 0, true)], 0, false)).toEqual([0, 0])
  })

  it('wraps round for the ends of a region', () => {
    const pts = [pt(0, 0, true), pt(6, 0), pt(6, 6), pt(0, 6)]
    expect(outVector(pts, 0, true)).toEqual([1, -1]) // ((6, 0) - (0, 6)) / 6
    expect(outVector(pts.slice(0, 2), 0, true)).toEqual([2, 0]) // two points: not a ring, towards the next
  })

  it('uses a handle that was dragged, and ignores it on a corner', () => {
    expect(outVector([pt(0, 0, true, 2, 3), pt(5, 5)], 0, false)).toEqual([2, 3])
    expect(outVector([pt(0, 0, false, 2, 3), pt(5, 5)], 0, false)).toEqual([0, 0])
  })

  it('is a curve through its points, leaving along the handle and arriving on the other side', () => {
    const s = shape('line', [pt(0, 0, true, 2, 0), pt(6, 0, true, 2, 0)])
    const [seg] = segmentsOf(s)
    expect(seg.straight).toBe(false)
    expect(seg.c1).toEqual([2, 0])
    expect(seg.c2).toEqual([4, 0]) // 6 - 2
    expect(bezierAt(seg, 0)).toEqual([0, 0])
    expect(bezierAt(seg, 1)).toEqual([6, 0])
    // A handle along the line keeps the curve on it.
    expect(bezierAt(seg, 0.5)[1]).toBeCloseTo(0)
    const bent = shape('line', [pt(0, 0, true, 0, 3), pt(6, 0, true, 0, -3)])
    expect(bezierAt(segmentsOf(bent)[0], 0.5)[1]).toBeGreaterThan(1)
  })

  it('flattens a curve into several pieces and a straight line into one', () => {
    expect(flatten(line([0, 0], [4, 0]))).toHaveLength(2)
    const curved = shape('line', [pt(0, 0, true), pt(4, 4, true), pt(8, 0, true)])
    const f = flatten(curved)
    expect(f.length).toBeGreaterThan(20)
    expect(f[0]).toMatchObject({ x: 0, y: 0 })
    expect(f[f.length - 1]).toMatchObject({ x: 8, y: 0 })
    // It passes through the middle point.
    expect(f.some(p => Math.abs(p.x - 4) < 1e-9 && Math.abs(p.y - 4) < 1e-9)).toBe(true)
  })

  it('ends a region where it began', () => {
    const f = flatten(shape('region', [pt(0, 0), pt(4, 0), pt(4, 3)]))
    expect(f[f.length - 1]).toMatchObject({ x: 0, y: 0 })
  })
})

describe('where a point is on a shape', () => {
  it('finds the nearest place on a line, which curve it is on and how far along', () => {
    const n = nearestOnShape(line([0, 0], [10, 0], [10, 10]), 4, 3)!
    expect(n).toMatchObject({ seg: 0, x: 4, y: 0, dist: 3 })
    expect(n.t).toBeCloseTo(0.4)
    const m = nearestOnShape(line([0, 0], [10, 0], [10, 10]), 12, 6)!
    expect(m.seg).toBe(1)
    expect(m.t).toBeCloseTo(0.6)
    expect(m.dist).toBeCloseTo(2)
  })

  it('has none for a shape with no points', () => {
    expect(nearestOnShape(shape('line', []), 1, 1)).toBeNull()
  })

  it('says whether a point is inside a polygon', () => {
    const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }]
    expect(pointInPolygon(square, 2, 2)).toBe(true)
    expect(pointInPolygon(square, 5, 2)).toBe(false)
    expect(pointInPolygon(square, -0.1, 2)).toBe(false)
  })

  it('hits a line near it (the half width and a little room) and a region inside it', () => {
    const l = line([0, 0], [10, 0])
    expect(hitShape(l, 5, 0.3)).toBe(true) // 0.125 + 0.3
    expect(hitShape(l, 5, 0.5)).toBe(false)
    const r = shape('region', [pt(2, 2), pt(8, 2), pt(8, 8), pt(2, 8)])
    expect(hitShape(r, 5, 5)).toBe(true)
    expect(hitShape(r, 8.2, 5)).toBe(true) // near its edge
    expect(hitShape(r, 9, 5)).toBe(false)
  })

  it('does not hit a shape with too few points', () => {
    expect(hitShape(shape('line', [pt(1, 1)]), 1, 1)).toBe(false)
    expect(hitShape(shape('region', [pt(1, 1), pt(2, 2)]), 1.5, 1.5)).toBe(false)
  })

  it('bounds the curve and its width', () => {
    const b = shapeBounds(shape('line', [pt(1, 2), pt(5, 4)], { width: 1 }))
    expect(b).toEqual({ x0: 0.5, y0: 1.5, x1: 5.5, y1: 4.5 })
    // A curve that bulges is bounded by where it goes, not just its points.
    const bulge = shapeBounds(shape('line', [pt(0, 0, true, 0, 4), pt(6, 0, true, 0, -4)], { width: 0 }))
    expect(bulge.y1).toBeGreaterThan(2)
  })
})

describe('snapping the points of a shape', () => {
  it('goes to the nearest corner or cell centre of the grid', () => {
    expect(snapVertex(3.1, 4.05)).toEqual([3, 4]) // near a corner
    expect(snapVertex(3.45, 4.55)).toEqual([3.5, 4.5]) // near a centre
    expect(snapVertex(0.9, 0.2)).toEqual([1, 0])
    expect(snapVertex(2.6, 2.6)).toEqual([2.5, 2.5])
  })
})

describe('changing a shape', () => {
  it('moves a point and leaves the others', () => {
    const s = movePoint(line([0, 0], [4, 0], [4, 4]), 1, 5, 1)
    expect(s.points.map(p => [p.x, p.y])).toEqual([[0, 0], [5, 1], [4, 4]])
  })

  it('makes a dragged handle the point\'s own and the point smooth', () => {
    const s = setHandle(line([0, 0], [4, 0], [4, 4]), 1, 6, 2)
    expect(s.points[1]).toEqual({ x: 4, y: 0, smooth: true, hx: 2, hy: 2 })
    expect(outVector(s.points, 1, false)).toEqual([2, 2])
  })

  it('turns a corner smooth and back, forgetting the handle', () => {
    const s = line([0, 0], [4, 0], [4, 4])
    const smooth = toggleSmooth(s, 1)
    expect(smooth.points[1].smooth).toBe(true)
    const dragged = setHandle(smooth, 1, 6, 2)
    const corner = toggleSmooth(dragged, 1)
    expect(corner.points[1]).toEqual({ x: 4, y: 0, smooth: false, hx: null, hy: null })
    expect(toggleSmooth(corner, 1).points[1].hx).toBeNull()
  })

  it('smooths or straightens every point', () => {
    const s = setAllSmooth(line([0, 0], [4, 0], [4, 4]), true)
    expect(s.points.every(p => p.smooth)).toBe(true)
    expect(setAllSmooth(s, false).points.every(p => !p.smooth && p.hx === null)).toBe(true)
  })

  it('puts a new point on the curve where it was asked, and it stays on the line', () => {
    const s = line([0, 0], [10, 0], [10, 10])
    const more = insertPoint(s, 1, 0.5)!
    expect(more.points.map(p => [p.x, p.y])).toEqual([[0, 0], [10, 0], [10, 5], [10, 10]])
    expect(more.points[2].smooth).toBe(false)
    const smooth = insertPoint(setAllSmooth(s, true), 0, 0.5)!
    expect(smooth.points[1].smooth).toBe(true)
    expect(smooth.points).toHaveLength(4)
  })

  it('puts a point on the closing side of a region at the end', () => {
    const r = shape('region', [pt(0, 0), pt(4, 0), pt(4, 4)])
    const more = insertPoint(r, 2, 0.5)!
    expect(more.points).toHaveLength(4)
    expect([more.points[3].x, more.points[3].y]).toEqual([2, 2])
  })

  it('does not put in a point past the most, or on a curve that is not there', () => {
    expect(insertPoint(line([0, 0], [1, 1]), 5, 0.5)).toBeNull()
    const huge = shape('line', Array.from({ length: MAX_POINTS }, (_, i) => pt(i % 10, (i * 3) % 7)))
    expect(insertPoint(huge, 0, 0.5)).toBeNull()
  })

  it('takes a point away, but not below the fewest a line (2) or a region (3) needs', () => {
    expect(removePoint(line([0, 0], [1, 1], [2, 2]), 1)!.points).toHaveLength(2)
    expect(removePoint(line([0, 0], [1, 1]), 0)).toBeNull()
    expect(removePoint(shape('region', [pt(0, 0), pt(4, 0), pt(4, 4), pt(0, 4)]), 3)!.points).toHaveLength(3)
    expect(removePoint(shape('region', [pt(0, 0), pt(4, 0), pt(4, 4)]), 0)).toBeNull()
    expect(removePoint(line([0, 0], [1, 1], [2, 2]), 9)).toBeNull()
    expect([MIN_POINTS.line, MIN_POINTS.region]).toEqual([2, 3])
  })

  it('moves a whole shape, held to the map as a whole', () => {
    const s = line([1, 1], [4, 2])
    expect(translateShape(s, 2, 3, 20, 10).points.map(p => [p.x, p.y])).toEqual([[3, 4], [6, 5]])
    expect(translateShape(s, 99, 99, 20, 10).points.map(p => [p.x, p.y])).toEqual([[17, 9], [20, 10]])
    expect(translateShape(s, -99, -99, 20, 10).points.map(p => [p.x, p.y])).toEqual([[0, 0], [3, 1]])
  })
})

describe('the pens', () => {
  it('makes a line with the pen\'s style and curves it when the pen is smooth', () => {
    const river = LINE_PRESETS.find(p => p.id === 'river')!.pen
    const s = makeShape('a', 'shapes', 'line', [[0, 0], [3, 1], [6, 0]], river)
    expect(s).toMatchObject({ type: 'line', style: 'solid', color: '#3b6ea5', fill: null, pattern: 'solid' })
    expect(s.points.every(p => p.smooth)).toBe(true)
    const border = LINE_PRESETS.find(p => p.id === 'border')!.pen
    expect(makeShape('a', 'shapes', 'line', [[0, 0], [3, 1]], border).points.every(p => !p.smooth)).toBe(true)
  })

  it('makes a region with its fill, pattern and opacity', () => {
    const forest = REGION_PRESETS.find(p => p.id === 'forest')!.pen
    const s = makeShape('a', 'shapes', 'region', [[0, 0], [3, 0], [3, 3]], forest)
    expect(s).toMatchObject({ type: 'region', fill: '#4f8a4a', pattern: 'dots', opacity: 0.4 })
  })

  it('has a few of each, every one drawn in a style the map knows', () => {
    expect(LINE_PRESETS.map(p => p.id)).toEqual(['river', 'road', 'trail', 'border', 'wall', 'fence', 'route'])
    // Each level is offered its own: rivers on land, routes and nebulae in space.
    const offered = (list: typeof LINE_PRESETS, drawn: 'biomes' | 'materials' | 'space') => list.filter(p => p.drawn.includes(drawn)).map(p => p.id)
    expect(offered(LINE_PRESETS, 'space')).toEqual(['border', 'route'])
    expect(offered(LINE_PRESETS, 'biomes')).toContain('river')
    expect(offered(REGION_PRESETS, 'space')).toEqual(['danger', 'nebula', 'space-territory'])
    expect(REGION_PRESETS.find(p => p.id === 'nebula')!.pen.pattern).toBe('glow')
    expect(new Set(LINE_PRESETS.map(p => p.pen.style)).size).toBeGreaterThanOrEqual(5)
    expect(REGION_PRESETS.length).toBeGreaterThanOrEqual(4)
    expect(DEFAULT_LINE_PEN.style).toBe('solid')
  })
})

describe('shapes on the map', () => {
  const pen = LINE_PRESETS[1].pen

  it('puts a line on the topmost shown, unlocked shapes layer, held to the map', () => {
    const r = addShape(draft(), 'line', [[1, 1], [30, 2], [5, -4]], pen, ids('a'))!
    const s = r.change.draft.shapes[0]
    expect(s).toMatchObject({ id: 'shp_a', layerId: 'shapes', type: 'line', style: 'road' })
    expect(s.points.map(p => [p.x, p.y])).toEqual([[1, 1], [20, 2], [5, 0]])
  })

  it('needs enough points and a layer to put it on', () => {
    expect(addShape(draft(), 'line', [[1, 1]], pen)).toBeNull()
    expect(addShape(draft(), 'region', [[1, 1], [2, 2]], pen)).toBeNull()
    expect(addShape(toggleLayer(draft(), 'shapes', 'locked')!.draft, 'line', [[1, 1], [2, 2]], pen)).toBeNull()
    expect(addShape(toggleLayer(draft(), 'shapes', 'visible')!.draft, 'line', [[1, 1], [2, 2]], pen)).toBeNull()
    const full: MapDraft = { ...draft(), shapes: Array.from({ length: MAX_SHAPES }, (_, i) => line([1, 1], [2, 2]) && { ...line([1, 1], [2, 2]), id: `s${i}` }) }
    expect(addShape(full, 'line', [[1, 1], [2, 2]], pen)).toBeNull()
  })

  it('does not reuse an id', () => {
    const d = addShape(draft(), 'line', [[1, 1], [2, 2]], pen, ids('a'))!.change.draft
    expect(addShape(d, 'line', [[3, 3], [4, 4]], pen, ids('a', 'b'))!.id).toBe('shp_b')
  })

  it('changes a shape\'s style, colour, width, fill, opacity and pattern, holding numbers to their ranges', () => {
    const d = addShape(draft(), 'region', [[1, 1], [4, 1], [4, 4]], presetPen('territory'), ids('a'))!.change.draft
    const edit = (f: Parameters<typeof editShape>[2]) => editShape(d, 'shp_a', f)
    expect(edit({ style: 'wall' })!.draft.shapes[0].style).toBe('wall')
    expect(edit({ color: null })!.draft.shapes[0].color).toBeNull()
    expect(edit({ width: 99 })!.draft.shapes[0].width).toBe(4)
    expect(edit({ width: 0 })!.draft.shapes[0].width).toBe(0.05)
    expect(edit({ opacity: 3 })!.draft.shapes[0].opacity).toBe(1)
    expect(edit({ fill: '#112233', pattern: 'cross' })!.draft.shapes[0]).toMatchObject({ fill: '#112233', pattern: 'cross' })
    expect(edit({ style: d.shapes[0].style })).toBeNull()
    expect(edit({ width: NaN })).toBeNull()
    expect(editShape(d, 'nope', { style: 'wall' })).toBeNull()
  })

  it('replaces a shape by an edited copy as one undo step', () => {
    const d = addShape(draft(), 'line', [[1, 1], [4, 1], [4, 4]], pen, ids('a'))!.change.draft
    const edited = movePoint(d.shapes[0], 1, 9, 9)
    const r = replaceShape(d, edited)!
    expect(r.draft.shapes[0].points[1]).toMatchObject({ x: 9, y: 9 })
    const h = new MapHistory()
    h.push(r.edit)
    expect(h.undo(r.draft)!.shapes[0].points[1]).toMatchObject({ x: 4, y: 1 })
    expect(replaceShape(d, d.shapes[0])).toBeNull()
    expect(replaceShape(d, { ...edited, id: 'nope' })).toBeNull()
    expect(withShape(d, edited).shapes[0].points[1].x).toBe(9)
    expect(d.shapes[0].points[1].x).toBe(4)
  })

  it('removes a shape, and takes it away with its layer, and an undo brings it back', () => {
    const d = addShape(draft(), 'line', [[1, 1], [4, 1]], pen, ids('a'))!.change.draft
    expect(removeItem(d, { kind: 'shape', id: 'shp_a' })!.draft.shapes).toEqual([])
    expect(removeItem(d, { kind: 'shape', id: 'nope' })).toBeNull()
    const r = removeLayer(d, 'shapes')!
    expect(r.draft.shapes).toEqual([])
    const h = new MapHistory()
    h.push(r.edit)
    expect(h.undo(r.draft)!.shapes).toHaveLength(1)
  })

  it('picks a shape with the pointer, from layers that are shown and unlocked', () => {
    let d = addShape(draft(), 'line', [[1, 5], [9, 5]], pen, ids('a'))!.change.draft
    expect(hitItem(d, 5, 5.2)).toEqual({ kind: 'shape', id: 'shp_a' })
    expect(hitItem(d, 5, 8)).toBeNull()
    expect(hitItem(toggleLayer(d, 'shapes', 'locked')!.draft, 5, 5.2)).toBeNull()
    expect(hitItem(toggleLayer(d, 'shapes', 'visible')!.draft, 5, 5.2)).toBeNull()
    // A marker on the layer above wins where they overlap.
    d = { ...d, shapes: [...d.shapes, markerOf({ id: 'mrk_1', layerId: 'symbols', kind: 'tree', x: 5, y: 5, size: 2, color: null, name: '', mapIds: [] })] }
    expect(hitItem(d, 5, 5.2)).toEqual({ kind: 'shape', id: 'mrk_1' })
  })

  it('makes political areas from the Nation, State and Municipality pens, picked only by their border', () => {
    let d = addShape(draft(), 'region', [[1, 1], [9, 1], [9, 9], [1, 9]], presetPen('nation'), ids('a'))!.change.draft
    expect(d.shapes[0].political).toBe('nation')
    expect(hitItem(d, 5, 5)).toBeNull()
    expect(hitItem(d, 5, 1.05)).toEqual({ kind: 'shape', id: 'shp_a' })
    d = addShape(d, 'region', [[2, 2], [4, 2], [4, 4]], presetPen('water'), ids('b'))!.change.draft
    expect(d.shapes[1].political).toBeUndefined()
    expect(editShape(d, 'shp_b', { political: 'state' })!.draft.shapes[1].political).toBe('state')
    expect(editShape(d, 'shp_a', { political: null })!.draft.shapes[0].political).toBeNull()
  })

  it('picks the later of two shapes that overlap', () => {
    let d = addShape(draft(), 'region', [[1, 1], [9, 1], [9, 9]], presetPen('water'), ids('a'))!.change.draft
    d = addShape(d, 'region', [[2, 2], [8, 2], [8, 8]], presetPen('forest'), ids('b'))!.change.draft
    expect(hitItem(d, 6, 4)).toEqual({ kind: 'shape', id: 'shp_b' })
  })

  it('knows the bounds of a chosen shape', () => {
    const d = addShape(draft(), 'line', [[2, 3], [6, 3]], { ...pen, width: 1 }, ids('a'))!.change.draft
    const b = itemBounds(d.shapes[0], 'shape')
    expect([b.x0, b.y0, b.x1, b.y1].map(n => Math.round(n * 1000) / 1000)).toEqual([1.5, 2.5, 6.5, 3.5])
  })
})
