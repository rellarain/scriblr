import { describe, expect, it } from 'vitest'
import type { MapDoc, MapShape } from '../../../../api/types'
import { SYMBOL_SETS } from './mapMarkerArt'
import { markerName, starterShapes } from './mapShapeSeed'
import { BUILDING_STYLE, LAND_STYLE, SPACE_STYLE, hexToRgb, mapStyle } from './mapThemes'
import { STARTER_BIOMES, biomeIndex } from './mapBiomes'
import { makeBiomeShape } from './mapShapes'
import {
  MAX_LABELS, MAX_MARKERS, activeLayerId, addLabel, addLibraryShape, editLabel, editShape, findItem, hitItem, itemBounds, labelExtent, legendEntries, movedItem,
  niceScale, removeItem, resizeShape, shapeWidth, snapPoint,
} from './mapItems'
import { MapHistory, draftOf, metaEdit, removeLayer, toggleLayer, type MapDraft } from './mapModel'

const doc = (): MapDoc => ({
  schemaVersion: 2, id: 'map_1', title: 'World', level: 'continental', mapFormat: 2, base: { biome: 'saltwater', height: -200 }, units: 'imperial',
  parentId: null, order: 0, width: 20, height: 10, cellSize: 10, unit: 'mi', pace: null,
  layers: [
    { id: 'terrain', name: 'Biomes', kind: 'terrain', visible: true, locked: false },
    { id: 'symbols', name: 'Symbols', kind: 'symbols', visible: true, locked: false },
    { id: 'labels', name: 'Labels', kind: 'labels', visible: true, locked: false },
  ],
  symbols: [], labels: [], shapes: [], scaleBar: true, compass: true, legend: false, updatedAt: '2026-01-01T00:00:00Z',
})
const draft = (): MapDraft => draftOf(doc())
const ids = (...seed: string[]) => { let n = 0; return () => seed[n++] ?? `x${n}` }
// A marker of the starter library placed in a square `size` cells wide, centred on (x, y).
const MARKERS = new Map(starterShapes().filter(s => s.category === 'marker').map(s => [s.id.slice('marker:'.length), s]))
const addMarker = (d: MapDraft, kind: string, x: number, y: number, size: number, makeId?: () => string) =>
  addLibraryShape(d, MARKERS.get(kind)!, { x0: x - size / 2, y0: y - size / 2, x1: x + size / 2, y1: y + size / 2 }, 'metric', makeId)

describe('the marker art (the old symbols)', () => {
  it('has the four sets, each with a handful of silhouettes', () => {
    expect(SYMBOL_SETS.map(s => s.id)).toEqual(['settlements', 'nature', 'interior', 'landmarks'])
    for (const set of SYMBOL_SETS) expect(set.symbols.length).toBeGreaterThanOrEqual(8)
  })

  it('gives every symbol an id of its own, a name and a path that is only path data', () => {
    const all = SYMBOL_SETS.flatMap(s => s.symbols)
    expect(new Set(all.map(s => s.id)).size).toBe(all.length)
    for (const s of all) {
      expect(s.name).not.toBe('')
      expect(s.path).toMatch(/^M[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s-]+Z$/)
      expect(s.path.startsWith('M')).toBe(true)
      expect(s.id).toMatch(/^[a-z-]+$/)
    }
  })

  it('keeps every drawn number inside the 24 box', () => {
    for (const { id, path } of SYMBOL_SETS.flatMap(s => s.symbols)) {
      // Absolute (upper-case) commands only carry coordinates in the box; the arcs' flags and radii are not coordinates, so only M, L, H, V are read.
      for (const m of path.matchAll(/[MLHV]\s*(-?[\d.]+)(?:[ ,]+(-?[\d.]+))?/g)) {
        for (const n of [m[1], m[2]].filter(Boolean)) expect(Number(n), `${id}: ${m[0]}`).toBeGreaterThanOrEqual(0)
        for (const n of [m[1], m[2]].filter(Boolean)) expect(Number(n), `${id}: ${m[0]}`).toBeLessThanOrEqual(24)
      }
    }
  })

  it('names a marker from its kind, and plainly one a writer made', () => {
    expect(markerName('marker:castle')).toBe('Castle')
    expect(markerName('marker:interest')).toBe('Point of interest')
    expect(markerName('marker:old_mill')).toBe('Old mill')
    expect(markerName('my_ab12')).toBe('Marker')
  })
})

