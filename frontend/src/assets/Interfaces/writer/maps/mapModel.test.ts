import { describe, expect, it } from 'vitest'
import type { MapDoc, MapSummary } from '../../../../api/types'
import {
  MAP_MAX_LAYERS, MapHistory, addLayer, biomeLayer, docOf, draftOf, mapRows, moveLayer, removeLayer, renameLayer, resize, setBase, setLevel, setScale, setTitle, setUnits,
  summaryOf, toggleLayer, setOverlay, type MapDraft,
} from './mapModel'

const LAYERS = [
  { id: 'terrain', name: 'Biomes', kind: 'terrain' as const, visible: true, locked: false },
  { id: 'labels', name: 'Labels', kind: 'labels' as const, visible: true, locked: false },
]

function doc(width = 4, height = 3): MapDoc {
  return {
    schemaVersion: 2, id: 'map_1', title: 'World', level: 'continental', mapFormat: 2, base: { biome: 'saltwater', height: -200 }, units: 'metric',
    parentId: null, order: 0, width, height, cellSize: 25, unit: 'km', pace: null,
    layers: LAYERS, symbols: [], labels: [], shapes: [], scaleBar: true, compass: true, legend: false,
    updatedAt: '2026-01-01T00:00:00Z',
  }
}
const draft = (w = 4, h = 3): MapDraft => draftOf(doc(w, h))
const ids = (seed: string[]) => { let n = 0; return () => seed[n++] ?? `x${n}` }

describe('the draft', () => {
  it('round-trips a whole map through its draft', () => {
    const original = doc(4, 3)
    expect(docOf(draftOf(original))).toEqual(original)
  })
})

describe('the undo log', () => {
  it('a field change is one undo step and its redo', () => {
    const d = draft()
    const h = new MapHistory()
    const r = setTitle(d, 'Known World')!
    h.push(r.edit)
    const back = h.undo(r.draft)!
    expect(back.title).toBe('World')
    expect(h.redo(back)!.title).toBe('Known World')
  })

  it('a new change takes the redo away', () => {
    let d = draft()
    const h = new MapHistory()
    const a = setTitle(d, 'A')!; h.push(a.edit); d = a.draft
    d = h.undo(d)!
    expect(h.canRedo).toBe(true)
    const b = setTitle(d, 'B')!; h.push(b.edit)
    expect(h.canRedo).toBe(false)
    expect(h.canUndo).toBe(true)
  })

  it('keeps only the latest entries', () => {
    let d = draft()
    const h = new MapHistory(2)
    for (const t of ['A', 'B', 'C']) { const r = setTitle(d, t)!; h.push(r.edit); d = r.draft }
    d = h.undo(d)!; d = h.undo(d)!
    expect(h.canUndo).toBe(false)
    expect(d.title).toBe('A')
  })

  it('does nothing to undo or redo when there is nothing', () => {
    const h = new MapHistory()
    expect(h.undo(draft())).toBeNull()
    expect(h.redo(draft())).toBeNull()
  })

  it('takes a resize back', () => {
    let d = draft(4, 3)
    const h = new MapHistory()
    const small = resize(d, 2, 2)!
    h.push(small.edit)
    d = small.draft
    expect([d.width, d.height]).toEqual([2, 2])
    d = h.undo(d)!
    expect([d.width, d.height]).toEqual([4, 3])
    const again = h.redo(d)!
    expect([again.width, again.height]).toEqual([2, 2])
  })
})

describe('the level, the base and the units', () => {
  it('changes the level, and says nothing changed at the same one', () => {
    const d = draft()
    expect(setLevel(d, 'regional')!.draft.level).toBe('regional')
    expect(setLevel(d, 'continental')).toBeNull()
  })

  it('changes the biome or the height under everything', () => {
    const d = draft()
    expect(setBase(d, { biome: 'plain' })!.draft.base).toEqual({ biome: 'plain', height: -200 })
    expect(setBase(d, { height: 50 })!.draft.base).toEqual({ biome: 'saltwater', height: 50 })
    expect(setBase(d, { biome: 'saltwater', height: -200 })).toBeNull()
  })

  it('converts every number into the other system, or keeps them, as one undo step', () => {
    const d = { ...draft(), pace: 40, shapes: [{ id: 'b', layerId: 'terrain', type: 'biome' as const, points: [], style: 'solid' as const, color: null, width: 0.25, fill: null, opacity: 1, pattern: 'solid' as const, biome: 'rocky', heightMode: 'raise' as const, height: 1000 }] }
    const r = setUnits(d, 'imperial', 'convert')!
    expect([r.draft.units, r.draft.unit, r.draft.cellSize, r.draft.pace]).toEqual(['imperial', 'mi', 15.5, 24.9])
    expect(r.draft.base.height).toBe(-656)
    expect(r.draft.shapes[0].height).toBe(3281)
    const kept = setUnits(d, 'imperial', 'keep')!.draft
    expect([kept.unit, kept.cellSize, kept.base.height]).toEqual(['mi', 25, -200])
    const h = new MapHistory()
    h.push(r.edit)
    expect(h.undo(r.draft)!.unit).toBe('km')
    expect(setUnits(d, 'metric', 'convert')).toBeNull()
  })
})

