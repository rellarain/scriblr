import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MapDoc } from '../../../../api/types'
import { addLabel, addSymbol } from './mapItems'
import { drawMap, terrainPixels } from './mapRender'
import { draftOf, setOverlay, toggleLayer, type MapDraft } from './mapModel'

// A recording stand-in for a canvas context: every call is kept with its arguments, every property can be set, and text is 6 pixels a letter.
function recorder() {
  const calls: Array<[string, unknown[]]> = []
  const props: Record<string, unknown> = {}
  const ctx = new Proxy({}, {
    get(_t, name: string) {
      if (name === 'measureText') return (text: string) => ({ width: text.length * 6 })
      if (name in props) return props[name]
      return (...args: unknown[]) => { calls.push([name, args]) }
    },
    set(_t, name: string, value) { props[name] = value; return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls, texts: () => calls.filter(([n]) => n === 'fillText').map(([, a]) => String(a[0])), count: (n: string) => calls.filter(([c]) => c === n).length }
}

class FakePath { constructor(public d: string) {} }
afterEach(() => { vi.unstubAllGlobals() })

const doc = (): MapDoc => ({
  schemaVersion: 2, id: 'map_1', title: 'World', kind: 'world', parentId: null, order: 0, width: 20, height: 10, cellSize: 10, unit: 'miles',
  terrains: [{ id: 'sea', name: 'Sea', color: '#3b6ea5', builtIn: true }, { id: 'land', name: 'Land', color: '#a8c66c', builtIn: true }],
  layers: [
    { id: 'terrain', name: 'Terrain', kind: 'terrain', visible: true, locked: false },
    { id: 'symbols', name: 'Symbols', kind: 'symbols', visible: true, locked: false },
    { id: 'labels', name: 'Labels', kind: 'labels', visible: true, locked: false },
  ],
  cells: [0, 100, 1, 100], symbols: [], labels: [], theme: 'modern', scaleBar: false, compass: false, legend: false, updatedAt: 'x',
})
const base = (draft: MapDraft, over: Partial<Parameters<typeof drawMap>[1]> = {}): Parameters<typeof drawMap>[1] => ({
  width: 800, height: 520, dpr: 1, view: { zoom: 30, x: 40, y: 40 }, draft, bitmap: null, showGrid: false, ink: '#000', brush: [], selected: null, legend: null, ...over,
})
const withItems = (): MapDraft => {
  let d = draftOf(doc())
  d = addSymbol(d, 'castle', 5.5, 5.5, 2, () => 'a')!.change.draft
  d = addLabel(d, 'Port Veyra', 10, 3, 1, () => 'b')!.change.draft
  return d
}

describe('the pixels of the terrain', () => {
  it('are the palette colours in the look of the map', () => {
    const d = draftOf(doc())
    const modern = terrainPixels(d)
    expect(modern.length).toBe(200)
    expect(modern[0]).toBe(((255 << 24) | (165 << 16) | (110 << 8) | 59) >>> 0)
    expect(modern[199]).not.toBe(modern[0])
    const night = terrainPixels({ ...d, theme: 'night' })
    expect(night[0]).not.toBe(modern[0])
    expect(new Set(night).size).toBe(2)
  })

  it('use the first terrain for an index the palette does not have', () => {
    const d = draftOf(doc())
    d.cells[3] = 9
    expect(terrainPixels(d)[3]).toBe(terrainPixels(d)[0])
  })
})

describe('drawing a map', () => {
  it('draws the label text and a symbol for each item on a shown layer', () => {
    vi.stubGlobal('Path2D', FakePath)
    const r = recorder()
    drawMap(r.ctx, base(withItems()))
    expect(r.texts()).toContain('Port Veyra')
    expect(r.count('fill')).toBe(1) // the castle
    expect(r.count('strokeText')).toBe(1) // the label's halo
  })

  it('leaves out what is on a hidden layer', () => {
    vi.stubGlobal('Path2D', FakePath)
    const r = recorder()
    let d = toggleLayer(withItems(), 'labels', 'visible')!.draft
    d = toggleLayer(d, 'symbols', 'visible')!.draft
    drawMap(r.ctx, base(d))
    expect(r.texts()).not.toContain('Port Veyra')
    expect(r.count('fill')).toBe(0)
  })

  it('draws a very small symbol as a dot, and leaves out text too small to read', () => {
    vi.stubGlobal('Path2D', FakePath)
    const r = recorder()
    drawMap(r.ctx, base(withItems(), { view: { zoom: 1.5, x: 10, y: 10 } }))
    expect(r.count('fill')).toBe(0)
    expect(r.count('fillRect')).toBeGreaterThan(0)
    expect(r.texts()).not.toContain('Port Veyra')
  })

  it('draws a symbol as a dot when there is no path support', () => {
    const r = recorder()
    drawMap(r.ctx, base(withItems()))
    expect(r.count('fill')).toBe(0)
    expect(r.count('fillRect')).toBeGreaterThan(0)
  })

  it('draws the scale bar with a round length, the compass and the legend over the map when they are on', () => {
    vi.stubGlobal('Path2D', FakePath)
    const r = recorder()
    let d = withItems()
    for (const f of ['scaleBar', 'compass', 'legend'] as const) d = setOverlay(d, f, true)!.draft
    drawMap(r.ctx, base(d, { legend: [{ type: 'terrain', name: 'Sea', color: '#3b6ea5' }, { type: 'symbol', kind: 'castle', name: 'Castle' }] }))
    const texts = r.texts()
    expect(texts).toContain('N')
    expect(texts).toContain('Sea')
    expect(texts).toContain('Castle')
    // 10 miles a cell at 30 px: 110 px is 36 miles, so 20.
    expect(texts).toContain('20 miles')
  })

  it('leaves the overlays out when they are off, or when the map is too small on the canvas to hold them', () => {
    const off = recorder()
    drawMap(off.ctx, base(draftOf(doc())))
    expect(off.texts()).toEqual([])
    const small = recorder()
    let d = draftOf(doc())
    for (const f of ['scaleBar', 'compass', 'legend'] as const) d = setOverlay(d, f, true)!.draft
    drawMap(small.ctx, base(d, { view: { zoom: 2, x: 10, y: 10 }, legend: [{ type: 'terrain', name: 'Sea', color: '#3b6ea5' }] }))
    expect(small.texts()).toEqual([])
  })

  it('outlines the chosen item and the brush', () => {
    vi.stubGlobal('Path2D', FakePath)
    const r = recorder()
    const d = withItems()
    drawMap(r.ctx, base(d, { selected: { kind: 'symbol', id: 'sym_a' }, brush: [[1, 1], [2, 1]] }))
    // the frame, the selection twice (halo and ink) and a box per brush cell
    expect(r.count('strokeRect')).toBe(1 + 2 + 2)
  })

  it('draws the grid only when a cell is big enough', () => {
    const big = recorder(), tiny = recorder()
    drawMap(big.ctx, base(draftOf(doc()), { showGrid: true }))
    drawMap(tiny.ctx, base(draftOf(doc()), { showGrid: true, view: { zoom: 3, x: 10, y: 10 } }))
    expect(big.count('lineTo')).toBeGreaterThan(20)
    expect(tiny.count('lineTo')).toBe(0)
  })

  it('draws the layers in their order: a symbol on a layer below the labels comes first', () => {
    vi.stubGlobal('Path2D', FakePath)
    const r = recorder()
    drawMap(r.ctx, base(withItems()))
    const names = r.calls.map(([n]) => n)
    expect(names.indexOf('fill')).toBeLessThan(names.indexOf('strokeText'))
  })
})
