import { describe, expect, it } from 'vitest'
import type { MapDoc, MapSummary } from '../../../../api/types'
import {
  MAP_MAX_LAYERS, MAP_MAX_TERRAINS, MapHistory, Stroke, addLayer, addTerrain, brushCells, decodeCells, docOf, draftOf, editTerrain, encodeCells, floodFill,
  lineBetween, mapRows, moveLayer, removeLayer, removeTerrain, renameLayer, resize, setScale, setTitle, summaryOf, terrainCounts, terrainEditable, toggleLayer, setOverlay, setTheme,
  type MapDraft,
} from './mapModel'

const TERRAINS = [
  { id: 'sea', name: 'Sea', color: '#3b6ea5', builtIn: true },
  { id: 'land', name: 'Land', color: '#a8c66c', builtIn: true },
  { id: 'wood', name: 'Wood', color: '#4f8a4a', builtIn: true },
]
const LAYERS = [
  { id: 'terrain', name: 'Terrain', kind: 'terrain' as const, visible: true, locked: false },
  { id: 'labels', name: 'Labels', kind: 'labels' as const, visible: true, locked: false },
]

function doc(width = 4, height = 3, cells?: number[]): MapDoc {
  return {
    schemaVersion: 2, id: 'map_1', title: 'World', kind: 'world', parentId: null, order: 0, width, height, cellSize: 10, unit: 'miles',
    terrains: TERRAINS, layers: LAYERS, cells: cells ?? [0, width * height], symbols: [], labels: [], shapes: [], theme: 'modern', scaleBar: true, compass: true, legend: false,
    updatedAt: '2026-01-01T00:00:00Z',
  }
}
const draft = (w = 4, h = 3, cells?: number[]): MapDraft => draftOf(doc(w, h, cells))
const ids = (seed: string[]) => { let n = 0; return () => seed[n++] ?? `x${n}` }

describe('the cells', () => {
  it('decodes run pairs into one terrain per cell and encodes them back', () => {
    const cells = decodeCells([0, 2, 1, 3, 2, 1], 6)
    expect(Array.from(cells)).toEqual([0, 0, 1, 1, 1, 2])
    expect(encodeCells(cells)).toEqual([0, 2, 1, 3, 2, 1])
  })

  it('cuts a surplus and fills a shortfall with the first terrain', () => {
    expect(Array.from(decodeCells([1, 9], 4))).toEqual([1, 1, 1, 1])
    expect(Array.from(decodeCells([1, 2], 4))).toEqual([1, 1, 0, 0])
  })

  it('round-trips a whole map through its draft', () => {
    const original = doc(4, 3, [0, 3, 2, 5, 1, 4])
    expect(docOf(draftOf(original))).toEqual(original)
  })

  it('codes a full-size map in a few runs', () => {
    const cells = new Uint16Array(512 * 512)
    cells.fill(1, 1000, 2000)
    expect(encodeCells(cells)).toEqual([0, 1000, 1, 1000, 0, 512 * 512 - 2000])
  })
})

describe('painting', () => {
  it('a brush covers the cells around a point and stays on the map', () => {
    const d = draft(4, 3)
    expect(brushCells(d, 1, 1, 1)).toEqual([5])
    expect(brushCells(d, 1, 1, 3).sort((a, b) => a - b)).toEqual([0, 1, 2, 4, 5, 6, 8, 9, 10])
    expect(brushCells(d, 0, 0, 3).sort((a, b) => a - b)).toEqual([0, 1, 4, 5])
    expect(brushCells(d, 9, 9, 1)).toEqual([])
  })

  it('a line between two cells includes both ends and is connected', () => {
    expect(lineBetween(0, 0, 3, 0)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]])
    expect(lineBetween(2, 2, 2, 2)).toEqual([[2, 2]])
    const diagonal = lineBetween(0, 0, 4, 2)
    expect(diagonal[0]).toEqual([0, 0])
    expect(diagonal[diagonal.length - 1]).toEqual([4, 2])
    for (let i = 1; i < diagonal.length; i += 1) {
      expect(Math.abs(diagonal[i][0] - diagonal[i - 1][0])).toBeLessThanOrEqual(1)
      expect(Math.abs(diagonal[i][1] - diagonal[i - 1][1])).toBeLessThanOrEqual(1)
    }
  })

  it('a stroke paints along the pointer and is one undo that puts every cell back', () => {
    const d = draft(5, 1)
    const stroke = new Stroke(d, 2, 1)
    stroke.paint(null, null, 0, 0)
    stroke.paint(0, 0, 3, 0)
    expect(Array.from(d.cells)).toEqual([2, 2, 2, 2, 0])
    const edit = stroke.finish()!
    expect(edit.kind).toBe('cells')
    const history = new MapHistory()
    history.push(edit)
    history.undo(d)
    expect(Array.from(d.cells)).toEqual([0, 0, 0, 0, 0])
    history.redo(d)
    expect(Array.from(d.cells)).toEqual([2, 2, 2, 2, 0])
  })

  it('a stroke that changes nothing leaves no undo entry', () => {
    const d = draft(3, 1)
    const stroke = new Stroke(d, 0, 1)
    stroke.paint(null, null, 1, 0)
    expect(stroke.finish()).toBeNull()
  })

  it('a stroke that paints a cell and paints it back changes nothing', () => {
    const d = draft(3, 1)
    const a = new Stroke(d, 1, 1)
    a.paint(null, null, 1, 0)
    d.cells[1] = 0
    expect(a.finish()).toBeNull()
  })
})

