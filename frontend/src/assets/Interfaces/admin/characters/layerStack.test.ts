import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYERS, LAYER_IDS, drawOrder, isShown, moveLayer, normalizeLayers, nudgeLayer, toggleLayer } from './layerStack'

describe('the canvas layers', () => {
  it('start with every layer once, all shown, and the figure among them', () => {
    expect(DEFAULT_LAYERS.order).toHaveLength(LAYER_IDS.length)
    expect(new Set(DEFAULT_LAYERS.order).size).toBe(LAYER_IDS.length)
    expect(DEFAULT_LAYERS.order).toContain('figure')
    expect(isShown(DEFAULT_LAYERS, 'ghost')).toBe(true)
    expect(isShown(DEFAULT_LAYERS, 'points')).toBe(true)
    // the head units are there, hidden until asked for
    expect(DEFAULT_LAYERS.order).toContain('heads')
    expect(isShown(DEFAULT_LAYERS, 'heads')).toBe(false)
  })
  it('draw the leftmost on top: the shown layers, bottom first', () => {
    const order = drawOrder({ order: [...LAYER_IDS], hidden: [] })
    expect(order[order.length - 1]).toBe(LAYER_IDS[0])
    expect(order[0]).toBe(LAYER_IDS[LAYER_IDS.length - 1])
    // the gridlines are under the figure by default, and the points over it
    const drawn = drawOrder(DEFAULT_LAYERS)
    expect(drawn.indexOf('gridlines')).toBeLessThan(drawn.indexOf('figure'))
    expect(drawn.indexOf('points')).toBeGreaterThan(drawn.indexOf('figure'))
  })
  it('leave out the hidden ones', () => {
    expect(drawOrder({ order: [...LAYER_IDS], hidden: ['ghost'] })).not.toContain('ghost')
    expect(drawOrder({ order: [...LAYER_IDS], hidden: ['points', 'mirror'] })).not.toContain('points')
  })
  it('toggle a layer, but never hide the figure', () => {
    const hidden = toggleLayer(DEFAULT_LAYERS, 'points')
    expect(isShown(hidden, 'points')).toBe(false)
    expect(isShown(toggleLayer(hidden, 'points'), 'points')).toBe(true)
    expect(toggleLayer(DEFAULT_LAYERS, 'figure')).toBe(DEFAULT_LAYERS)
  })
  it('move a layer before another, to the end, or one place at a time', () => {
    const s = { order: [...LAYER_IDS], hidden: [] }
    const moved = moveLayer(s, 'gridlines', 'weights')
    expect(moved.order[0]).toBe('gridlines')
    expect(moved.order).toHaveLength(LAYER_IDS.length)
    expect(moveLayer(s, 'weights', null).order[LAYER_IDS.length - 1]).toBe('weights')
    expect(moveLayer(s, 'weights', 'weights')).toBe(s)
    expect(nudgeLayer(s, 'points', -1).order[0]).toBe('points')
    expect(nudgeLayer(s, 'weights', -1)).toBe(s)
    expect(nudgeLayer(s, 'gridlines', 1)).toBe(s)
  })
  it('repair what was stored: unknown layers dropped, missing ones added, the figure never hidden', () => {
    const fixed = normalizeLayers({ order: ['points', 'nonsense', 'points', 'figure'], hidden: ['figure', 'mirror', 'nonsense'] })
    expect(fixed.order.slice(0, 2)).toEqual(['points', 'figure'])
    expect(new Set(fixed.order).size).toBe(LAYER_IDS.length)
    // a layer added since (the head units) is hidden as it is by default; one that was stored keeps what was stored
    expect(fixed.hidden).toEqual(['mirror', 'heads'])
    expect(normalizeLayers({ order: [...LAYER_IDS], hidden: [] }).hidden).toEqual([])
    expect(normalizeLayers(null)).toEqual({ order: DEFAULT_LAYERS.order, hidden: DEFAULT_LAYERS.hidden })
    expect(normalizeLayers('x').order).toHaveLength(LAYER_IDS.length)
  })
})
