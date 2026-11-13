import { describe, expect, it } from 'vitest'
import type { MapDoc, MapShape } from '../../../../api/types'
import { STARTER_BIOMES, biomeIndex } from './mapBiomes'
import {
  MAX_TINT, buildHeights, contourLines, contourStep, contoursOf, heightAt, heightsOf, keptWithHeights, landHeight, mapHeightRange, profileWeight,
  samplesPerCell, shadePixels, type HeightGrid,
} from './mapHeights'
import { makeBiomeShape } from './mapShapes'

const INDEX = biomeIndex(STARTER_BIOMES)

type Land = Pick<MapDoc, 'width' | 'height' | 'base' | 'shapes' | 'layers' | 'level' | 'units' | 'heightRange'>
const land = (over: Partial<Land> = {}): Land => ({
  width: 20, height: 20, base: { biome: 'plain', height: 0 }, level: 'regional', units: 'metric', heightRange: null,
  layers: [{ id: 'terrain', name: 'Biomes', kind: 'terrain', visible: true, locked: false }], shapes: [], ...over,
})
// A square area from (x0, y0) to (x1, y1), in cells.
const square = (id: string, x0: number, y0: number, x1: number, y1: number, biome: string | null, over: Partial<MapShape> = {}): MapShape =>
  ({ ...makeBiomeShape(id, 'terrain', [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], biome, false), ...over })

describe('the height of land under an area', () => {
  it('sets, raises, lowers or keeps the height, by its weight', () => {
    expect(landHeight(100, { heightMode: 'set', height: 500, biome: null }, null)).toBe(500)
    expect(landHeight(100, { heightMode: 'set', height: 500, biome: null }, null, 0.5)).toBe(300)
    expect(landHeight(100, { heightMode: 'raise', height: 500, biome: null }, null)).toBe(600)
    expect(landHeight(100, { heightMode: 'lower', height: 500, biome: null }, null, 0.2)).toBe(0)
    expect(landHeight(100, { heightMode: 'none', height: 500, biome: null }, null)).toBe(100)
  })

  it('lifts land drawn over the sea to sea level first, but not water, nor an area with no biome', () => {
    expect(landHeight(-3000, { heightMode: 'none', biome: 'forest' }, 'land')).toBe(0)
    expect(landHeight(-3000, { heightMode: 'raise', height: 200, biome: 'forest' }, 'land')).toBe(200)
    expect(landHeight(-3000, { heightMode: 'none', biome: 'freshwater' }, 'water')).toBe(-3000)
    expect(landHeight(-3000, { heightMode: 'raise', height: 200, biome: null }, null)).toBe(-2800)
    expect(landHeight(-50, { heightMode: 'lower', height: 100, biome: 'swamp' }, 'land')).toBe(-100)
  })
})

describe('profiles', () => {
  it('a plateau is flat, with a ramp as wide as its slope', () => {
    expect(profileWeight('plateau', 0.1, 5)).toBe(1)
    expect(profileWeight('plateau', 1, 5, 2)).toBe(0.5)
    expect(profileWeight('plateau', 3, 5, 2)).toBe(1)
    expect(profileWeight('plateau', 0, 5)).toBe(0)
  })

  it('a hill rises smoothly, a peak straight to the middle, a basin steep at the edge', () => {
    expect(profileWeight('hill', 2.5, 5)).toBeCloseTo(0.5)
    expect(profileWeight('hill', 1, 5)).toBeLessThan(0.2)
    expect(profileWeight('hill', 5, 5)).toBe(1)
    expect(profileWeight('hill', 1, 5, 2)).toBeCloseTo(0.5)
    expect(profileWeight('peak', 1, 4)).toBe(0.25)
    expect(profileWeight('peak', 4, 4)).toBe(1)
    expect(profileWeight('basin', 1, 5)).toBeCloseTo(0.36)
    expect(profileWeight('basin', 1, 5)).toBeGreaterThan(profileWeight('peak', 1, 5))
  })

  it('never gives a weight outside 0 to 1, whatever it is given', () => {
    for (const p of ['plateau', 'hill', 'peak', 'basin', undefined] as const) {
      for (const d of [-1, 0, 0.01, 1, 3, 100, Number.NaN]) {
        for (const dmax of [0, 0.5, 3]) {
          const w = profileWeight(p, d, dmax, 1)
          expect(w >= 0 && w <= 1, `${p} ${d} ${dmax}`).toBe(true)
        }
      }
    }
  })
})