describe('the fill', () => {
  it('fills the connected area of one terrain and not the diagonal neighbour', () => {
    //  0 0 1
    //  0 1 0
    //  1 0 0
    const d = draft(3, 3, [0, 2, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 2])
    expect(Array.from(d.cells)).toEqual([0, 0, 1, 0, 1, 0, 1, 0, 0])
    const edit = floodFill(d, 0, 0, 2)!
    expect(Array.from(d.cells)).toEqual([2, 2, 1, 2, 1, 0, 1, 0, 0])
    new MapHistory().push(edit)
  })

  it('does nothing on the terrain already there or off the map', () => {
    const d = draft(3, 3)
    expect(floodFill(d, 1, 1, 0)).toBeNull()
    expect(floodFill(d, 5, 5, 1)).toBeNull()
  })

  it('fills a whole empty map and can be undone', () => {
    const d = draft(6, 6)
    const edit = floodFill(d, 3, 3, 1)!
    expect(terrainCounts(d.cells, 3)).toEqual([0, 36, 0])
    const history = new MapHistory()
    history.push(edit)
    history.undo(d)
    expect(terrainCounts(d.cells, 3)).toEqual([36, 0, 0])
  })

  it('fills a large map without running out of stack', () => {
    const d = draft(512, 512)
    expect(floodFill(d, 0, 0, 1)).not.toBeNull()
    expect(terrainCounts(d.cells, 3)).toEqual([0, 512 * 512, 0])
  })
})

describe('the undo log', () => {
  it('a new change takes the redo away', () => {
    const d = draft(3, 1)
    const h = new MapHistory()
    const s1 = new Stroke(d, 1, 1); s1.paint(null, null, 0, 0); h.push(s1.finish()!)
    h.undo(d)
    expect(h.canRedo).toBe(true)
    const s2 = new Stroke(d, 2, 1); s2.paint(null, null, 1, 0); h.push(s2.finish()!)
    expect(h.canRedo).toBe(false)
    expect(h.canUndo).toBe(true)
  })

  it('keeps only the latest entries', () => {
    const d = draft(3, 1)
    const h = new MapHistory(2)
    for (let t = 1; t <= 3; t += 1) { const s = new Stroke(d, t % 3, 1); s.paint(null, null, 0, 0); h.push(s.finish()!) }
    h.undo(d); h.undo(d)
    expect(h.canUndo).toBe(false)
  })

  it('does nothing to undo or redo when there is nothing', () => {
    const h = new MapHistory()
    expect(h.undo(draft())).toBeNull()
    expect(h.redo(draft())).toBeNull()
  })

  it('takes a resize and a removed terrain back with their cells', () => {
    let d = draft(4, 3, [0, 4, 2, 4, 1, 4])
    const h = new MapHistory()
    const small = resize(d, 2, 2)!
    h.push(small.edit)
    d = small.draft
    expect([d.width, d.height, d.cells.length]).toEqual([2, 2, 4])
    d = h.undo(d)!
    expect([d.width, d.height, d.cells.length]).toEqual([4, 3, 12])
    expect(Array.from(d.cells)).toEqual([0, 0, 0, 0, 2, 2, 2, 2, 1, 1, 1, 1])
    d = h.redo(d)!
    expect([d.width, d.height]).toEqual([2, 2])
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
    expect(setScale(d, 0, 'miles')).toBeNull()
    expect(setScale(d, NaN, 'miles')).toBeNull()
    expect(setScale(d, 10, 'miles')).toBeNull()
    const r = setScale(d, 2.5, ' paces ')!
    expect([r.draft.cellSize, r.draft.unit]).toEqual([2.5, 'paces'])
    expect(setScale(d, 10, '   ')).toBeNull() // a blank unit keeps the old one
  })

  it('a resize keeps what the old cells cover, from the top left, and fills the rest with the first terrain', () => {
    const d = draft(3, 2, [1, 3, 2, 3])
    const bigger = resize(d, 4, 3)!.draft
    expect(Array.from(bigger.cells)).toEqual([1, 1, 1, 0, 2, 2, 2, 0, 0, 0, 0, 0])
    const smaller = resize(d, 2, 1)!.draft
    expect(Array.from(smaller.cells)).toEqual([1, 1])
  })

  it('a resize is held to the largest side and does nothing at the same size', () => {
    const d = draft(3, 2)
    expect(resize(d, 3, 2)).toBeNull()
    const big = resize(d, 9999, 0)!.draft
    expect([big.width, big.height]).toEqual([512, 1])
  })
})