describe('the map\'s fields', () => {
  it('a title is trimmed, kept to its length and never blank', () => {
    const d = draft()
    expect(setTitle(d, '   ')).toBeNull()
    expect(setTitle(d, 'World')).toBeNull()
    expect(setTitle(d, '  Known World  ')!.draft.title).toBe('Known World')
    expect(setTitle(d, 'x'.repeat(300))!.draft.title).toHaveLength(120)
  })

  it('a scale needs a positive size and a unit', () => {
    const d = draft()
    expect(setScale(d, 0, 'km')).toBeNull()
    expect(setScale(d, NaN, 'km')).toBeNull()
    expect(setScale(d, 25, 'km')).toBeNull()
    const r = setScale(d, 2.5, ' paces ')!
    expect([r.draft.cellSize, r.draft.unit]).toEqual([2.5, 'paces'])
    expect(setScale(d, 25, '   ')).toBeNull() // a blank unit keeps the old one
  })

  it('a resize is held to the largest side and does nothing at the same size', () => {
    const d = draft(3, 2)
    expect(resize(d, 3, 2)).toBeNull()
    const big = resize(d, 9999, 0)!.draft
    expect([big.width, big.height]).toEqual([512, 1])
  })
})

describe('the overlays', () => {
  it('turns the scale bar, compass and legend on and off, each an undo step', () => {
    const d = draft()
    expect(setOverlay(d, 'legend', true)!.draft.legend).toBe(true)
    expect(setOverlay(d, 'scaleBar', false)!.draft.scaleBar).toBe(false)
    expect(setOverlay(d, 'compass', true)).toBeNull()
    const r = setOverlay(d, 'legend', true)!
    const h = new MapHistory()
    h.push(r.edit)
    expect(h.undo(r.draft)!.legend).toBe(false)
  })
})

describe('layers', () => {
  it('shows, hides, locks and renames a layer', () => {
    const d = draft()
    expect(toggleLayer(d, 'labels', 'visible')!.draft.layers[1].visible).toBe(false)
    expect(toggleLayer(d, 'terrain', 'locked')!.draft.layers[0].locked).toBe(true)
    expect(toggleLayer(d, 'nope', 'visible')).toBeNull()
    expect(renameLayer(d, 'labels', ' Names ')!.draft.layers[1].name).toBe('Names')
    expect(renameLayer(d, 'labels', '  ')).toBeNull()
    expect(renameLayer(d, 'labels', 'Labels')).toBeNull()
  })

  it('moves a layer up and down within the stack', () => {
    const d = draft()
    expect(moveLayer(d, 'terrain', 1)!.draft.layers.map(l => l.id)).toEqual(['labels', 'terrain'])
    expect(moveLayer(d, 'terrain', -1)).toBeNull()
    expect(moveLayer(d, 'labels', 1)).toBeNull()
  })

  it('adds a layer on top with a numbered name and stops at the most layers', () => {
    const d = draft()
    const r = addLayer(d, 'labels', ids(['n1']))!.draft
    expect(r.layers.at(-1)).toEqual({ id: 'lay_n1', name: 'Labels 2', kind: 'labels', visible: true, locked: false })
    d.layers = Array.from({ length: MAP_MAX_LAYERS }, (_, i) => ({ id: `l${i}`, name: 'n', kind: 'notes' as const, visible: true, locked: false }))
    expect(addLayer(d, 'notes')).toBeNull()
  })

  it('removes a layer but never the biomes layer', () => {
    const d = draft()
    expect(removeLayer(d, 'labels')!.draft.layers.map(l => l.id)).toEqual(['terrain'])
    expect(removeLayer(d, 'terrain')).toBeNull()
  })

  it('biome areas are drawn only while the biomes layer is shown and unlocked', () => {
    const d = draft()
    expect(biomeLayer(d)?.id).toBe('terrain')
    expect(biomeLayer(toggleLayer(d, 'terrain', 'locked')!.draft)).toBeNull()
    expect(biomeLayer(toggleLayer(d, 'terrain', 'visible')!.draft)).toBeNull()
  })

  it('a layer change is an undo entry that puts the layers back', () => {
    const d = draft()
    const r = toggleLayer(d, 'labels', 'visible')!
    const h = new MapHistory()
    h.push(r.edit)
    const back = h.undo(r.draft)!
    expect(back.layers[1].visible).toBe(true)
    expect(back.shapes).toBe(r.draft.shapes)
  })
})

describe('the tree of maps', () => {
  const s = (id: string, parentId: string | null, order = 0, title = id): MapSummary => ({ id, title, level: 'planetary', parentId, order, width: 2, height: 2, updatedAt: 'x' })

  it('lists each map with the maps inside it under it', () => {
    const rows = mapRows([s('room', 'town'), s('b', null, 1), s('world', null, 0), s('town', 'world')])
    expect(rows.map(r => [r.map.id, r.depth, r.hasChildren])).toEqual([['world', 0, true], ['town', 1, true], ['room', 2, false], ['b', 0, false]])
  })

  it('breaks ties by title and treats a map whose parent is missing as a top one', () => {
    const rows = mapRows([s('z', null, 0, 'Zed'), s('a', null, 0, 'Ann'), s('lost', 'gone')])
    expect(rows.map(r => r.map.id)).toEqual(['a', 'lost', 'z'])
  })

  it('does not loop on a cycle', () => {
    expect(mapRows([s('a', 'b'), s('b', 'a')])).toEqual([])
  })

  it('makes a summary without the shapes', () => {
    expect(Object.keys(summaryOf(doc())).sort()).toEqual(['appliesFrom', 'floor', 'height', 'id', 'kind', 'level', 'order', 'parentId', 'title', 'updatedAt', 'versionOf', 'width'])
  })
})
