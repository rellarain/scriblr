import { describe, expect, it } from 'vitest'
import type { MapDoc } from '../../../../api/types'
import { SYMBOL_SETS, UNKNOWN_SYMBOL_PATH, symbolDef, symbolName, symbolPath } from './mapSymbols'
import { MAP_THEMES, hexToRgb, themeDef, themeRgb } from './mapThemes'
import {
  MAX_LABELS, MAX_SYMBOLS, activeLayerId, addLabel, addSymbol, editLabel, editSymbol, findItem, hitItem, itemBounds, labelExtent, legendEntries, movedItem,
  niceScale, removeItem, snapPoint,
} from './mapItems'
import { MapHistory, draftOf, metaEdit, removeLayer, toggleLayer, type MapDraft } from './mapModel'

const doc = (): MapDoc => ({
  schemaVersion: 2, id: 'map_1', title: 'World', kind: 'world', parentId: null, order: 0, width: 20, height: 10, cellSize: 10, unit: 'miles',
  terrains: [{ id: 'sea', name: 'Sea', color: '#3b6ea5', builtIn: true }, { id: 'land', name: 'Land', color: '#a8c66c', builtIn: true }, { id: 'wood', name: 'Wood', color: '#4f8a4a', builtIn: true }],
  layers: [
    { id: 'terrain', name: 'Terrain', kind: 'terrain', visible: true, locked: false },
    { id: 'symbols', name: 'Symbols', kind: 'symbols', visible: true, locked: false },
    { id: 'labels', name: 'Labels', kind: 'labels', visible: true, locked: false },
  ],
  cells: [0, 200], symbols: [], labels: [], shapes: [], theme: 'modern', scaleBar: true, compass: true, legend: false, updatedAt: '2026-01-01T00:00:00Z',
})
const draft = (): MapDraft => draftOf(doc())
const ids = (...seed: string[]) => { let n = 0; return () => seed[n++] ?? `x${n}` }