describe('the look and the overlays', () => {
  it('changes the look and says nothing changed when it is the same', () => {
    const d = draft()
    expect(setTheme(d, 'night')!.draft.theme).toBe('night')
    expect(setTheme(d, 'modern')).toBeNull()
  })

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

describe('terrain', () => {
  it('adds a terrain at the end with an id of its own', () => {
    const d = draft()
    const r = addTerrain(d, '  Salt flats ', '#efe6d2', ids(['aa']))!
    expect(r.index).toBe(3)
    expect(r.change.draft.terrains[3]).toEqual({ id: 'ter_aa', name: 'Salt flats', color: '#efe6d2', builtIn: false })
  })

  it('does not reuse an id and stops at the most terrains', () => {
    const d = draft()
    d.terrains = [...d.terrains, { id: 'ter_aa', name: 'x', color: '#000000', builtIn: false }]
    expect(addTerrain(d, 'y', '#111111', ids(['aa', 'bb']))!.change.draft.terrains.at(-1)!.id).toBe('ter_bb')
    d.terrains = Array.from({ length: MAP_MAX_TERRAINS }, (_, i) => ({ id: `t${i}`, name: 'n', color: '#000000', builtIn: false }))
    expect(addTerrain(d, 'y', '#111111')).toBeNull()
  })

  it('renames and recolours a terrain, and a blank name keeps the old one', () => {
    const d = draft()
    expect(editTerrain(d, 1, { name: 'Meadow' })!.draft.terrains[1].name).toBe('Meadow')
    expect(editTerrain(d, 1, { name: '  ' })).toBeNull()
    expect(editTerrain(d, 1, { color: '#112233' })!.draft.terrains[1].color).toBe('#112233')
    expect(editTerrain(d, 9, { name: 'x' })).toBeNull()
  })

  it('removing a terrain turns its cells into the first terrain and moves the later indexes down', () => {
    const d = draft(3, 1, [2, 1, 1, 2])
    expect(Array.from(d.cells)).toEqual([2, 1, 1])
    const r = removeTerrain(d, 1)!.draft
    expect(r.terrains.map(t => t.id)).toEqual(['sea', 'wood'])
    expect(Array.from(r.cells)).toEqual([1, 0, 0])
  })

  it('never removes the last terrain', () => {
    const d = draft()
    d.terrains = [d.terrains[0]]
    expect(removeTerrain(d, 0)).toBeNull()
  })

  it('counts the cells of each terrain', () => {
    expect(terrainCounts(draft(4, 1, [0, 1, 1, 2, 2, 1]).cells, 3)).toEqual([1, 2, 1])
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

  it('removes a layer but never the terrain layer', () => {
    const d = draft()
    expect(removeLayer(d, 'labels')!.draft.layers.map(l => l.id)).toEqual(['terrain'])
    expect(removeLayer(d, 'terrain')).toBeNull()
  })

  it('terrain can be painted only while its layer is shown and unlocked', () => {
    const d = draft()
    expect(terrainEditable(d)).toBe(true)
    expect(terrainEditable(toggleLayer(d, 'terrain', 'locked')!.draft)).toBe(false)
    expect(terrainEditable(toggleLayer(d, 'terrain', 'visible')!.draft)).toBe(false)
  })

  it('a layer change is an undo entry that puts the layers back', () => {
    const d = draft()
    const r = toggleLayer(d, 'labels', 'visible')!
    const h = new MapHistory()
    h.push(r.edit)
    const back = h.undo(r.draft)!
    expect(back.layers[1].visible).toBe(true)
    expect(back.cells).toBe(r.draft.cells)
  })
})

describe('the tree of maps', () => {
  const s = (id: string, parentId: string | null, order = 0, title = id): MapSummary => ({ id, title, kind: 'world', parentId, order, width: 2, height: 2, updatedAt: 'x' })

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

  it('makes a summary without the cells', () => {
    expect(Object.keys(summaryOf(doc())).sort()).toEqual(['height', 'id', 'kind', 'order', 'parentId', 'title', 'updatedAt', 'width'])
  })
})