describe('the height grid', () => {
  it('starts at the height of the base, at up to four samples a cell and about a million at most', () => {
    const g = buildHeights(land({ base: { biome: 'saltwater', height: -200 } }), INDEX)!
    expect(g.s).toBe(4)
    expect(g.w).toBe(80)
    expect(heightAt(g, 3, 3)).toBe(-200)
    expect(samplesPerCell(400, 400)).toBe(2)
    expect(samplesPerCell(2000, 2000)).toBe(1)
  })

  it('has no heights on a map of space or of a building', () => {
    expect(buildHeights(land({ level: 'galactic' }), INDEX)).toBeNull()
    expect(buildHeights(land({ level: 'architectural' }), INDEX)).toBeNull()
    expect(mapHeightRange(land({ level: 'interior' }))).toBe(0)
  })

  it('applies the areas in order: set, then raise, then lower', () => {
    const g = buildHeights(land({ shapes: [
      square('a', 2, 2, 18, 18, null, { heightMode: 'set', height: 300 }),
      square('b', 4, 4, 16, 16, null, { heightMode: 'raise', height: 200 }),
      square('c', 6, 6, 10, 10, null, { heightMode: 'lower', height: 1000 }),
    ] }), INDEX)!
    expect(heightAt(g, 1, 1)).toBe(0)
    expect(heightAt(g, 3, 3)).toBe(300)
    expect(heightAt(g, 13, 13)).toBe(500)
    expect(heightAt(g, 8, 8)).toBe(-500)
  })

  it('keeps a mountain\'s height under a forest drawn over it, and lifts an island out of the sea', () => {
    const g = buildHeights(land({ base: { biome: 'saltwater', height: -3000 }, shapes: [
      square('isle', 2, 2, 18, 18, 'plain'),
      square('mt', 6, 6, 14, 14, 'rocky', { heightMode: 'raise', height: 2000 }),
      square('wood', 8, 8, 12, 12, 'forest'),
    ] }), INDEX)!
    expect(heightAt(g, 1, 1)).toBe(-3000)
    expect(heightAt(g, 3, 3)).toBe(0)
    expect(heightAt(g, 7, 7)).toBe(2000)
    expect(heightAt(g, 10, 10)).toBe(2000)
  })

  it('shapes a peak highest in its middle and a hill rising from its edge', () => {
    const peak = buildHeights(land({ shapes: [square('p', 0, 0, 20, 20, null, { heightMode: 'raise', height: 1000, profile: 'peak' })] }), INDEX)!
    const mid = heightAt(peak, 10, 10), off = heightAt(peak, 5, 10), edge = heightAt(peak, 0.2, 10)
    expect(mid).toBeGreaterThan(950)
    expect(off).toBeGreaterThan(edge)
    expect(off).toBeLessThan(mid)
    expect(edge).toBeLessThan(100)
    const hill = buildHeights(land({ shapes: [square('h', 0, 0, 20, 20, null, { heightMode: 'raise', height: 1000, profile: 'hill', slope: 4 })] }), INDEX)!
    expect(heightAt(hill, 10, 10)).toBe(1000)
    expect(heightAt(hill, 6, 10)).toBe(1000)
    expect(heightAt(hill, 1, 10)).toBeLessThan(400)
    const basin = buildHeights(land({ shapes: [square('b', 0, 0, 20, 20, null, { heightMode: 'lower', height: 1000, profile: 'basin' })] }), INDEX)!
    expect(heightAt(basin, 10, 10)).toBeLessThan(-990)
    expect(heightAt(basin, 3, 10)).toBeLessThan(heightAt(peak, 3, 10) * -1)
  })

  it('leaves out areas on other layers and keeps every height finite', () => {
    const g = buildHeights(land({ shapes: [{ ...square('x', 2, 2, 8, 8, null, { heightMode: 'raise', height: 500 }), layerId: 'other' }, square('t', 1, 1, 1.01, 1.01, null, { heightMode: 'raise', height: 9 })] }), INDEX)!
    expect(heightAt(g, 5, 5)).toBe(0)
    expect(Array.from(g.data).every(Number.isFinite)).toBe(true)
  })

  it('builds the heights of a 512 by 512 map with many hills quickly', () => {
    const shapes = Array.from({ length: 40 }, (_, n) => square(`h${n}`, (n * 37) % 400, (n * 53) % 400, (n * 37) % 400 + 100, (n * 53) % 400 + 100, null, { heightMode: 'raise', height: 300, profile: n % 2 ? 'hill' : 'peak' }))
    const t0 = performance.now()
    const g = buildHeights(land({ width: 512, height: 512, shapes }), INDEX)!
    const ms = performance.now() - t0
    expect(g.w).toBe(512)
    expect(g.max).toBeGreaterThan(300)
    expect(ms).toBeLessThan(2500)
  })
})