describe('the symbol library', () => {
  it('has the four sets, each with a handful of symbols', () => {
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

  it('looks a symbol up, and draws a diamond for a kind it does not have', () => {
    expect(symbolDef('castle')?.name).toBe('Castle')
    expect(symbolName('castle')).toBe('Castle')
    expect(symbolDef('nope')).toBeUndefined()
    expect(symbolPath('nope')).toBe(UNKNOWN_SYMBOL_PATH)
    expect(symbolName('nope')).toBe('Symbol')
  })
})

describe('the themes', () => {
  it('has the four looks and falls back to modern', () => {
    expect(MAP_THEMES.map(t => t.id)).toEqual(['parchment', 'modern', 'night', 'blueprint'])
    expect(themeDef('night').name).toBe('Night')
    expect(themeDef('nope' as never).id).toBe('modern')
  })

  it('shows a terrain colour as it is in the modern look', () => {
    expect(themeRgb('#3b6ea5', 'modern')).toEqual([59, 110, 165])
    expect(hexToRgb('nonsense')).toEqual([136, 136, 136])
  })

  it('changes the colours of the other looks and keeps the terrains apart', () => {
    for (const theme of ['parchment', 'night', 'blueprint'] as const) {
      const sea = themeRgb('#3b6ea5', theme), snow = themeRgb('#eef3f7', theme), land = themeRgb('#a8c66c', theme)
      expect(sea, theme).not.toEqual([59, 110, 165])
      expect(new Set([sea.join(), snow.join(), land.join()]).size, theme).toBe(3)
      for (const v of [...sea, ...snow, ...land]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(255) }
    }
  })

  it('makes night darker and blueprint blue', () => {
    const lum = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
    expect(lum(themeRgb('#a8c66c', 'night'))).toBeLessThan(lum([168, 198, 108]))
    const [r, , b] = themeRgb('#a8c66c', 'blueprint')
    expect(b).toBeGreaterThan(r)
  })

  it('draws text and symbols so they read on their own look', () => {
    const lum = (hex: string) => { const [r, g, b] = hexToRgb(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
    for (const t of MAP_THEMES) {
      // The halo is the other end of the lightness scale from the ink: the text stands out of it, and the halo out of any terrain behind.
      expect(Math.abs(lum(t.ink) - lum(t.halo)), t.id).toBeGreaterThan(110)
      expect(Math.abs(lum(t.symbol) - lum(t.halo)), t.id).toBeGreaterThan(110)
      expect(Math.abs(lum(t.ink) - lum(t.plate)), t.id).toBeGreaterThan(110)
    }
  })
})

describe('placing symbols and labels', () => {
  it('snaps to the middle of a cell, or stays where it is', () => {
    expect(snapPoint(3.2, 4.9, false)).toEqual([3.5, 4.5])
    expect(snapPoint(3.2, 4.9, true)).toEqual([3.2, 4.9])
    expect(snapPoint(0, 0, false)).toEqual([0.5, 0.5])
  })

  it('puts a symbol on the topmost shown, unlocked symbols layer, and holds it to the map', () => {
    const d = draft()
    const r = addSymbol(d, 'castle', 3.5, 2.5, 2, ids('a'))!
    expect(r.change.draft.symbols).toEqual([{ id: 'sym_a', layerId: 'symbols', kind: 'castle', x: 3.5, y: 2.5, size: 2, color: null }])
    const far = addSymbol(d, 'tree', 99, -4, 99, ids('b'))!.change.draft.symbols[0]
    expect([far.x, far.y, far.size]).toEqual([20, 0, 16])
  })

  it('does not place on a hidden or locked layer, or past the most', () => {
    const d = draft()
    expect(addSymbol(toggleLayer(d, 'symbols', 'locked')!.draft, 'castle', 1, 1, 2)).toBeNull()
    expect(addSymbol(toggleLayer(d, 'symbols', 'visible')!.draft, 'castle', 1, 1, 2)).toBeNull()
    expect(addLabel(toggleLayer(d, 'labels', 'locked')!.draft, 'x', 1, 1, 1)).toBeNull()
    const full: MapDraft = { ...d, symbols: Array.from({ length: MAX_SYMBOLS }, (_, i) => ({ id: `s${i}`, layerId: 'symbols', kind: 'tree', x: 1, y: 1, size: 1, color: null })) }
    expect(addSymbol(full, 'tree', 1, 1, 1)).toBeNull()
    const lots: MapDraft = { ...d, labels: Array.from({ length: MAX_LABELS }, (_, i) => ({ id: `l${i}`, layerId: 'labels', text: 'x', x: 1, y: 1, size: 1 })) }
    expect(addLabel(lots, 'x', 1, 1, 1)).toBeNull()
  })

  it('picks the topmost of two layers of one kind', () => {
    const d = draft()
    d.layers = [...d.layers, { id: 'symbols2', name: 'Symbols 2', kind: 'symbols', visible: true, locked: false }]
    expect(activeLayerId(d, 'symbols')).toBe('symbols2')
    d.layers = d.layers.map(l => (l.id === 'symbols2' ? { ...l, locked: true } : l))
    expect(activeLayerId(d, 'symbols')).toBe('symbols')
  })

  it('does not reuse an id', () => {
    const d = addSymbol(draft(), 'tree', 1, 1, 1, ids('a'))!.change.draft
    expect(addSymbol(d, 'tree', 2, 2, 1, ids('a', 'b'))!.id).toBe('sym_b')
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
    let d = addSymbol(draft(), 'castle', 5.5, 5.5, 2, ids('s'))!.change.draft
    d = addLabel(d, 'Keep', 8, 3, 1, ids('l'))!.change.draft
    return d
  }

  it('changes a symbol\'s size, colour and kind, and holds the size to its range', () => {
    const d = withItems()
    expect(editSymbol(d, 'sym_s', { size: 4 })!.draft.symbols[0].size).toBe(4)
    expect(editSymbol(d, 'sym_s', { size: 999 })!.draft.symbols[0].size).toBe(16)
    expect(editSymbol(d, 'sym_s', { size: 0 })!.draft.symbols[0].size).toBe(0.25)
    expect(editSymbol(d, 'sym_s', { color: '#aa0000' })!.draft.symbols[0].color).toBe('#aa0000')
    expect(editSymbol(d, 'sym_s', { kind: 'tree' })!.draft.symbols[0].kind).toBe('tree')
    expect(editSymbol(d, 'sym_s', { size: 2 })).toBeNull()
    expect(editSymbol(d, 'sym_s', { size: NaN })).toBeNull()
    expect(editSymbol(d, 'nope', { size: 3 })).toBeNull()
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
    expect(findItem(d, { kind: 'symbol', id: 'sym_s' })?.id).toBe('sym_s')
    expect(findItem(d, { kind: 'label', id: 'sym_s' })).toBeUndefined()
    expect(removeItem(d, { kind: 'symbol', id: 'sym_s' })!.draft.symbols).toEqual([])
    expect(removeItem(d, { kind: 'label', id: 'lbl_l' })!.draft.labels).toEqual([])
    expect(removeItem(d, { kind: 'label', id: 'nope' })).toBeNull()
  })

  it('moves an item, held to the map, and the move is one undo step', () => {
    const d = withItems()
    const moved = movedItem(movedItem(d, { kind: 'symbol', id: 'sym_s' }, 7.5, 2.5), { kind: 'symbol', id: 'sym_s' }, 99, 99)
    expect([moved.symbols[0].x, moved.symbols[0].y]).toEqual([20, 10])
    expect([d.symbols[0].x, d.symbols[0].y]).toEqual([5.5, 5.5])
    const h = new MapHistory()
    h.push(metaEdit(d, moved))
    const back = h.undo(moved)!
    expect([back.symbols[0].x, back.symbols[0].y]).toEqual([5.5, 5.5])
    expect(h.redo(back)!.symbols[0].x).toBe(20)
  })

  it('takes an item\'s undo with it, a removed layer\'s items included', () => {
    const d = withItems()
    const r = removeLayer(d, 'symbols')!
    expect(r.draft.symbols).toEqual([])
    expect(r.draft.labels).toHaveLength(1)
    const h = new MapHistory()
    h.push(r.edit)
    expect(h.undo(r.draft)!.symbols).toHaveLength(1)
  })
})

describe('picking an item with the pointer', () => {
  it('hits a symbol inside its square, with a little room, and nothing elsewhere', () => {
    const d = addSymbol(draft(), 'castle', 5.5, 5.5, 2, ids('s'))!.change.draft
    expect(hitItem(d, 5.5, 5.5)).toEqual({ kind: 'symbol', id: 'sym_s' })
    expect(hitItem(d, 6.4, 4.7)).toEqual({ kind: 'symbol', id: 'sym_s' })
    expect(hitItem(d, 6.7, 5.5)).toEqual({ kind: 'symbol', id: 'sym_s' }) // the slack
    expect(hitItem(d, 7.5, 5.5)).toBeNull()
  })

  it('gives a tiny symbol room to be hit', () => {
    const d = addSymbol(draft(), 'tree', 5.5, 5.5, 0.25, ids('s'))!.change.draft
    expect(hitItem(d, 5.9, 5.5)?.id).toBe('sym_s')
  })

  it('hits a label inside the box its text takes', () => {
    const d = addLabel(draft(), 'Port Veyra', 10, 5, 1, ids('l'))!.change.draft
    const { w } = labelExtent('Port Veyra', 1)
    expect(hitItem(d, 10 + w / 2 - 0.1, 5)).toEqual({ kind: 'label', id: 'lbl_l' })
    expect(hitItem(d, 10 + w / 2 + 1, 5)).toBeNull()
  })

  it('takes the later item of a layer, and the item on the higher layer', () => {
    let d = addSymbol(draft(), 'tree', 5.5, 5.5, 2, ids('a'))!.change.draft
    d = addSymbol(d, 'pine', 5.5, 5.5, 2, ids('b'))!.change.draft
    expect(hitItem(d, 5.5, 5.5)?.id).toBe('sym_b')
    d = addLabel(d, 'on top', 5.5, 5.5, 1, ids('l'))!.change.draft
    expect(hitItem(d, 5.5, 5.5)).toEqual({ kind: 'label', id: 'lbl_l' }) // the labels layer is above the symbols layer
  })

  it('cannot pick from a hidden or locked layer', () => {
    const d = addSymbol(draft(), 'tree', 5.5, 5.5, 2, ids('a'))!.change.draft
    expect(hitItem(toggleLayer(d, 'symbols', 'locked')!.draft, 5.5, 5.5)).toBeNull()
    expect(hitItem(toggleLayer(d, 'symbols', 'visible')!.draft, 5.5, 5.5)).toBeNull()
  })

  it('knows the bounds of what it draws', () => {
    const d = addSymbol(draft(), 'tree', 5, 5, 4, ids('a'))!.change.draft
    expect(itemBounds(d.symbols[0], 'symbol')).toEqual({ x0: 3, y0: 3, x1: 7, y1: 7 })
    const l = addLabel(draft(), 'Hi', 5, 5, 2, ids('l'))!.change.draft.labels[0]
    const b = itemBounds(l, 'label')
    expect([(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]).toEqual([5, 5])
  })
})

describe('the legend', () => {
  it('lists the terrains that are used and the kinds of symbol on the map, once each', () => {
    let d = addSymbol(draft(), 'castle', 2, 2, 2, ids('a'))!.change.draft
    d = addSymbol(d, 'castle', 4, 2, 2, ids('b'))!.change.draft
    d = addSymbol(d, 'tree', 6, 2, 2, ids('c'))!.change.draft
    d = addSymbol(d, 'mystery', 8, 2, 2, ids('d'))!.change.draft
    expect(legendEntries(d, [150, 0, 50])).toEqual([
      { type: 'terrain', name: 'Sea', color: '#3b6ea5' }, { type: 'terrain', name: 'Wood', color: '#4f8a4a' },
      { type: 'symbol', kind: 'castle', name: 'Castle' }, { type: 'symbol', kind: 'tree', name: 'Tree' }, { type: 'symbol', kind: 'mystery', name: 'Symbol' },
    ])
  })

  it('leaves out the symbols of a hidden layer', () => {
    const d = toggleLayer(addSymbol(draft(), 'castle', 2, 2, 2, ids('a'))!.change.draft, 'symbols', 'visible')!.draft
    expect(legendEntries(d, [200, 0, 0])).toEqual([{ type: 'terrain', name: 'Sea', color: '#3b6ea5' }])
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