describe('the map styles', () => {
  it('draws land levels in dark ink and space levels in light ink on the dark backdrop', () => {
    expect(mapStyle('regional')).toBe(LAND_STYLE)
    expect(mapStyle('interior')).toBe(BUILDING_STYLE)
    expect(mapStyle('architectural').plainWalls).toBe(true)
    expect(LAND_STYLE.plainWalls).toBeFalsy()
    expect(mapStyle('galactic')).toBe(SPACE_STYLE)
    expect(mapStyle(undefined)).toBe(LAND_STYLE)
  })

  it('reads a colour, and gray for nonsense', () => {
    expect(hexToRgb('#3b6ea5')).toEqual([59, 110, 165])
    expect(hexToRgb('nonsense')).toEqual([136, 136, 136])
  })

  it('draws text and symbols so they read in both styles', () => {
    const lum = (hex: string) => { const [r, g, b] = hexToRgb(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
    for (const t of [LAND_STYLE, SPACE_STYLE]) {
      // The halo is the other end of the lightness scale from the ink: the text stands out of it, and the halo out of any terrain behind.
      expect(Math.abs(lum(t.ink) - lum(t.halo)), t.id).toBeGreaterThan(110)
      expect(Math.abs(lum(t.symbol) - lum(t.halo)), t.id).toBeGreaterThan(110)
      expect(Math.abs(lum(t.ink) - lum(t.plate)), t.id).toBeGreaterThan(110)
    }
  })
})

describe('placing markers and labels', () => {
  it('snaps to the middle of a cell, or stays where it is', () => {
    expect(snapPoint(3.2, 4.9, false)).toEqual([3.5, 4.5])
    expect(snapPoint(3.2, 4.9, true)).toEqual([3.2, 4.9])
    expect(snapPoint(0, 0, false)).toEqual([0.5, 0.5])
  })

  it('puts a marker on the topmost shown, unlocked markers layer, in its square, and holds it to the map', () => {
    const d = draft()
    const r = addMarker(d, 'castle', 3.5, 2.5, 2, ids('a'))!
    const [m] = r.change.draft.shapes
    expect(m).toMatchObject({ id: 'mrk_a', layerId: 'symbols', type: 'region', style: 'halo', kind: 'marker:castle', fill: null })
    expect(m.points.every(p => p.x >= 2.5 && p.x <= 4.5 && p.y >= 1.5 && p.y <= 3.5)).toBe(true)
    const far = addMarker(d, 'tree', 19.5, 9.5, 4, ids('b'))!.change.draft.shapes[0]
    expect(far.points.every(p => p.x <= 20 && p.y <= 10)).toBe(true)
  })

  it('does not place on a hidden or locked layer, or past the most', () => {
    const d = draft()
    expect(addMarker(toggleLayer(d, 'symbols', 'locked')!.draft, 'castle', 1, 1, 2)).toBeNull()
    expect(addMarker(toggleLayer(d, 'symbols', 'visible')!.draft, 'castle', 1, 1, 2)).toBeNull()
    expect(addLabel(toggleLayer(d, 'labels', 'locked')!.draft, 'x', 1, 1, 1)).toBeNull()
    const one = addMarker(d, 'tree', 1, 1, 1)!.change.draft.shapes[0]
    const full: MapDraft = { ...d, shapes: Array.from({ length: MAX_MARKERS }, (_, i) => ({ ...one, id: `m${i}` })) }
    expect(addMarker(full, 'tree', 1, 1, 1)).toBeNull()
    const lots: MapDraft = { ...d, labels: Array.from({ length: MAX_LABELS }, (_, i) => ({ id: `l${i}`, layerId: 'labels', text: 'x', x: 1, y: 1, size: 1 })) }
    expect(addLabel(lots, 'x', 1, 1, 1)).toBeNull()
  })

  it('picks the topmost of two layers of one kind', () => {
    const d = draft()
    d.layers = [...d.layers, { id: 'symbols2', name: 'Markers 2', kind: 'symbols', visible: true, locked: false }]
    expect(activeLayerId(d, 'symbols')).toBe('symbols2')
    d.layers = d.layers.map(l => (l.id === 'symbols2' ? { ...l, locked: true } : l))
    expect(activeLayerId(d, 'symbols')).toBe('symbols')
  })

  it('does not reuse an id', () => {
    const d = addMarker(draft(), 'tree', 1, 1, 1, ids('a'))!.change.draft
    expect(addMarker(d, 'tree', 2, 2, 1, ids('a', 'b'))!.id).toBe('mrk_b')
  })

  it('makes a label with its text trimmed, and "Label" when it is blank', () => {
    const d = draft()
    expect(addLabel(d, '  Port Veyra ', 4, 3, 1.5, ids('a'))!.change.draft.labels[0]).toEqual({ id: 'lbl_a', layerId: 'labels', text: 'Port Veyra', x: 4, y: 3, size: 1.5 })
    expect(addLabel(d, '   ', 4, 3, 1, ids('a'))!.change.draft.labels[0].text).toBe('Label')
    expect(addLabel(d, 'x'.repeat(300), 4, 3, 1, ids('a'))!.change.draft.labels[0].text).toHaveLength(120)
  })
})

describe('editing, moving and removing', () => {
  const withItems = (): MapDraft => {
    let d = addMarker(draft(), 'castle', 5.5, 5.5, 2, ids('s'))!.change.draft
    d = addLabel(d, 'Keep', 8, 3, 1, ids('l'))!.change.draft
    return d
  }

  it('makes a marker another width about its middle, held to its range, and gives it a colour of its own', () => {
    const d = withItems()
    const w = shapeWidth(d.shapes[0])
    expect(shapeWidth(resizeShape(d, 'mrk_s', 4)!.draft.shapes[0])).toBeCloseTo(4, 2)
    expect(shapeWidth(resizeShape(d, 'mrk_s', 999)!.draft.shapes[0])).toBeLessThanOrEqual(16) // and held to the map
    expect(shapeWidth(resizeShape(d, 'mrk_s', 0)!.draft.shapes[0])).toBeCloseTo(0.25, 2)
    expect(resizeShape(d, 'mrk_s', w)).toBeNull()
    expect(resizeShape(d, 'mrk_s', NaN)).toBeNull()
    expect(resizeShape(d, 'nope', 3)).toBeNull()
    expect(editShape(d, 'mrk_s', { fill: '#aa0000' })!.draft.shapes[0].fill).toBe('#aa0000')
  })

  it('changes a label\'s text and size, and never makes its text blank', () => {
    const d = withItems()
    expect(editLabel(d, 'lbl_l', { text: ' Citadel ' })!.draft.labels[0].text).toBe('Citadel')
    expect(editLabel(d, 'lbl_l', { size: 3 })!.draft.labels[0].size).toBe(3)
    expect(editLabel(d, 'lbl_l', { text: '   ' })).toBeNull()
    expect(editLabel(d, 'lbl_l', { text: 'Keep' })).toBeNull()
    expect(editLabel(d, 'nope', { text: 'x' })).toBeNull()
  })

  it('removes an item, and finds it by its reference', () => {
    const d = withItems()
    expect(findItem(d, { kind: 'shape', id: 'mrk_s' })?.id).toBe('mrk_s')
    expect(findItem(d, { kind: 'label', id: 'mrk_s' })).toBeUndefined()
    expect(removeItem(d, { kind: 'shape', id: 'mrk_s' })!.draft.shapes).toEqual([])
    expect(removeItem(d, { kind: 'label', id: 'lbl_l' })!.draft.labels).toEqual([])
    expect(removeItem(d, { kind: 'label', id: 'nope' })).toBeNull()
  })

  it('moves a label, held to the map, and the move is one undo step', () => {
    const d = withItems()
    const moved = movedItem(movedItem(d, { kind: 'label', id: 'lbl_l' }, 7.5, 2.5), { kind: 'label', id: 'lbl_l' }, 99, 99)
    expect([moved.labels[0].x, moved.labels[0].y]).toEqual([20, 10])
    expect([d.labels[0].x, d.labels[0].y]).toEqual([8, 3])
    const h = new MapHistory()
    h.push(metaEdit(d, moved))
    const back = h.undo(moved)!
    expect([back.labels[0].x, back.labels[0].y]).toEqual([8, 3])
    expect(h.redo(back)!.labels[0].x).toBe(20)
  })

  it('takes an item\'s undo with it, a removed layer\'s items included', () => {
    const d = withItems()
    const r = removeLayer(d, 'symbols')!
    expect(r.draft.shapes).toEqual([])
    expect(r.draft.labels).toHaveLength(1)
    const h = new MapHistory()
    h.push(r.edit)
    expect(h.undo(r.draft)!.shapes).toHaveLength(1)
  })
})

describe('picking an item with the pointer', () => {
  it('hits a marker inside its outline, with a little room, and nothing elsewhere', () => {
    const d = addMarker(draft(), 'castle', 5.5, 5.5, 2, ids('s'))!.change.draft
    expect(hitItem(d, 5.5, 5.5)).toEqual({ kind: 'shape', id: 'mrk_s' })
    expect(hitItem(d, 6.6, 5.5)).toEqual({ kind: 'shape', id: 'mrk_s' }) // the room round it
    expect(hitItem(d, 7.5, 5.5)).toBeNull()
  })

  it('gives a tiny marker room to be hit', () => {
    const d = addMarker(draft(), 'tree', 5.5, 5.5, 0.25, ids('s'))!.change.draft
    expect(hitItem(d, 5.9, 5.5)?.id).toBe('mrk_s')
  })

  it('hits a label inside the box its text takes', () => {
    const d = addLabel(draft(), 'Port Veyra', 10, 5, 1, ids('l'))!.change.draft
    const { w } = labelExtent('Port Veyra', 1)
    expect(hitItem(d, 10 + w / 2 - 0.1, 5)).toEqual({ kind: 'label', id: 'lbl_l' })
    expect(hitItem(d, 10 + w / 2 + 1, 5)).toBeNull()
  })

  it('takes the later item of a layer, and the item on the higher layer', () => {
    let d = addMarker(draft(), 'tree', 5.5, 5.5, 2, ids('a'))!.change.draft
    d = addMarker(d, 'pine', 5.5, 5.5, 2, ids('b'))!.change.draft
    expect(hitItem(d, 5.5, 5.5)?.id).toBe('mrk_b')
    d = addLabel(d, 'on top', 5.5, 5.5, 1, ids('l'))!.change.draft
    expect(hitItem(d, 5.5, 5.5)).toEqual({ kind: 'label', id: 'lbl_l' }) // the labels layer is above the markers layer
  })

  it('cannot pick from a hidden or locked layer', () => {
    const d = addMarker(draft(), 'tree', 5.5, 5.5, 2, ids('a'))!.change.draft
    expect(hitItem(toggleLayer(d, 'symbols', 'locked')!.draft, 5.5, 5.5)).toBeNull()
    expect(hitItem(toggleLayer(d, 'symbols', 'visible')!.draft, 5.5, 5.5)).toBeNull()
  })

  it('knows the bounds of what it draws', () => {
    const d = addMarker(draft(), 'tree', 5, 5, 4, ids('a'))!.change.draft
    const b0 = itemBounds(d.shapes[0], 'shape')
    expect(b0.x0).toBeGreaterThanOrEqual(3 - 0.03)
    expect(b0.x1).toBeLessThanOrEqual(7 + 0.03)
    const l = addLabel(draft(), 'Hi', 5, 5, 2, ids('l'))!.change.draft.labels[0]
    const b = itemBounds(l, 'label')
    expect([(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]).toEqual([5, 5])
  })
})

describe('the legend', () => {
  const index = biomeIndex(STARTER_BIOMES, [{ id: 'own_x', name: 'Glass dunes', color: '#cfd8e0', group: 'land', levels: [], retired: false }])
  const noScale = (d: MapDraft) => legendEntries(d, index).filter(e => e.type !== 'heights')

  it('lists the biomes that are used, in the list order, and the kinds of symbol on the map, once each', () => {
    let d: MapDraft = { ...draft(), shapes: [makeBiomeShape('f', 'terrain', [[1, 1], [3, 1], [2, 3]], 'forest', false), makeBiomeShape('g', 'terrain', [[1, 1], [3, 1], [2, 3]], 'forest', false), makeBiomeShape('h', 'terrain', [[1, 1], [3, 1], [2, 3]], 'desert', false)] }
    d = addMarker(d, 'castle', 2, 2, 2, ids('a'))!.change.draft
    d = addMarker(d, 'castle', 4, 2, 2, ids('b'))!.change.draft
    d = addMarker(d, 'tree', 6, 2, 2, ids('c'))!.change.draft
    d = { ...d, shapes: [...d.shapes, { ...d.shapes[d.shapes.length - 1], id: 'own', kind: 'my_x1' }] }
    expect(noScale(d).map(e => (e.type === 'marker' ? [e.type, e.kind, e.name] : [e.type, e.name]))).toEqual([
      ['terrain', 'Saltwater'], ['terrain', 'Desert'], ['terrain', 'Forest'],
      ['marker', 'marker:castle', 'Castle'], ['marker', 'marker:tree', 'Tree'], ['marker', 'my_x1', 'Marker'],
    ])
  })

  it('leaves out the markers of a hidden layer', () => {
    const d = toggleLayer(addMarker(draft(), 'castle', 2, 2, 2, ids('a'))!.change.draft, 'symbols', 'visible')!.draft
    expect(noScale(d)).toEqual([{ type: 'terrain', name: 'Saltwater', color: '#2f62b0' }])
  })

  it('ends with the height scale on a map of land: the range of the level, or the map\'s own, in its unit', () => {
    const d = draft()
    const last = legendEntries(d, index).at(-1)
    expect(last).toEqual({ type: 'heights', name: 'Height', low: -19685, high: 19685, unit: 'ft' })
    expect(legendEntries({ ...d, heightRange: 1500 }, index).at(-1)).toEqual({ type: 'heights', name: 'Height', low: -1500, high: 1500, unit: 'ft' })
    expect(legendEntries({ ...d, units: 'metric' }, index).at(-1)).toMatchObject({ high: 6000, unit: 'm' })
    expect(legendEntries({ ...d, level: 'galactic' }, index).some(e => e.type === 'heights')).toBe(false)
    expect(legendEntries({ ...d, level: 'interior' }, index).some(e => e.type === 'heights')).toBe(false)
  })

  it('in the Nations view lists the political areas that are shown, nations first, in their fill, and no biomes or heights', () => {
    const region = (id: string, political: MapShape['political'], name: string, fill: string | null): MapShape => ({
      id, layerId: 'shapes', type: 'region', style: 'solid', color: null, width: 0.2, fill, opacity: 0.6, pattern: 'solid', political, name,
      points: [{ x: 1, y: 1, smooth: false, hx: null, hy: null }, { x: 3, y: 1, smooth: false, hx: null, hy: null }, { x: 2, y: 3, smooth: false, hx: null, hy: null }],
    })
    const d: MapDraft = { ...draft(), layers: [...draft().layers, { id: 'shapes', name: 'Shapes', kind: 'shapes', visible: true, locked: false }], shapes: [
      makeBiomeShape('f', 'terrain', [[1, 1], [3, 1], [2, 3]], 'forest', false),
      region('s', 'state', 'Lowmarch', '#7fa8d9'), region('n', 'nation', 'Veyra', '#d98c6a'), region('r', null, 'Old road', '#123456'),
    ] }
    expect(legendEntries(d, index, true)).toEqual([{ type: 'terrain', name: 'Veyra', color: '#d98c6a' }, { type: 'terrain', name: 'Lowmarch', color: '#7fa8d9' }])
    expect(legendEntries(toggleLayer(d, 'shapes', 'visible')!.draft, index, true)).toEqual([])
  })

  it('names the project\'s own biomes and an unknown one', () => {
    const d: MapDraft = { ...draft(), shapes: [makeBiomeShape('a', 'terrain', [[1, 1], [3, 1], [2, 3]], 'own_x', false), makeBiomeShape('b', 'terrain', [[1, 1], [3, 1], [2, 3]], 'gone', false)] }
    expect(noScale(d).map(e => e.name)).toEqual(['Saltwater', 'Glass dunes', 'Unknown biome'])
  })
})

describe('the scale bar', () => {
  it('picks a round length of about the target', () => {
    // 10 miles a cell at 8 px a cell: 110 px is about 137 miles, so 100 miles.
    const s = niceScale(10, 8)!
    expect(s.units).toBe(100)
    expect(s.px).toBe(80)
    expect(niceScale(1, 20)!.units).toBe(5) // 110 / 20 = 5.5 cells
    expect(niceScale(1, 40)!.units).toBe(2) // 2.75
    expect(niceScale(0.5, 1)!.units).toBe(50) // 55
  })

  it('stays within the target and is 1, 2 or 5 times a power of ten', () => {
    for (const zoom of [1, 1.7, 3, 6.82, 11, 24, 64]) {
      for (const cell of [0.5, 1, 3, 10, 25, 1000]) {
        const s = niceScale(cell, zoom)!
        expect(s.px, `${cell}@${zoom}`).toBeLessThanOrEqual(110 + 1e-9)
        expect(s.px).toBeGreaterThan(110 / 2.6)
        expect(String(s.units)).toMatch(/^[125](0*|\.0*[125]?)$|^0\.0*[125]$|^[125]0*$/)
      }
    }
  })

  it('has none without a scale or a zoom', () => {
    expect(niceScale(0, 8)).toBeNull()
    expect(niceScale(10, 0)).toBeNull()
  })
})
