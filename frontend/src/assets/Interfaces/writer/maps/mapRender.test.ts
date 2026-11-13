import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MapDoc, MapShape } from '../../../../api/types'
import { addLabel, addLibraryShape } from './mapItems'
import { starterShapes } from './mapShapeSeed'
import { MAX_TINT, NATIONS_LAND, NATIONS_WATER, drawMap, heightTint, starfieldOf, type MakeCanvas } from './mapRender'
import { makeOrbit } from './mapOrbits'
import { LINE_PRESETS, makeBiomeShape } from './mapShapes'
import { STARTER_BIOMES, biomeIndex } from './mapBiomes'
import { draftOf, setOverlay, toggleLayer, type MapDraft } from './mapModel'

// A recording stand-in for a canvas context: every call is kept with its arguments, every property can be set, and text is 6 pixels a letter. Each fill
// keeps the fill colour it was made with (`fills`).
function recorder() {
  const calls: Array<[string, unknown[]]> = []
  const fills: string[] = []
  const props: Record<string, unknown> = {}
  // Every property set, in order (a shadow's colour and blur, say).
  const sets: Array<[string, unknown]> = []
  const ctx = new Proxy({}, {
    get(_t, name: string) {
      if (name === 'measureText') return (text: string) => ({ width: text.length * 6 })
      if (name in props) return props[name]
      return (...args: unknown[]) => {
        calls.push([name, args])
        if (name === 'fill' || name === 'fillRect') fills.push(String(props.fillStyle))
      }
    },
    set(_t, name: string, value) { props[name] = value; sets.push([name, value]); return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls, fills, sets, texts: () => calls.filter(([n]) => n === 'fillText').map(([, a]) => String(a[0])), count: (n: string) => calls.filter(([c]) => c === n).length }
}

class FakePath { constructor(public d: string) {} }

// A stand-in for the offscreen canvas the shading is drawn into: keeps the pixels put into it and the samples a cell.
function shadeCanvas() {
  const images: Array<{ w: number; h: number; data: Uint8ClampedArray }> = []
  const make: MakeCanvas = (w, h) => ({
    width: w, height: h,
    getContext: () => ({
      createImageData: (iw: number, ih: number) => ({ width: iw, height: ih, data: new Uint8ClampedArray(iw * ih * 4) }),
      putImageData: (img: { data: Uint8ClampedArray }) => { images.push({ w, h, data: img.data }) },
    }),
  }) as unknown as HTMLCanvasElement
  // The pixel at a point of the map (in cells) of the last image: [red, alpha].
  const at = (x: number, y: number, cellsAcross = 20) => {
    const img = images[images.length - 1]
    const s = img.w / cellsAcross
    const k = (Math.floor(y * s) * img.w + Math.floor(x * s)) * 4
    return [img.data[k], img.data[k + 3]]
  }
  return { make, images, at }
}
afterEach(() => { vi.unstubAllGlobals() })

const doc = (): MapDoc => ({
  schemaVersion: 2, id: 'map_1', title: 'World', level: 'national', mapFormat: 2, base: { biome: 'plain', height: 0 }, units: 'metric',
  parentId: null, order: 0, width: 20, height: 10, cellSize: 10, unit: 'miles', pace: null,
  layers: [
    { id: 'terrain', name: 'Biomes', kind: 'terrain', visible: true, locked: false },
    { id: 'symbols', name: 'Markers', kind: 'symbols', visible: true, locked: false },
    { id: 'labels', name: 'Labels', kind: 'labels', visible: true, locked: false },
  ],
  labels: [], shapes: [], scaleBar: false, compass: false, legend: false, updatedAt: 'x',
})
const base = (draft: MapDraft, over: Partial<Parameters<typeof drawMap>[1]> = {}): Parameters<typeof drawMap>[1] => ({
  width: 800, height: 520, dpr: 1, view: { zoom: 30, x: 40, y: 40 }, draft, biomes: INDEX, showGrid: false, ink: '#000', selected: null, selectedNode: null, pending: null, measure: null, legend: null, ...over,
})
const INDEX = biomeIndex(STARTER_BIOMES)
const withItems = (): MapDraft => {
  let d = draftOf(doc())
  const castle = starterShapes().find(s => s.id === 'marker:castle')!
  d = addLibraryShape(d, castle, { x0: 4.5, y0: 4.5, x1: 6.5, y1: 6.5 }, 'metric', () => 'a')!.change.draft
  d = addLabel(d, 'Port Veyra', 10, 3, 1, () => 'b')!.change.draft
  return d
}

describe('the land', () => {
  const tri = (id: string, biome: string | null, over: Partial<MapShape> = {}): MapShape => ({ ...makeBiomeShape(id, 'terrain', [[2, 2], [9, 2], [6, 8]], biome, false), ...over })

  it('a height is a lighter or darker tint, at most MAX_TINT, and none without a range', () => {
    expect(heightTint(0, 4000)).toBe(0)
    expect(heightTint(2000, 4000)).toBeCloseTo(MAX_TINT / 2)
    expect(heightTint(-9000, 4000)).toBeCloseTo(-MAX_TINT)
    expect(heightTint(500, 0)).toBe(0)
    expect(heightTint(Number.NaN, 4000)).toBe(0)
  })

  it('fills the map with the base biome, and shades it darker when the base is under sea level', () => {
    const flat = recorder(), fc = shadeCanvas()
    drawMap(flat.ctx, base(draftOf(doc()), { makeCanvas: fc.make }))
    expect(flat.fills[0]).toBe('#a4c34a')
    expect(fc.at(5, 5)[1]).toBe(0)
    const deep = recorder(), dc = shadeCanvas()
    drawMap(deep.ctx, base({ ...draftOf(doc()), base: { biome: 'saltwater', height: -2000 } }, { makeCanvas: dc.make }))
    expect(deep.fills[0]).toBe('#2f62b0')
    expect(deep.count('drawImage')).toBe(1)
    const [red, alpha] = dc.at(5, 5)
    expect(red).toBe(0)
    expect(alpha).toBe(Math.round(0.5 * MAX_TINT * 255))
  })

  it('draws the biome shapes in their order, each in its colour, later over earlier', () => {
    const r = recorder()
    drawMap(r.ctx, base({ ...draftOf(doc()), shapes: [tri('a', 'forest'), tri('b', 'freshwater')] }))
    const forest = r.fills.indexOf('#3f8f3a'), lake = r.fills.indexOf('#6fb8e8')
    expect(forest).toBeGreaterThan(0)
    expect(lake).toBeGreaterThan(forest)
  })

  it('shades raised land lighter in its own colour, and a shape with no biome only changes the shading', () => {
    const r = recorder(), rc = shadeCanvas()
    drawMap(r.ctx, base({ ...draftOf(doc()), shapes: [tri('a', 'rocky', { heightMode: 'raise', height: 3000 })] }, { makeCanvas: rc.make }))
    expect(r.fills).toEqual(['#a4c34a', '#8e8e8e'])
    expect(rc.at(6, 4)).toEqual([255, Math.round(0.75 * MAX_TINT * 255)])
    expect(rc.at(15, 8)[1]).toBe(0)
    const hills = recorder(), hc = shadeCanvas()
    drawMap(hills.ctx, base({ ...draftOf(doc()), shapes: [tri('a', null, { heightMode: 'raise', height: 800 })] }, { makeCanvas: hc.make }))
    expect(hills.fills).toEqual(['#a4c34a'])
    expect(hc.at(6, 4)[0]).toBe(255)
    expect(hc.at(6, 4)[1]).toBeGreaterThan(0)
    const flat = recorder(), lc = shadeCanvas()
    drawMap(flat.ctx, base({ ...draftOf(doc()), shapes: [tri('a', null)] }, { makeCanvas: lc.make }))
    expect(flat.fills).toEqual(['#a4c34a'])
    expect(lc.at(6, 4)[1]).toBe(0)
  })

  it('draws contour lines when they are on, and relief changes the shading of a slope', () => {
    const peak = (over: Partial<MapDraft> = {}) => ({ ...draftOf(doc()), shapes: [tri('a', 'rocky', { heightMode: 'raise', height: 3000, profile: 'peak' })], ...over })
    const off = recorder()
    drawMap(off.ctx, base(peak(), { makeCanvas: shadeCanvas().make }))
    const on = recorder()
    drawMap(on.ctx, base(setOverlay(peak(), 'contours', true)!.draft, { makeCanvas: shadeCanvas().make }))
    expect(on.count('lineTo')).toBeGreaterThan(off.count('lineTo') + 10)
    const plain = shadeCanvas(), lit = shadeCanvas()
    drawMap(recorder().ctx, base(peak(), { makeCanvas: plain.make }))
    drawMap(recorder().ctx, base(setOverlay(peak(), 'relief', true)!.draft, { makeCanvas: lit.make }))
    const a = plain.images[0].data, b = lit.images[0].data
    let differ = 0
    for (let k = 3; k < a.length; k += 4) if (a[k] !== b[k] || a[k - 3] !== b[k - 3]) differ += 1
    expect(differ).toBeGreaterThan(20)
  })

  it('in the Nations view draws the land and the water plain, unshaded, and fills the political areas', () => {
    const nation: MapShape = { id: 'n', layerId: 'shapes', type: 'region', style: 'solid', color: null, width: 0.2, fill: '#d98c6a', opacity: 0.6, pattern: 'solid', political: 'nation', points: [{ x: 1, y: 1, smooth: false, hx: null, hy: null }, { x: 9, y: 1, smooth: false, hx: null, hy: null }, { x: 9, y: 9, smooth: false, hx: null, hy: null }] }
    const d: MapDraft = { ...draftOf(doc()), layers: [...draftOf(doc()).layers, { id: 'shapes', name: 'Shapes', kind: 'shapes', visible: true, locked: false }], shapes: [tri('a', 'freshwater', { heightMode: 'raise', height: 900 }), nation] }
    const biomesView = recorder(), bc = shadeCanvas()
    drawMap(biomesView.ctx, base(d, { makeCanvas: bc.make }))
    expect(biomesView.fills).not.toContain('#d98c6a')
    expect(biomesView.count('drawImage')).toBe(1)
    const nationsView = recorder()
    drawMap(nationsView.ctx, base(d, { nations: true, makeCanvas: shadeCanvas().make }))
    expect(nationsView.fills.slice(0, 2)).toEqual([NATIONS_LAND, NATIONS_WATER])
    expect(nationsView.fills).toContain('#d98c6a')
    expect(nationsView.count('drawImage')).toBe(0)
  })

  it('draws a biome it cannot find in gray, and nothing of a hidden biomes layer but a faint wash', () => {
    const r = recorder()
    drawMap(r.ctx, base({ ...draftOf(doc()), shapes: [tri('a', 'gone')] }))
    expect(r.fills).toContain('#9a9a9a')
    const hidden = recorder()
    const d = toggleLayer({ ...draftOf(doc()), shapes: [tri('a', 'forest')] }, 'terrain', 'visible')!.draft
    drawMap(hidden.ctx, base(d))
    expect(hidden.fills).toEqual(['#000'])
  })

  it('writes the name of a named area inside it when the area is big enough', () => {
    const r = recorder()
    drawMap(r.ctx, base({ ...draftOf(doc()), shapes: [tri('a', 'forest', { name: 'Greenwood' })] }))
    expect(r.texts()).toContain('Greenwood')
    const small = recorder()
    drawMap(small.ctx, base({ ...draftOf(doc()), shapes: [tri('a', 'forest', { name: 'Greenwood' })] }, { view: { zoom: 4, x: 10, y: 10 } }))
    expect(small.texts()).not.toContain('Greenwood')
  })
})

describe('drawing a map', () => {
  it('draws the label text and a marker for each item on a shown layer', () => {
    const r = recorder()
    drawMap(r.ctx, base(withItems()))
    expect(r.texts()).toContain('Port Veyra')
    expect(r.count('fill')).toBe(1) // the castle
    expect(r.count('stroke')).toBe(1) // its halo
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

  it('draws a very small marker as a dot, and leaves out text too small to read', () => {
    vi.stubGlobal('Path2D', FakePath)
    const r = recorder()
    drawMap(r.ctx, base(withItems(), { view: { zoom: 1.5, x: 10, y: 10 } }))
    expect(r.count('fill')).toBe(0)
    expect(r.count('fillRect')).toBeGreaterThan(0)
    expect(r.texts()).not.toContain('Port Veyra')
  })

  it('draws a marker with its holes cut out (even-odd), traced point by point, with no path support needed', () => {
    const r = recorder()
    const town = starterShapes().find(s => s.id === 'marker:town')!
    drawMap(r.ctx, base(addLibraryShape(draftOf(doc()), town, { x0: 2, y0: 2, x1: 4, y1: 4 }, 'metric', () => 't')!.change.draft))
    const fill = r.calls.find(([n]) => n === 'fill')!
    expect(fill[1]).toEqual(['evenodd'])
    const castle = recorder()
    drawMap(castle.ctx, base(withItems()))
    expect(castle.calls.find(([n]) => n === 'fill')![1]).toEqual(['nonzero'])
    expect(r.count('moveTo')).toBe(2) // the outline and its hole
    expect(r.count('lineTo') + r.count('bezierCurveTo')).toBeGreaterThan(4)
  })

  it('draws the scale bar with a round length, the compass and the legend over the map when they are on', () => {
    vi.stubGlobal('Path2D', FakePath)
    const r = recorder()
    let d = withItems()
    for (const f of ['scaleBar', 'compass', 'legend'] as const) d = setOverlay(d, f, true)!.draft
    drawMap(r.ctx, base(d, { legend: [{ type: 'terrain', name: 'Sea', color: '#3b6ea5' }, { type: 'marker', kind: 'marker:castle', name: 'Castle', shape: d.shapes[0] }] }))
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

  it('outlines the chosen item, and shows the points of a chosen marker', () => {
    const r = recorder()
    const d = withItems()
    drawMap(r.ctx, base(d, { selected: { kind: 'label', id: 'lbl_b' } }))
    // the frame, and the selection twice (halo and ink)
    expect(r.count('strokeRect')).toBe(1 + 2)
    // A marker's points show only once it is big enough on screen: 2 cells at 30 px is too small, at 200 px it is not.
    const small = recorder()
    drawMap(small.ctx, base(d, { selected: { kind: 'shape', id: 'mrk_a' } }))
    expect(small.count('strokeRect')).toBe(1 + 2)
    const m = recorder()
    drawMap(m.ctx, base(d, { selected: { kind: 'shape', id: 'mrk_a' }, view: { zoom: 200, x: 0, y: 0 } }))
    expect(m.count('strokeRect')).toBe(1 + 2 + d.shapes[0].points.length)
  })

  it('draws the grid only when a cell is big enough', () => {
    const big = recorder(), tiny = recorder()
    drawMap(big.ctx, base(draftOf(doc()), { showGrid: true }))
    drawMap(tiny.ctx, base(draftOf(doc()), { showGrid: true, view: { zoom: 3, x: 10, y: 10 } }))
    expect(big.count('lineTo')).toBeGreaterThan(20)
    expect(tiny.count('lineTo')).toBe(0)
  })

  it('draws the layers in their order: a marker on a layer below the labels comes first', () => {
    const r = recorder()
    drawMap(r.ctx, base(withItems()))
    const names = r.calls.map(([n]) => n)
    expect(names.indexOf('fill')).toBeLessThan(names.indexOf('strokeText'))
  })
})

describe('drawing lines and regions', () => {
  const pt = (x: number, y: number, smooth = false) => ({ x, y, smooth, hx: null, hy: null })
  const shape = (over: Partial<MapShape>): MapShape => ({ id: 's1', layerId: 'shapes', type: 'line', points: [pt(2, 2), pt(8, 2), pt(8, 6)], style: 'solid', color: null, width: 0.25, fill: null, opacity: 0.35, pattern: 'solid', ...over })
  const mapWith = (...shapes: MapShape[]): MapDraft => {
    const d = draftOf(doc())
    d.layers = [d.layers[0], { id: 'shapes', name: 'Shapes', kind: 'shapes', visible: true, locked: false }, ...d.layers.slice(1)]
    d.shapes = shapes
    return d
  }
  const strokes = (r: ReturnType<typeof recorder>) => r.count('stroke')

  it('traces straight pieces with lineTo and curves with bezierCurveTo', () => {
    const straight = recorder()
    drawMap(straight.ctx, base(mapWith(shape({}))))
    expect(straight.count('lineTo')).toBe(2)
    expect(straight.count('bezierCurveTo')).toBe(0)
    const curved = recorder()
    drawMap(curved.ctx, base(mapWith(shape({ points: [pt(2, 2, true), pt(8, 2, true), pt(8, 6, true)] }))))
    expect(curved.count('bezierCurveTo')).toBe(2)
  })

  it('closes a region and fills it, then outlines it', () => {
    const r = recorder()
    drawMap(r.ctx, base(mapWith(shape({ type: 'region', fill: '#88aa44' }))))
    expect(r.count('closePath')).toBeGreaterThanOrEqual(2)
    expect(r.count('fill')).toBe(1)
    expect(strokes(r)).toBe(1)
  })

  it('draws a pattern over a region inside its outline, with lines for hatching and dots for dots', () => {
    const hatch = recorder()
    drawMap(hatch.ctx, base(mapWith(shape({ type: 'region', pattern: 'hatch' }))))
    expect(hatch.count('clip')).toBe(2) // the map's, and the region's
    expect(hatch.count('arc')).toBe(0)
    const cross = recorder(), plain = recorder()
    drawMap(cross.ctx, base(mapWith(shape({ type: 'region', pattern: 'cross' }))))
    drawMap(plain.ctx, base(mapWith(shape({ type: 'region', pattern: 'hatch' }))))
    expect(cross.count('moveTo')).toBeGreaterThan(plain.count('moveTo'))
    const dots = recorder()
    drawMap(dots.ctx, base(mapWith(shape({ type: 'region', pattern: 'dots' }))))
    expect(dots.count('arc')).toBeGreaterThan(5)
    const solid = recorder()
    drawMap(solid.ctx, base(mapWith(shape({ type: 'region', pattern: 'solid' }))))
    expect(solid.count('clip')).toBe(1) // only the clip of the map itself
  })

  it('strokes each style of line its own way', () => {
    const count = (style: MapShape['style']) => { const r = recorder(); drawMap(r.ctx, base(mapWith(shape({ style })))); return strokes(r) }
    expect(count('solid')).toBe(1)
    expect(count('dashed')).toBe(1)
    expect(count('dotted')).toBe(1)
    expect(count('road')).toBe(2) // two edges, and the road between them
    expect(count('wall')).toBe(2) // the wall, and its crenels
    expect(count('fence')).toBe(2) // the rail, and the posts
    const dashes = recorder()
    drawMap(dashes.ctx, base(mapWith(shape({ style: 'dashed' }))))
    expect(dashes.calls.some(([n, a]) => n === 'setLineDash' && (a[0] as number[]).length === 2)).toBe(true)
  })

  it('draws what is on a hidden shapes layer not at all, and the shapes in the order of the layers', () => {
    const r = recorder()
    const d = mapWith(shape({}))
    d.layers = d.layers.map(l => (l.id === 'shapes' ? { ...l, visible: false } : l))
    drawMap(r.ctx, base(d))
    expect(r.count('lineTo')).toBe(0)
  })

  it('draws the points and handles of the chosen shape, and the line that is being drawn', () => {
    const r = recorder()
    const d = mapWith(shape({ points: [pt(2, 2, true), pt(8, 2), pt(8, 6)] }))
    drawMap(r.ctx, base(d, { selected: { kind: 'shape', id: 's1' }, selectedNode: 1 }))
    // a square for each of the three points (fill and stroke), and the smooth one's two handle dots
    expect(r.count('fillRect')).toBe(1 + 3) // the base, then the points
    expect(r.count('arc')).toBe(2)
    const pend = recorder()
    drawMap(pend.ctx, base(mapWith(), { pending: { type: 'line', points: [[2, 2], [4, 3]], cursor: [6, 3], pen: LINE_PRESETS[0].pen } }))
    expect(pend.count('arc')).toBe(2) // a dot for each clicked point
    expect(pend.count('lineTo') + pend.count('bezierCurveTo')).toBeGreaterThan(0)
  })

  it('does not draw a shape with too few points', () => {
    const r = recorder()
    drawMap(r.ctx, base(mapWith(shape({ points: [pt(2, 2)] }))))
    expect(r.count('lineTo')).toBe(0)
  })
})

describe('drawing space', () => {
  const pt = (x: number, y: number) => ({ x, y, smooth: true, hx: null, hy: null })
  const round = (cx: number, cy: number, r: number) => [0, 1, 2, 3, 4, 5].map(k => pt(cx + r * Math.cos((k / 6) * Math.PI * 2), cy + r * Math.sin((k / 6) * Math.PI * 2)))
  const body = (id: string, biome: string, cx: number, cy: number, r = 1): MapShape => ({
    id, layerId: 'terrain', type: 'biome', points: round(cx, cy, r), style: 'solid', color: null, width: 0.05, fill: null, opacity: 1, pattern: 'solid', biome, name: '', mapIds: [],
  })
  const space = (...shapes: MapShape[]): MapDraft => {
    const d = draftOf({ ...doc(), level: 'galactic', base: { biome: 'space', height: 0 } })
    d.layers = [d.layers[0], { id: 'shapes', name: 'Regions and lines', kind: 'shapes', visible: true, locked: false }, ...d.layers.slice(1)]
    d.shapes = shapes
    return d
  }

  it('draws a backdrop of faint stars on a map of space, the same for a map each time, and none on land', () => {
    const r = recorder()
    drawMap(r.ctx, base(space()))
    expect(r.count('fillRect')).toBeGreaterThan(50)
    expect(starfieldOf('map_1', 20, 10)).toBe(starfieldOf('map_1', 20, 10))
    expect(Array.from(starfieldOf('map_1', 20, 10))).not.toEqual(Array.from(starfieldOf('map_2', 20, 10)))
    const land = recorder()
    drawMap(land.ctx, base(draftOf(doc())))
    expect(land.count('fillRect')).toBeLessThan(5)
  })

  it('draws a star with a glow in its own colour, a black hole with a warm one, and a planet in the colour of its kind without one', () => {
    const r = recorder()
    drawMap(r.ctx, base(space(body('bio_sun', 'star_yellow', 10, 5, 1.5), body('bio_hole', 'star_black_hole', 4, 4), body('bio_giant', 'planet_gas_giant', 15, 5))))
    expect(r.fills).toEqual(expect.arrayContaining(['#ffd54a', '#0b0b10', '#d9a066']))
    const glows = r.sets.filter(([n]) => n === 'shadowColor').map(([, v]) => v)
    expect(glows).toEqual(['#ffd54a', '#ffb15c'])
    expect(r.sets.some(([n, v]) => n === 'shadowBlur' && Number(v) > 0)).toBe(true)
  })

  it('draws an orbit as a dashed path round its centre, never filled', () => {
    const r = recorder()
    drawMap(r.ctx, base(space(makeOrbit('orb_a', 'shapes', 10, 5, 3))))
    expect(r.count('fill')).toBe(0)
    expect(r.count('stroke')).toBeGreaterThanOrEqual(1)
    expect(r.count('lineTo')).toBeGreaterThanOrEqual(96)
    expect(r.calls.some(([n, a]) => n === 'setLineDash' && (a[0] as number[]).length > 0)).toBe(true)
  })

  it('draws a glowing region with its edge blurred inside its outline', () => {
    const r = recorder()
    const nebula: MapShape = { id: 'shp_n', layerId: 'shapes', type: 'region', points: round(6, 5, 3), style: 'dotted', color: '#b48ce0', width: 0.06, fill: '#9a5fd0', opacity: 0.4, pattern: 'glow' }
    drawMap(r.ctx, base(space(nebula)))
    expect(r.count('clip')).toBeGreaterThanOrEqual(1)
    expect(r.sets).toEqual(expect.arrayContaining([['shadowColor', '#9a5fd0']]))
  })
})

describe('drawing a building', () => {
  const corner = (x: number, y: number) => ({ x, y, smooth: false, hx: null, hy: null })
  const wall = (openings: MapShape['openings'] = []): MapShape => ({
    id: 'shp_w', layerId: 'shapes', type: 'line', points: [corner(2, 2), corner(14, 2)], style: 'wall', color: null, width: 0.22, fill: null, opacity: 0.35, pattern: 'solid', openings,
  })
  const building = (...shapes: MapShape[]): MapDraft => {
    const d = draftOf({ ...doc(), level: 'architectural', base: { biome: 'outside', height: 0 } })
    d.layers = [d.layers[0], { id: 'shapes', name: 'Regions and lines', kind: 'shapes', visible: true, locked: false }, ...d.layers.slice(1)]
    d.shapes = shapes
    return d
  }

  it('draws a wall in one run, and with a gap for each opening', () => {
    const plain = recorder()
    drawMap(plain.ctx, base(building(wall())))
    const gapped = recorder()
    drawMap(gapped.ctx, base(building(wall([{ id: 'o1', seg: 0, t: 0.25, width: 1, kind: 'window', flip: false }, { id: 'o2', seg: 0, t: 0.75, width: 1, kind: 'arch', flip: false }]))))
    // Three runs of wall between and round the two gaps (the wall style traces its path more than once).
    expect(gapped.count('moveTo')).toBeGreaterThan(plain.count('moveTo'))
    expect(plain.count('arc')).toBe(0)
  })

  it('draws a wall of a building as one plain bar with square corners, without the crenels of a town wall', () => {
    const inside = recorder()
    drawMap(inside.ctx, base(building(wall())))
    const town = recorder()
    drawMap(town.ctx, base({ ...building(wall()), level: 'local' }))
    expect(inside.count('stroke')).toBe(town.count('stroke') - 1)
    expect(inside.sets).toEqual(expect.arrayContaining([['lineJoin', 'miter']]))
    expect(inside.calls.some(([n, a]) => n === 'setLineDash' && (a[0] as number[]).length === 2)).toBe(false)
  })

  it('draws a door as its leaf and the arc it swings through, on the side it opens to', () => {
    const r = recorder()
    drawMap(r.ctx, base(building(wall([{ id: 'o1', seg: 0, t: 0.5, width: 1.2, kind: 'door', flip: false }]))))
    const arcs = r.calls.filter(([n]) => n === 'arc')
    expect(arcs).toHaveLength(1)
    const flipped = recorder()
    drawMap(flipped.ctx, base(building(wall([{ id: 'o1', seg: 0, t: 0.5, width: 1.2, kind: 'door', flip: true }]))))
    const other = flipped.calls.filter(([n]) => n === 'arc')
    expect(other[0][1][5]).not.toBe(arcs[0][1][5]) // swings the other way
  })
})