describe('the shading', () => {
  const grid = (values: number[], w: number): HeightGrid => ({ w, h: values.length / w, s: 1, data: Float32Array.from(values), min: Math.min(...values), max: Math.max(...values) })

  it('is white over land above sea level and black below it, as strong as the height, and clear at sea level', () => {
    const px = shadePixels(grid([0, 2000, -4000, 9000], 4), 4000, false)
    expect(px[3]).toBe(0)
    expect([px[4], px[7]]).toEqual([255, Math.round(MAX_TINT / 2 * 255)])
    expect([px[8], px[11]]).toEqual([0, Math.round(MAX_TINT * 255)])
    expect(px[15]).toBe(Math.round(MAX_TINT * 255))
  })

  it('with relief, lights a slope that faces the upper left and darkens one that faces away', () => {
    // A ridge across the middle: rising from the left, falling to the right.
    const row = [0, 500, 1000, 1500, 2000, 1500, 1000, 500, 0]
    const g = grid([...row, ...row, ...row], 9)
    const flat = shadePixels(g, 4000, false), lit = shadePixels(g, 4000, true)
    const k = (9 + 2) * 4, away = (9 + 6) * 4
    expect(lit[k]).toBe(255)
    expect(lit[k + 3]).toBeGreaterThan(flat[k + 3])
    expect(lit[away] === 0 || lit[away + 3] < flat[away + 3]).toBe(true)
  })
})

describe('contour lines', () => {
  it('are a round step, about a quarter of the range', () => {
    expect(contourStep(4000)).toBe(1000)
    expect(contourStep(2000)).toBe(500)
    expect(contourStep(300)).toBe(100)
    expect(contourStep(6500)).toBe(2000)
    expect(contourStep(0)).toBe(0)
  })

  it('ring a cone at each level, the farther out the lower, with index lines at sea level and every fifth', () => {
    const w = 41
    const data: number[] = []
    for (let j = 0; j < w; j += 1) for (let i = 0; i < w; i += 1) data.push(Math.max(0, 1000 - Math.hypot(i - 20, j - 20) * 60))
    const g: HeightGrid = { w, h: w, s: 1, data: Float32Array.from(data), min: 0, max: 1000 }
    const segs = contourLines(g, 250)
    expect(segs.length).toBeGreaterThan(40)
    const radius = (lvl: number) => {
      const near = segs.filter(sg => Math.abs(Math.hypot(sg.x1 - 20.5, sg.y1 - 20.5) - (1000 - lvl) / 60) < 0.8)
      return near.length
    }
    expect(radius(250)).toBeGreaterThan(10)
    expect(radius(750)).toBeGreaterThan(4)
    for (const sg of segs) for (const v of [sg.x1, sg.y1, sg.x2, sg.y2]) expect(Number.isFinite(v)).toBe(true)
    expect(contourLines({ ...g, data: new Float32Array(w * w), max: 0 }, 250)).toEqual([])
  })
})

describe('the cache', () => {
  it('keeps one set of heights for a draft until its land, base or range changes', () => {
    const d = land({ shapes: [square('a', 2, 2, 8, 8, null, { heightMode: 'raise', height: 400 })] })
    const g = heightsOf(d, INDEX)
    expect(heightsOf({ ...d }, INDEX)).toBe(g)
    expect(heightsOf({ ...d, base: { biome: 'plain', height: 10 } }, INDEX)).not.toBe(g)
    expect(heightsOf({ ...d, shapes: [...d.shapes] }, INDEX)).not.toBe(g)
    let made = 0
    const make = () => { made += 1; return made }
    const d2 = land({ shapes: [] })
    expect(keptWithHeights(d2, INDEX, 'k', make)).toBe(1)
    expect(keptWithHeights({ ...d2 }, INDEX, 'k', make)).toBe(1)
    expect(contoursOf(land({ level: 'galactic' }), INDEX)).toEqual([])
  })
})
